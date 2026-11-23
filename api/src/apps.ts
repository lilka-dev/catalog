import { Hono, type Context } from 'hono';
import type { AppEnv, Env, User } from './env';
import {
    LOOSE_NAME_RE,
    contentTypeOf,
    SLUG_RE,
    dispatch,
    fail,
    isUniqueViolation,
    parseJsonArray,
    readJson,
    requireUser,
    type EntryType,
} from './util';
import { MAX_UPLOAD_BYTES, createVersion, deleteVersionFiles, objectKey, readVersionForm } from './versions';
import { can } from './permissions';
import { logStatement, type LogEntry } from './log';

const PAGE_SIZE = 24;
/** Unreviewed uploads per user: keeps one account from flooding the queue. */
const MAX_PENDING_PER_USER = 5;
/** Apps an account created, drafts included: stops slug squatting and spam. */
const MAX_APPS_PER_USER = 20;
/** New apps, wallpapers and mods per account in any 24 hours. */
export const MAX_NEW_ITEMS_PER_DAY = 3;
/** Open reports per account; one per app is enough to reach a moderator. */
const MAX_OPEN_REPORTS_PER_USER = 10;
const MAX_PAGE = 1000;

export interface AppRow {
    id: number;
    slug: string;
    owner_id: number;
    kind: 'app' | 'wallpaper' | 'mod';
    author: string | null;
    name_uk: string | null;
    name_en: string | null;
    short_uk: string | null;
    short_en: string | null;
    description_uk: string | null;
    description_en: string | null;
    sources_type: string | null;
    sources_url: string;
    license: string | null;
    status: 'draft' | 'published' | 'hidden';
    latest_version_id: number | null;
    /** Hidden by a moderator: only a moderator publishes it again (migration 0010). */
    mod_hidden: number;
    hidden_note: string | null;
    created_at: string;
    updated_at: string;
    owner_login: string;
    owner_avatar: string | null;
}

export interface VersionRow {
    id: number;
    app_id: number;
    version: string;
    keira_version: string | null;
    entry_type: EntryType | null;
    entry_file: string | null;
    files: string;
    files_meta: string | null;
    icon: string | null;
    screenshots: string;
    changelog: string | null;
    changelog_en: string | null;
    checksums: string;
    /** Names copied from the approved version by keep_* (migration 0010). */
    kept: string | null;
    status: 'pending_scan' | 'pending_review' | 'approved' | 'rejected' | 'infected';
    auto_approve: number;
    icon_min: string | null;
    package: string | null;
    security: string | null;
    processed_at: string | null;
    storage_prefix: string;
    scan_detail: string | null;
    review_note: string | null;
    created_at: string;
    approved_at: string | null;
}

export const APP_SELECT = `
    SELECT a.*, u.login AS owner_login, u.avatar_url AS owner_avatar
      FROM apps a JOIN users u ON u.id = a.owner_id`;

/** The rating block of listing.json and of PUT /apps/:slug/rating. */
export function ratingSummary(count: number, total: number | null) {
    return { average: count && total !== null ? Math.round((total / count) * 10) / 10 : null, count };
}

export function fileUrl(env: Env, slug: string, versionId: number, name: string): string {
    return `${env.PUBLIC_URL.replace(/\/$/, '')}/files/${slug}/${versionId}/${encodeURIComponent(name)}`;
}

/** The author line of the catalog: free text for imported apps, the GitHub login otherwise. */
export function displayAuthor(a: Pick<AppRow, 'author' | 'owner_login'>): string {
    return a.author ?? `@${a.owner_login}`;
}

export function kindDir(kind: AppRow['kind']): 'apps' | 'wallpapers' | 'mods' {
    return kind === 'app' ? 'apps' : kind === 'wallpaper' ? 'wallpapers' : 'mods';
}

function localized(uk: string | null, en: string | null): Record<string, string> {
    const out: Record<string, string> = {};
    if (uk) out.uk = uk;
    if (en) out.en = en;
    return out;
}

