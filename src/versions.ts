import type { Env } from './env';
import {
    ENTRY_TYPES,
    FILENAME_RE,
    LOOSE_NAME_RE,
    VERSION_RE,
    entryTypeOf,
    fail,
    isImageName,
    sha256Hex,
    type EntryType,
} from './util';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_EXTRA_FILES = 16;
const MAX_SCREENSHOTS = 6;
// Imports carry whole firmware images and big screenshot sets that were
// already accepted into the repo
const IMPORT_MAX_FILE_BYTES = 32 * 1024 * 1024;
const IMPORT_MAX_EXTRA_FILES = 64;
const IMPORT_MAX_SCREENSHOTS = 32;

export interface VersionInput {
    kind: 'app' | 'wallpaper' | 'mod';
    version: string;
    keiraVersion: string | null;
    entryType: EntryType | null;
    changelog: string | null;
    entry: File | null;
    files: File[];
    icon: File | null;
    screenshots: File[];
}

/** Reads the version part of a multipart upload; the same fields serve uploads and imports. */
export function readVersionForm(form: FormData, kind: VersionInput['kind']): VersionInput {
    const text = (key: string): string | null => {
        const value = form.get(key);
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    };
    const filesOf = (key: string): File[] =>
        form.getAll(key).filter((item): item is File => typeof item !== 'string' && item.size > 0);

    const version = text('version');
    if (!version || !VERSION_RE.test(version)) fail(400, 'version is required (e.g. 1.0.0)');
    const changelog = text('changelog');
    if (changelog && changelog.length > 20000) fail(400, 'changelog is too long');

    const entries = filesOf('entry');
    const icons = filesOf('icon');
    if (entries.length > 1) fail(400, 'at most one entry file');
    if (icons.length > 1) fail(400, 'at most one icon');

    let keiraVersion: string | null = null;
    let entryType: EntryType | null = null;
    if (kind === 'mod') {
        if (entries.length) fail(400, 'mods have no entry file; send model files as `files`');
    } else {
        keiraVersion = text('keira_version');
        if (!keiraVersion || !VERSION_RE.test(keiraVersion)) fail(400, 'keira_version is required (e.g. 1.0.0)');
        entryType = text('entry_type') as EntryType | null;
        if (!entryType || !ENTRY_TYPES.includes(entryType)) {
            fail(400, `entry_type must be one of ${ENTRY_TYPES.join(', ')}`);
        }
        if (entries.length !== 1) fail(400, 'exactly one entry file is required');
    }

    return {
        kind,
        version,
        keiraVersion,
        entryType,
        changelog,
        entry: entries[0] ?? null,
        files: filesOf('files'),
        icon: icons[0] ?? null,
        screenshots: filesOf('screenshots'),
    };
}

/**
 * Validates, stores the files in R2 and inserts the version as `pending_scan`.
 *
 * `imported` relaxes the name rules and limits for apps that come from the old
 * catalog repo, and lets them skip the moderator after a clean scan.
 */
/** Key of one file of a version in R2. */
export function objectKey(version: { storage_prefix: string }, name: string): string {
    return `${version.storage_prefix}/${name}`;
}

export async function createVersion(
    env: Env,
    app: { id: number; slug: string },
    input: VersionInput,
    { imported = false }: { imported?: boolean } = {},
): Promise<number> {
    const nameRe = imported ? LOOSE_NAME_RE : FILENAME_RE;
    const maxFile = imported ? IMPORT_MAX_FILE_BYTES : MAX_FILE_BYTES;
    const maxExtra = imported ? IMPORT_MAX_EXTRA_FILES : MAX_EXTRA_FILES;
    const maxShots = imported ? IMPORT_MAX_SCREENSHOTS : MAX_SCREENSHOTS;

    if (input.files.length > maxExtra) fail(400, `at most ${maxExtra} extra files`);
    if (input.screenshots.length > maxShots) fail(400, `at most ${maxShots} screenshots`);

    // The icon is usually one of the screenshots too: one stored file, two roles
    const unique = new Map<string, File>();
    const roles = [...(input.entry ? [input.entry] : []), ...input.files, ...(input.icon ? [input.icon] : []), ...input.screenshots];
    let total = 0;
    for (const file of roles) {
        if (!nameRe.test(file.name)) fail(400, `bad file name "${file.name}": use letters, digits, . _ -`);
        const seen = unique.get(file.name);
        if (seen) {
            if (seen.size !== file.size) fail(400, `file name "${file.name}" is used for two different files`);
            continue;
        }
        if (file.size > maxFile) fail(413, `"${file.name}" is larger than ${maxFile} bytes`);
        unique.set(file.name, file);
        total += file.size;
    }
    if (!imported && total > MAX_UPLOAD_BYTES) fail(413, `upload is larger than ${MAX_UPLOAD_BYTES} bytes`);
    if (input.entry && entryTypeOf(input.entry.name) !== input.entryType) {
        fail(400, `entry file "${input.entry.name}" does not match entry_type ${input.entryType}`);
    }
    for (const image of [...(input.icon ? [input.icon] : []), ...input.screenshots]) {
        if (!isImageName(image.name)) fail(400, `"${image.name}" must be a PNG or JPEG`);
    }

    const duplicate = await env.DB.prepare(`SELECT 1 FROM versions WHERE app_id = ? AND version = ?`)
        .bind(app.id, input.version)
        .first();
    if (duplicate) fail(409, `version ${input.version} already exists`);

    // The id keeps the folder unique even if a slug is ever reused after a
    // delete; the slug and version make it readable in the R2 dashboard
    const storagePrefix = `${app.id}-${app.slug}/v/${input.version}`;
    const row = await env.DB.prepare(
        `INSERT INTO versions (app_id, version, keira_version, entry_type, entry_file, files, icon, screenshots,
                               changelog, auto_approve, storage_prefix)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
        .bind(
            app.id,
            input.version,
            input.keiraVersion,
            input.entryType,
            input.entry?.name ?? null,
            JSON.stringify(input.files.map((f) => f.name)),
            input.icon?.name ?? null,
            JSON.stringify(input.screenshots.map((f) => f.name)),
            input.changelog,
            imported ? 1 : 0,
            storagePrefix,
        )
        .first<{ id: number }>();
    const versionId = row!.id;

    try {
        const checksums = [];
        for (const file of unique.values()) {
            const data = await file.arrayBuffer();
            await env.FILES.put(objectKey({ storage_prefix: storagePrefix }, file.name), data);
            checksums.push({ name: file.name, size: file.size, sha256: await sha256Hex(data) });
        }
        await env.DB.prepare(`UPDATE versions SET checksums = ? WHERE id = ?`)
            .bind(JSON.stringify(checksums), versionId)
            .run();
    } catch (error) {
        // A version without its files must not reach the processing queue
        await env.DB.prepare(`DELETE FROM versions WHERE id = ?`).bind(versionId).run();
        await deleteVersionFiles(env, storagePrefix);
        throw error;
    }
    return versionId;
}

export async function deleteVersionFiles(env: Env, storagePrefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
        const listed = await env.FILES.list({ prefix: `${storagePrefix}/`, cursor });
        if (listed.objects.length) await env.FILES.delete(listed.objects.map((o) => o.key));
        cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
}
