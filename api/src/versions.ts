import type { Env } from './env';
import {
    ENTRY_TYPES,
    FILENAME_RE,
    LOOSE_NAME_RE,
    VERSION_RE,
    compareVersions,
    entryTypeOf,
    fail,
    isImageName,
    parseJsonArray,
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
    /**
     * Files to carry over from the item's current approved version instead of
     * uploading them again (`keep_icon`, `keep_screenshots`, `keep_files`)
     */
    keep: { icon: boolean; screenshots: boolean; files: boolean };
}

/** The columns of a version that carrying its files over needs. */
interface PreviousVersion {
    version: string;
    storage_prefix: string;
    icon: string | null;
    screenshots: string;
    files: string;
    files_meta: string | null;
    checksums: string;
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
    const flag = (key: string) => ['1', 'true', 'on'].includes((text(key) ?? '').toLowerCase());

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
        keep: { icon: flag('keep_icon'), screenshots: flag('keep_screenshots'), files: flag('keep_files') },
    };
}

/** Key of one file of a version in R2. */
export function objectKey(version: { storage_prefix: string }, name: string): string {
    return `${version.storage_prefix}/${name}`;
}

/**
 * Validates, stores the files in R2 and inserts the version as `pending_scan`.
 *
 * `imported` relaxes the name rules and limits for apps that come from the old
 * catalog repo, and lets them skip the moderator after a clean scan.
 *
 * With `keep`, the icon, screenshots or extra files of the item's approved
 * version are copied into this one inside R2, so a new release does not lose
 * them when the author attaches only what changed.
 */
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

    // Devices get the highest approved version (promoteVersion), so a new one
    // has to be higher than every earlier one that can still be approved.
    // Imports bring the history the repo had, in any order
    if (!imported) {
        const { results: earlier } = await env.DB.prepare(
            `SELECT version FROM versions WHERE app_id = ? AND status NOT IN ('rejected', 'infected')`,
        )
            .bind(app.id)
            .all<{ version: string }>();
        const higher = earlier
            .map((e) => e.version)
            .filter((v) => (compareVersions(input.version, v) ?? 1) <= 0)
            .sort((a, b) => compareVersions(b, a) ?? 0)[0];
        if (higher) fail(409, `version ${input.version} must be higher than ${higher}`);
    }

    // keep_*: files of the approved version that this one reuses. A newly
    // uploaded file with the same name wins over the kept one
    let previous: PreviousVersion | null = null;
    if (input.keep.icon || input.keep.screenshots || input.keep.files) {
        previous = await env.DB.prepare(
            `SELECT v.version, v.storage_prefix, v.icon, v.screenshots, v.files, v.files_meta, v.checksums
               FROM apps a JOIN versions v ON v.id = a.latest_version_id WHERE a.id = ?`,
        )
            .bind(app.id)
            .first<PreviousVersion>();
        if (!previous) fail(409, 'there is no approved version to keep files from');
    }
    const notIn = (names: string[], taken: File[]) => names.filter((name) => !taken.some((f) => f.name === name));
    const icon = input.icon?.name ?? (input.keep.icon ? previous!.icon : null);
    const screenshots = [
        ...(input.keep.screenshots ? notIn(parseJsonArray<string>(previous!.screenshots), input.screenshots) : []),
        ...input.screenshots.map((f) => f.name),
    ];
    const files = [
        ...(input.keep.files
            ? notIn(parseJsonArray<string>(previous!.files), [...input.files, ...(input.entry ? [input.entry] : [])])
            : []),
        ...input.files.map((f) => f.name),
    ];
    if (files.length > maxExtra) fail(400, `at most ${maxExtra} extra files, kept ones included`);
    if (screenshots.length > maxShots) fail(400, `at most ${maxShots} screenshots, kept ones included`);
    const kept = [...new Set([icon, ...screenshots, ...files])].filter(
        (name): name is string => !!name && !unique.has(name),
    );
    // Descriptions of extra files (imported items) stay with the files they describe
    const keptMeta = parseJsonArray<{ location?: unknown }>(previous?.files_meta ?? null).filter(
        (entry) => typeof entry.location === 'string' && files.includes(entry.location) && kept.includes(entry.location),
    );

    // The id keeps the folder unique even if a slug is ever reused after a
    // delete; the slug and version make it readable in the R2 dashboard
    const storagePrefix = `${app.id}-${app.slug}/v/${input.version}`;
    const row = await env.DB.prepare(
        `INSERT INTO versions (app_id, version, keira_version, entry_type, entry_file, files, files_meta, icon,
                               screenshots, changelog, auto_approve, storage_prefix)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
        .bind(
            app.id,
            input.version,
            input.keiraVersion,
            input.entryType,
            input.entry?.name ?? null,
            JSON.stringify(files),
            keptMeta.length ? JSON.stringify(keptMeta) : null,
            icon,
            JSON.stringify(screenshots),
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
        const recorded = parseJsonArray<{ name: string; size: number; sha256: string }>(previous?.checksums ?? null);
        for (const name of kept) {
            const object = await env.FILES.get(objectKey(previous!, name));
            if (!object) fail(409, `"${name}" of version ${previous!.version} is missing; attach it again`);
            const data = await object.arrayBuffer();
            await env.FILES.put(objectKey({ storage_prefix: storagePrefix }, name), data);
            // Processing may have replaced an image with a smaller copy, so a
            // recorded checksum is reused only when the size still matches
            const known = recorded.find((c) => c.name === name && c.size === data.byteLength);
            checksums.push({ name, size: data.byteLength, sha256: known?.sha256 ?? (await sha256Hex(data)) });
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

/**
 * The apps update that goes with approving a version: publishes the item
 * (a hidden one stays hidden) and makes this its latest version, unless the
 * item already has a higher one. Approving 1.1 after 1.2 adds 1.1 to the
 * history, while devices keep getting 1.2. Versions that do not compare
 * (VERSION_RE allows any short name) keep the old rule: the newest approval wins.
 */
export async function promoteVersion(
    env: Env,
    version: { id: number; app_id: number; version: string },
): Promise<{ statement: D1PreparedStatement; latest: boolean }> {
    const current = await env.DB.prepare(
        `SELECT v.id, v.version FROM apps a JOIN versions v ON v.id = a.latest_version_id WHERE a.id = ?`,
    )
        .bind(version.app_id)
        .first<{ id: number; version: string }>();
    const latest = !current || current.id === version.id || (compareVersions(version.version, current.version) ?? 1) >= 0;
    const statement = env.DB.prepare(
        `UPDATE apps SET status = CASE WHEN status = 'hidden' THEN 'hidden' ELSE 'published' END,
                         latest_version_id = CASE WHEN ? THEN ? ELSE latest_version_id END,
                         published_at = COALESCE(published_at, datetime('now')),
                         updated_at = datetime('now')
          WHERE id = ?`,
    ).bind(latest ? 1 : 0, version.id, version.app_id);
    return { statement, latest };
}

export async function deleteVersionFiles(env: Env, storagePrefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
        const listed = await env.FILES.list({ prefix: `${storagePrefix}/`, cursor });
        if (listed.objects.length) await env.FILES.delete(listed.objects.map((o) => o.key));
        cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
}