export function serializeVersion(env: Env, slug: string, v: VersionRow, detailed: boolean) {
    const files = parseJsonArray<string>(v.files);
    const screenshots = parseJsonArray<string>(v.screenshots);
    const url = (name: string) => fileUrl(env, slug, v.id, name);
    const ref = (name: string | null) => (name ? { name, url: url(name) } : null);
    let security: unknown = null;
    try {
        security = v.security ? JSON.parse(v.security) : null;
    } catch {
        security = null;
    }
    return {
        id: v.id,
        version: v.version,
        keira_version: v.keira_version,
        entry_type: v.entry_type,
        status: v.status,
        changelog: v.changelog,
        created_at: v.created_at,
        approved_at: v.approved_at,
        entry: ref(v.entry_file),
        files: files.map((name) => ({ name, url: url(name) })),
        icon: ref(v.icon),
        icon_min: ref(v.icon_min),
        package: ref(v.package),
        screenshots: screenshots.map((name) => ({ name, url: url(name) })),
        checksums: parseJsonArray(v.checksums),
        kept: parseJsonArray<string>(v.kept),
        security,
        ...(detailed ? { scan_detail: v.scan_detail, review_note: v.review_note } : {}),
    };
}

export function serializeApp(env: Env, a: AppRow, latest: VersionRow | null) {
    return {
        slug: a.slug,
        kind: a.kind,
        catalog_path: `${kindDir(a.kind)}/${a.slug}`,
        status: a.status,
        // A moderator hid it: the owner sees why and cannot bring it back
        mod_hidden: !!a.mod_hidden,
        hidden_note: a.mod_hidden ? a.hidden_note : null,
        author: displayAuthor(a),
        name: localized(a.name_uk, a.name_en),
        short_description: localized(a.short_uk, a.short_en),
        description: localized(a.description_uk, a.description_en),
        sources_type: a.sources_type,
        sources_url: a.sources_url,
        license: a.license,
        owner: { login: a.owner_login, avatar_url: a.owner_avatar },
        latest_version: latest ? serializeVersion(env, a.slug, latest, false) : null,
        created_at: a.created_at,
        updated_at: a.updated_at,
    };
}

/** Latest approved version of each app, in one query. */
export async function latestApproved(env: Env, appIds: number[]): Promise<Map<number, VersionRow>> {
    const result = new Map<number, VersionRow>();
    if (appIds.length === 0) return result;
    // Primary-key lookups through apps.latest_version_id (migration 0003)
    const { results } = await env.DB.prepare(
        `SELECT v.* FROM apps a JOIN versions v ON v.id = a.latest_version_id
          WHERE a.id IN (${appIds.map(() => '?').join(',')})`,
    )
        .bind(...appIds)
        .all<VersionRow>();
    for (const v of results) result.set(v.app_id, v);
    return result;
}

export async function findApp(env: Env, slug: string): Promise<AppRow | null> {
    return env.DB.prepare(`${APP_SELECT} WHERE a.slug = ?`).bind(slug).first<AppRow>();
}

/** Staff, and authors a moderator marked trusted, skip the per-account item limits. */
function limitsLifted(user: User): boolean {
    return can(user, 'limits.exempt') || !!user.trusted;
}

function canManage(user: User | null, app: AppRow): boolean {
    return !!user && user.role !== 'banned' && (user.id === app.owner_id || can(user, 'items.edit'));
}

/* ------------------------------------------------------------ input ------ */

export type LocalizedInput = string | { uk?: unknown; en?: unknown } | undefined;

export function readLocalized(
    value: LocalizedInput,
    field: string,
    max: number,
    { trim = true }: { trim?: boolean } = {},
): { uk: string | null; en: string | null } {
    // A bare string is Ukrainian: that is the catalog's default language
    const raw = typeof value === 'string' ? { uk: value } : (value ?? {});
    const pick = (text: unknown, lang: string): string | null => {
        if (text === undefined || text === null || text === '') return null;
        if (typeof text !== 'string') fail(400, `${field}.${lang} must be a string`);
        // Imports keep the repo's Markdown byte for byte, trailing newline included
        const trimmed = trim ? text.trim() : text;
        if (trimmed.length > max) fail(400, `${field}.${lang} is longer than ${max} characters`);
        return trimmed.trim() ? trimmed : null;
    };
    return { uk: pick(raw.uk, 'uk'), en: pick(raw.en, 'en') };
}

export function readSourcesUrl(value: unknown, { strict = true } = {}): string {
    if (typeof value !== 'string') fail(400, 'sources_url is required');
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        fail(400, 'sources_url must be a URL');
    }
    // Some repo apps link to plain-http pages; new submissions must use https
    if (url.protocol !== 'https:' && (strict || url.protocol !== 'http:')) fail(400, 'sources_url must use https');
    return url.toString();
}

/** `git` for code hosting, `url` for anything else; imports keep what the manifest said. */
export function sourcesTypeOf(url: string): string {
    return /^https:\/\/(github\.com|gitlab\.com|codeberg\.org)\//.test(url) ? 'git' : 'url';
}

export function readLicense(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 64) fail(400, 'license must be a short string');
    return value.trim();
}

export function readKind(value: unknown): AppRow['kind'] {
    if (value !== 'app' && value !== 'wallpaper' && value !== 'mod') fail(400, 'kind must be app, wallpaper or mod');
    return value;
}

interface AppInput {
    slug?: unknown;
    kind?: unknown;
    name?: LocalizedInput;
    short_description?: LocalizedInput;
    description?: LocalizedInput;
    sources_url?: unknown;
    license?: unknown;
    status?: unknown;
    /** With status hidden, by a moderator: the reason the owner sees. */
    note?: unknown;
    author?: unknown;
    owner?: unknown;
}

/* ----------------------------------------------------------- routes ------ */

export const apps = new Hono<AppEnv>();

// Reads need a session too: anonymous visitors use the Pages mirror, and an
// open list here would be database work anyone could repeat for free
apps.get('/', async (c) => {
    requireUser(c);
    const kind = c.req.query('kind');
    const q = c.req.query('q')?.trim();
    // A huge page would overflow SQLite's OFFSET into an internal error
    const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1));

    const where = [`a.status = 'published'`];
    const params: unknown[] = [];
    if (kind) {
        where.push('a.kind = ?');
        params.push(readKind(kind));
    }
    if (q) {
        where.push(`(a.name_uk LIKE ? OR a.name_en LIKE ? OR a.short_uk LIKE ? OR a.short_en LIKE ?)`);
        const pattern = `%${q.replace(/[%_]/g, '')}%`;
        params.push(pattern, pattern, pattern, pattern);
    }
    const sql = `${APP_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);

    const { results } = await c.env.DB.prepare(sql)
        .bind(...params)
        .all<AppRow>();
    const items = results.slice(0, PAGE_SIZE);
    const latest = await latestApproved(
        c.env,
        items.map((a) => a.id),
    );
    return c.json({
        page,
        has_more: results.length > PAGE_SIZE,
        items: items.map((a) => serializeApp(c.env, a, latest.get(a.id) ?? null)),
    });
});

apps.get('/:slug', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app) fail(404, 'app not found');
    const manage = canManage(user, app);
    if (app.status !== 'published' && !manage) fail(404, 'app not found');

    const { results } = await c.env.DB.prepare(
        `SELECT * FROM versions WHERE app_id = ? ${manage ? '' : `AND status = 'approved'`}
          ORDER BY id DESC`,
    )
        .bind(app.id)
        .all<VersionRow>();
    // What devices get: the highest approved version, not the newest approval
    const latest = results.find((v) => v.id === app.latest_version_id) ?? null;

    return c.json({
        ...serializeApp(c.env, app, latest),
        can_manage: manage,
        versions: results.map((v) => serializeVersion(c.env, app.slug, v, manage)),
    });
});

apps.post('/', async (c) => {
    const user = requireUser(c);
    const body = await readJson<AppInput>(c);

    if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) {
        fail(400, 'slug must be 2-48 characters: lowercase letters, digits and dashes');
    }
    const kind = readKind(body.kind);
    const name = readLocalized(body.name, 'name', 64);
    const short = readLocalized(body.short_description, 'short_description', 200);
    const description = readLocalized(body.description, 'description', 20000);
    if (!name.uk && !name.en) fail(400, 'name is required');
    if (!short.uk && !short.en) fail(400, 'short_description is required');
    const sources = readSourcesUrl(body.sources_url);
    const license = readLicense(body.license);

    const exists = await c.env.DB.prepare(`SELECT 1 FROM apps WHERE slug = ?`).bind(body.slug).first();
    if (exists) fail(409, 'slug is taken');
    if (!limitsLifted(user)) {
        // Counted from the table: it holds across Worker instances and over a
        // whole day, which the per-minute rate limiters cannot do. Both count
        // what the user created, not imports handed over to them (migration 0007)
        const counts = await c.env.DB.prepare(
            `SELECT COUNT(*) AS total, COALESCE(SUM(created_at > datetime('now', '-1 day')), 0) AS today
               FROM apps WHERE created_by = ?`,
        )
            .bind(user.id)
            .first<{ total: number; today: number }>();
        if ((counts?.total ?? 0) >= MAX_APPS_PER_USER) fail(429, `at most ${MAX_APPS_PER_USER} apps per account`);
        // The 4th item within 24 hours is refused: 3 are allowed
        if ((counts?.today ?? 0) >= MAX_NEW_ITEMS_PER_DAY) {
            fail(429, `at most ${MAX_NEW_ITEMS_PER_DAY} new items per day, try again tomorrow`);
        }
    }

    try {
        await c.env.DB.prepare(
            `INSERT INTO apps (slug, owner_id, created_by, kind, name_uk, name_en, short_uk, short_en,
                               description_uk, description_en, sources_type, sources_url, license)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                body.slug,
                user.id,
                user.id,
                kind,
                name.uk,
                name.en,
                short.uk,
                short.en,
                description.uk,
                description.en,
                sourcesTypeOf(sources),
                sources,
                license,
            )
            .run();
    } catch (error) {
        // Two requests for the same slug: the check above let both through
        if (isUniqueViolation(error)) fail(409, 'slug is taken');
        throw error;
    }

    const app = await findApp(c.env, body.slug);
    return c.json(serializeApp(c.env, app!, null), 201);
});

apps.patch('/:slug', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || !canManage(user, app)) fail(404, 'app not found');
    const body = await readJson<AppInput>(c);

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => {
        sets.push(`${column} = ?`);
        params.push(value);
    };

    // Imported items were checked against the import's limits, longer than a
    // new submission's; a moderator editing one must be able to save it
    const mod = can(user, 'items.edit');
    // Staff working on someone else's item: that is moderation, and it is logged
    const moderating = mod && user.id !== app.owner_id;
    const log: LogEntry[] = [];
    const edited: string[] = [];
    if (body.name !== undefined) {
        const name = readLocalized(body.name, 'name', mod ? 200 : 64);
        if (!name.uk && !name.en) fail(400, 'name cannot be empty');
        set('name_uk', name.uk);
        set('name_en', name.en);
        edited.push('name');
    }
    if (body.short_description !== undefined) {
        const short = readLocalized(body.short_description, 'short_description', mod ? 1000 : 200);
        if (!short.uk && !short.en) fail(400, 'short_description cannot be empty');
        set('short_uk', short.uk);
        set('short_en', short.en);
        edited.push('short_description');
    }
    if (body.description !== undefined) {
        const description = readLocalized(body.description, 'description', mod ? 100000 : 20000);
        set('description_uk', description.uk);
        set('description_en', description.en);
        edited.push('description');
    }
    if (body.sources_url !== undefined) {
        const sources = readSourcesUrl(body.sources_url, { strict: !mod });
        set('sources_url', sources);
        set('sources_type', sourcesTypeOf(sources));
        edited.push('sources_url');
    }
    if (body.license !== undefined) {
        set('license', readLicense(body.license));
        edited.push('license');
    }
    if (moderating && edited.length) log.push({ action: 'item.edit', detail: { fields: edited } });
    if (body.status !== undefined) {
        if (body.status === 'hidden') {
            set('status', 'hidden');
            // The owner hiding an item a moderator hid changes nothing about
            // who may bring it back: mod_hidden is left as it is
            if (moderating) {
                if (body.note !== undefined && body.note !== null && (typeof body.note !== 'string' || body.note.length > 1000)) {
                    fail(400, 'note must be text up to 1000 characters');
                }
                const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
                set('mod_hidden', 1);
                set('hidden_note', note);
                log.push({ action: 'item.hide', detail: note ? { note } : null });
            }
        } else if (body.status === 'published') {
            // Otherwise "Return to catalog" would undo a moderator's decision
            if (app.mod_hidden && !mod) fail(403, 'a moderator hid this item; only a moderator can publish it again');
            if (!app.latest_version_id) fail(409, 'app has no approved version yet');
            set('status', 'published');
            set('mod_hidden', 0);
            set('hidden_note', null);
            if (moderating) log.push({ action: 'item.publish' });
        } else {
            fail(400, 'status must be hidden or published');
        }
    }
    // Imported apps belong to the catalog account and show the historic author
    // name; a moderator hands them over once the author signs in
    if (body.author !== undefined || body.owner !== undefined) {
        if (!mod) fail(403, 'only moderators can change the author or owner');
        if (body.author !== undefined) {
            if (body.author !== null && (typeof body.author !== 'string' || body.author.length > 64)) {
                fail(400, 'author must be a short string or null');
            }
            const author = body.author ? (body.author as string).trim() : null;
            set('author', author);
            if (author !== app.author) log.push({ action: 'item.author', detail: { from: app.author, to: author } });
        }
        if (body.owner !== undefined) {
            if (typeof body.owner !== 'string') fail(400, 'owner must be a GitHub login');
            const owner = await c.env.DB.prepare(`SELECT id, login, role FROM users WHERE login = ? COLLATE NOCASE`)
                .bind(body.owner)
                .first<{ id: number; login: string; role: string }>();
            if (!owner) fail(404, 'that user has never signed in');
            if (owner.role === 'banned') fail(409, 'that user is banned');
            set('owner_id', owner.id);
            if (owner.id !== app.owner_id) {
                log.push({
                    action: 'item.owner',
                    user: { id: owner.id, login: owner.login },
                    detail: { from: app.owner_login, to: owner.login },
                });
            }
        }
    }
    if (sets.length === 0) fail(400, 'nothing to update');

    sets.push(`updated_at = datetime('now')`);
    await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE apps SET ${sets.join(', ')} WHERE id = ?`).bind(...params, app.id),
        // An entry names the owner unless it is about someone else (a hand-over)
        ...log.map((entry) => logStatement(c.env, user, { user: { id: app.owner_id, login: app.owner_login }, ...entry, app })),
    ]);

    // The device mirror is rebuilt from the API; it has to pick this up
    if (app.status === 'published' || body.status !== undefined) {
        c.executionCtx.waitUntil(dispatch(c.env, c.env.CATALOG_REPO, 'api-sync', { slug: app.slug }));
    }
    const updated = await findApp(c.env, app.slug);
    const latest = await latestApproved(c.env, [app.id]);
    return c.json(serializeApp(c.env, updated!, latest.get(app.id) ?? null));
});

/**
 * Deletes an item that never had an approved version: a draft made by
 * mistake, or one whose uploads were all rejected. It frees the slug and the
 * place in the per-account limit. Anything that was ever approved can only be
 * hidden here; deleting it for good is for admins (DELETE /mod/apps/:slug).
 * The body repeats the slug, so a stray request cannot delete anything.
 */
apps.delete('/:slug', async (c) => {
    const user = requireUser(c);
    const slug = c.req.param('slug');
    const app = await findApp(c.env, slug);
    if (!app || !canManage(user, app)) fail(404, 'app not found');
    const { confirm } = await readJson<{ confirm?: unknown }>(c).catch(() => ({ confirm: undefined }));
    if (confirm !== slug) fail(400, 'confirm must repeat the slug');
    const { results } = await c.env.DB.prepare(`SELECT status, storage_prefix FROM versions WHERE app_id = ?`)
        .bind(app.id)
        .all<{ status: string; storage_prefix: string }>();
    if (app.latest_version_id || results.some((v) => v.status === 'approved')) {
        fail(409, 'this item was approved before; hide it instead');
    }
    // An approval in the meantime sets latest_version_id, and then nothing is deleted
    const deleted = await c.env.DB.prepare(`DELETE FROM apps WHERE id = ? AND latest_version_id IS NULL`).bind(app.id).run();
    if (!deleted.meta.changes) fail(409, 'a version was approved in the meantime; hide the item instead');
    if (user.id !== app.owner_id) {
        await logStatement(c.env, user, {
            action: 'item.delete',
            app,
            user: { id: app.owner_id, login: app.owner_login },
            detail: { draft: true },
        }).run();
    }
    for (const v of results) await deleteVersionFiles(c.env, v.storage_prefix);
    return c.json({ ok: true });
});

/**
 * Upload of a new version: multipart form with
 *   version, keira_version, entry_type, changelog  — text fields (mods: version, changelog)
 *   entry (1 file, none for mods), files (0..16), icon (0..1), screenshots (0..6)
 *
 * Files are stored right away but stay private until processing is clean and a
 * moderator approves the version.
 */
apps.post('/:slug/versions', async (c) => {
    const user = requireUser(c);
    // Each upload can be 24 MB of R2 writes; staff are exempt for imports
    if (!can(user, 'limits.exempt')) {
        const { success } = await c.env.UPLOAD_LIMITER.limit({ key: `user:${user.id}` });
        if (!success) fail(429, 'too many uploads in a short time, try again in a minute');
    }
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || !canManage(user, app)) fail(404, 'app not found');

    const length = Number(c.req.header('Content-Length') ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) fail(413, `upload is larger than ${MAX_UPLOAD_BYTES} bytes`);

    if (!limitsLifted(user)) {
        const pending = await c.env.DB.prepare(
            `SELECT COUNT(*) AS n FROM versions v JOIN apps a ON a.id = v.app_id
              WHERE a.owner_id = ? AND v.status IN ('pending_scan', 'pending_review')`,
        )
            .bind(app.owner_id)
            .first<{ n: number }>();
        if ((pending?.n ?? 0) >= MAX_PENDING_PER_USER) fail(429, 'too many versions are waiting for review');
    }

    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        fail(400, 'body must be multipart/form-data');
    }

    const versionId = await createVersion(c.env, app, readVersionForm(form, app.kind));
    c.executionCtx.waitUntil(dispatch(c.env, c.env.SCAN_REPO, 'scan-version', { version_id: versionId }));

    const created = await c.env.DB.prepare(`SELECT * FROM versions WHERE id = ?`)
        .bind(versionId)
        .first<VersionRow>();
    return c.json(serializeVersion(c.env, app.slug, created!, true), 201);
});

/**
 * Withdraws an upload that waits for the scan or the moderator, e.g. one sent
 * with the wrong file. It frees its place among the 5 waiting uploads and its
 * number. The processor skips a version that is gone (scripts/process.py).
 */
apps.delete('/:slug/versions/:id', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || !canManage(user, app)) fail(404, 'app not found');
    const version = await c.env.DB.prepare(
        `SELECT id, version, status, storage_prefix FROM versions WHERE id = ? AND app_id = ?`,
    )
        .bind(Number(c.req.param('id')), app.id)
        .first<{ id: number; version: string; status: string; storage_prefix: string }>();
    if (!version) fail(404, 'version not found');
    if (version.status !== 'pending_scan' && version.status !== 'pending_review') {
        fail(409, `version is ${version.status}; only an upload waiting for review can be withdrawn`);
    }
    const deleted = await c.env.DB.prepare(
        `DELETE FROM versions WHERE id = ? AND status IN ('pending_scan', 'pending_review')`,
    )
        .bind(version.id)
        .run();
    if (!deleted.meta.changes) fail(409, 'the version was reviewed in the meantime');
    if (user.id !== app.owner_id) {
        await logStatement(c.env, user, {
            action: 'version.withdraw',
            app,
            user: { id: app.owner_id, login: app.owner_login },
            version,
        }).run();
    }
    // Awaited, not left to waitUntil: a new upload with the same number reuses the folder
    await deleteVersionFiles(c.env, version.storage_prefix);
    return c.json({ ok: true });
});

/**
 * One rating per user and app, changed by sending it again.
 *
 * Costs one app lookup, one upsert and one read of this app's ratings, and
 * nothing is dispatched: the averages reach listing.json with the next hourly
 * mirror run, while the site shows the new vote at once from this response.
 */
apps.put('/:slug/rating', async (c) => {
    const user = requireUser(c);
    const { stars } = await readJson<{ stars?: unknown }>(c);
    if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) {
        fail(400, 'stars must be an integer from 1 to 5');
    }
    const app = await c.env.DB.prepare(`SELECT id, owner_id, status FROM apps WHERE slug = ?`)
        .bind(c.req.param('slug'))
        .first<{ id: number; owner_id: number; status: string }>();
    if (!app || app.status !== 'published') fail(404, 'app not found');
    if (app.owner_id === user.id) fail(403, 'cannot rate your own app');
    const [, summary] = await c.env.DB.batch<{ n: number; total: number | null }>([
        c.env.DB.prepare(
            `INSERT INTO ratings (app_id, user_id, stars) VALUES (?, ?, ?)
             ON CONFLICT (app_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = datetime('now')
             WHERE ratings.stars != excluded.stars`,
        ).bind(app.id, user.id, stars),
        c.env.DB.prepare(`SELECT COUNT(*) AS n, SUM(stars) AS total FROM ratings WHERE app_id = ?`).bind(app.id),
    ]);
    const row = summary.results[0];
    return c.json({ my_rating: stars, ...ratingSummary(row?.n ?? 0, row?.total ?? null) });
});

apps.delete('/:slug/rating', async (c) => {
    const user = requireUser(c);
    await c.env.DB.prepare(`DELETE FROM ratings WHERE user_id = ? AND app_id = (SELECT id FROM apps WHERE slug = ?)`)
        .bind(user.id, c.req.param('slug'))
        .run();
    return c.json({ ok: true });
});

apps.post('/:slug/reports', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || app.status !== 'published') fail(404, 'app not found');
    const { reason } = await readJson<{ reason?: unknown }>(c);
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) {
        fail(400, 'reason is required (up to 2000 characters)');
    }
    const open = await c.env.DB.prepare(
        `SELECT COUNT(*) AS total, SUM(app_id = ?) AS here FROM reports WHERE user_id = ? AND resolved = 0`,
    )
        .bind(app.id, user.id)
        .first<{ total: number; here: number | null }>();
    if ((open?.here ?? 0) > 0) fail(409, 'you already reported this app; a moderator will look at it');
    if ((open?.total ?? 0) >= MAX_OPEN_REPORTS_PER_USER) fail(429, 'too many open reports');
    await c.env.DB.prepare(`INSERT INTO reports (app_id, user_id, reason) VALUES (?, ?, ?)`)
        .bind(app.id, user.id, reason.trim())
        .run();
    return c.json({ ok: true }, 201);
});

/* --------------------------------------------------- users and files ------ */

export const users = new Hono<AppEnv>();

/** Own apps include drafts and hidden ones; anyone else's — only published. */
users.get('/:login/apps', async (c) => {
    const viewer = requireUser(c);
    const login = c.req.param('login');
    const owner = await c.env.DB.prepare(`SELECT id FROM users WHERE login = ? COLLATE NOCASE`)
        .bind(login)
        .first<{ id: number }>();
    if (!owner) fail(404, 'user not found');
    const own = viewer?.id === owner.id || can(viewer, 'items.edit');
    const { results } = await c.env.DB.prepare(
        `${APP_SELECT} WHERE a.owner_id = ? ${own ? '' : `AND a.status = 'published'`} ORDER BY a.updated_at DESC`,
    )
        .bind(owner.id)
        .all<AppRow>();
    const latest = await latestApproved(
        c.env,
        results.map((a) => a.id),
    );

    // ?versions: every version with its review state, for "My apps" and the
    // publish form. Without it the page fetched each app on its own, one
    // Worker request per app every time it opened
    let versions: Map<number, VersionRow[]> | null = null;
    if (own && c.req.query('versions') !== undefined) {
        const { results: rows } = await c.env.DB.prepare(
            `SELECT v.* FROM versions v JOIN apps a ON a.id = v.app_id WHERE a.owner_id = ? ORDER BY v.id DESC`,
        )
            .bind(owner.id)
            .all<VersionRow>();
        versions = new Map();
        for (const v of rows) versions.set(v.app_id, [...(versions.get(v.app_id) ?? []), v]);
    }
    return c.json({
        items: results.map((a) => ({
            ...serializeApp(c.env, a, latest.get(a.id) ?? null),
            ...(versions
                ? { can_manage: true, versions: (versions.get(a.id) ?? []).map((v) => serializeVersion(c.env, a.slug, v, true)) }
                : {}),
        })),
    });
});

export async function serveFile(c: Context<AppEnv>) {
    const slug = c.req.param('slug')!;
    const versionId = Number(c.req.param('id'));
    const name = c.req.param('name')!;
    if (!Number.isInteger(versionId) || !LOOSE_NAME_RE.test(name)) fail(404, 'file not found');

    const row = await c.env.DB.prepare(
        `SELECT v.status AS version_status, v.storage_prefix, a.status AS app_status, a.owner_id
           FROM versions v JOIN apps a ON a.id = v.app_id WHERE v.id = ? AND a.slug = ?`,
    )
        .bind(versionId, slug)
        .first<{ version_status: string; storage_prefix: string; app_status: string; owner_id: number }>();
    if (!row) fail(404, 'file not found');

    // Owners and moderators only (My apps, Moderation): the public downloads
    // the same files from the Pages mirror, which costs the Worker nothing
    const user = c.get('user');
    if (!user || user.role === 'banned' || (user.id !== row.owner_id && !can(user, 'review') && !can(user, 'items.edit'))) {
        fail(404, 'file not found');
    }

    const object = await c.env.FILES.get(objectKey(row, name));
    if (!object) fail(404, 'file not found');

    const headers = new Headers({
        'Content-Type': contentTypeOf(name),
        'Content-Length': String(object.size),
        ETag: object.httpEtag,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
    });
    if (c.req.query('download') !== undefined) {
        // Imported names may hold quotes or semicolons; the encoded form cannot break the header
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    return new Response(object.body, { headers });
}
