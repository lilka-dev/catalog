import { Hono, type Context } from 'hono';
import type { AppEnv, Env, User } from './env';
import {
    FILENAME_RE,
    contentTypeOf,
    SLUG_RE,
    VERSION_RE,
    dispatch,
    entryTypeOf,
    fail,
    isImageName,
    parseJsonArray,
    readJson,
    requireUser,
    sha256Hex,
    type EntryType,
} from './util';

const PAGE_SIZE = 24;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const MAX_EXTRA_FILES = 16;
const MAX_SCREENSHOTS = 6;
/** Unreviewed uploads per user: keeps one account from flooding the queue. */
const MAX_PENDING_PER_USER = 5;

export interface AppRow {
    id: number;
    slug: string;
    owner_id: number;
    kind: 'app' | 'wallpaper';
    name_uk: string | null;
    name_en: string | null;
    short_uk: string | null;
    short_en: string | null;
    description_uk: string | null;
    description_en: string | null;
    sources_url: string;
    license: string | null;
    status: 'draft' | 'published' | 'hidden';
    created_at: string;
    updated_at: string;
    owner_login: string;
    owner_avatar: string | null;
    rating_avg: number | null;
    rating_count: number;
}

export interface VersionRow {
    id: number;
    app_id: number;
    version: string;
    keira_version: string;
    entry_type: EntryType;
    entry_file: string;
    files: string;
    icon: string | null;
    screenshots: string;
    changelog: string | null;
    checksums: string;
    status: 'pending_scan' | 'pending_review' | 'approved' | 'rejected' | 'infected';
    scan_detail: string | null;
    review_note: string | null;
    created_at: string;
    approved_at: string | null;
}

export const APP_SELECT = `
    SELECT a.*, u.login AS owner_login, u.avatar_url AS owner_avatar,
           (SELECT AVG(stars) FROM ratings r WHERE r.app_id = a.id) AS rating_avg,
           (SELECT COUNT(*) FROM ratings r WHERE r.app_id = a.id) AS rating_count
      FROM apps a JOIN users u ON u.id = a.owner_id`;

export function fileUrl(env: Env, slug: string, versionId: number, name: string): string {
    return `${env.PUBLIC_URL.replace(/\/$/, '')}/files/${slug}/${versionId}/${encodeURIComponent(name)}`;
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
    return {
        id: v.id,
        version: v.version,
        keira_version: v.keira_version,
        entry_type: v.entry_type,
        status: v.status,
        changelog: v.changelog,
        created_at: v.created_at,
        approved_at: v.approved_at,
        entry: { name: v.entry_file, url: url(v.entry_file) },
        files: files.map((name) => ({ name, url: url(name) })),
        icon: v.icon ? { name: v.icon, url: url(v.icon) } : null,
        screenshots: screenshots.map((name) => ({ name, url: url(name) })),
        checksums: parseJsonArray(v.checksums),
        ...(detailed ? { scan_detail: v.scan_detail, review_note: v.review_note } : {}),
    };
}

export function serializeApp(env: Env, a: AppRow, latest: VersionRow | null) {
    return {
        slug: a.slug,
        kind: a.kind,
        status: a.status,
        name: localized(a.name_uk, a.name_en),
        short_description: localized(a.short_uk, a.short_en),
        description: localized(a.description_uk, a.description_en),
        sources_url: a.sources_url,
        license: a.license,
        owner: { login: a.owner_login, avatar_url: a.owner_avatar },
        rating: { average: a.rating_avg === null ? null : Math.round(a.rating_avg * 10) / 10, count: a.rating_count },
        latest_version: latest ? serializeVersion(env, a.slug, latest, false) : null,
        created_at: a.created_at,
        updated_at: a.updated_at,
    };
}

/** Latest approved version of each app, in one query. */
export async function latestApproved(env: Env, appIds: number[]): Promise<Map<number, VersionRow>> {
    const result = new Map<number, VersionRow>();
    if (appIds.length === 0) return result;
    const { results } = await env.DB.prepare(
        `SELECT v.* FROM versions v
          WHERE v.status = 'approved' AND v.app_id IN (${appIds.map(() => '?').join(',')})
            AND v.id = (SELECT v2.id FROM versions v2
                         WHERE v2.app_id = v.app_id AND v2.status = 'approved'
                         ORDER BY v2.approved_at DESC, v2.id DESC LIMIT 1)`,
    )
        .bind(...appIds)
        .all<VersionRow>();
    for (const v of results) result.set(v.app_id, v);
    return result;
}

export async function findApp(env: Env, slug: string): Promise<AppRow | null> {
    return env.DB.prepare(`${APP_SELECT} WHERE a.slug = ?`).bind(slug).first<AppRow>();
}

function canManage(user: User | null, app: AppRow): boolean {
    return !!user && user.role !== 'banned' && (user.id === app.owner_id || user.role === 'moderator');
}

/* ------------------------------------------------------------ input ------ */

type LocalizedInput = string | { uk?: unknown; en?: unknown } | undefined;

function readLocalized(value: LocalizedInput, field: string, max: number): { uk: string | null; en: string | null } {
    // A bare string is Ukrainian: that is the catalog's default language
    const raw = typeof value === 'string' ? { uk: value } : (value ?? {});
    const pick = (text: unknown, lang: string): string | null => {
        if (text === undefined || text === null || text === '') return null;
        if (typeof text !== 'string') fail(400, `${field}.${lang} must be a string`);
        const trimmed = text.trim();
        if (trimmed.length > max) fail(400, `${field}.${lang} is longer than ${max} characters`);
        return trimmed || null;
    };
    return { uk: pick(raw.uk, 'uk'), en: pick(raw.en, 'en') };
}

function readSourcesUrl(value: unknown): string {
    if (typeof value !== 'string') fail(400, 'sources_url is required');
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        fail(400, 'sources_url must be a URL');
    }
    if (url.protocol !== 'https:') fail(400, 'sources_url must use https');
    return url.toString();
}

function readLicense(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 64) fail(400, 'license must be a short string');
    return value.trim();
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
}

/* ----------------------------------------------------------- routes ------ */

export const apps = new Hono<AppEnv>();

apps.get('/', async (c) => {
    const kind = c.req.query('kind');
    const q = c.req.query('q')?.trim();
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);

    const where = [`a.status = 'published'`];
    const params: unknown[] = [];
    if (kind) {
        if (kind !== 'app' && kind !== 'wallpaper') fail(400, 'kind must be app or wallpaper');
        where.push('a.kind = ?');
        params.push(kind);
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
    const user = c.get('user');
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
    const latest = results.find((v) => v.status === 'approved') ?? null;

    let myRating: number | null = null;
    if (user) {
        const row = await c.env.DB.prepare(`SELECT stars FROM ratings WHERE app_id = ? AND user_id = ?`)
            .bind(app.id, user.id)
            .first<{ stars: number }>();
        myRating = row?.stars ?? null;
    }

    return c.json({
        ...serializeApp(c.env, app, latest),
        can_manage: manage,
        my_rating: myRating,
        versions: results.map((v) => serializeVersion(c.env, app.slug, v, manage)),
    });
});

apps.post('/', async (c) => {
    const user = requireUser(c);
    const body = await readJson<AppInput>(c);

    if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) {
        fail(400, 'slug must be 2-48 characters: lowercase letters, digits and dashes');
    }
    if (body.kind !== 'app' && body.kind !== 'wallpaper') fail(400, 'kind must be app or wallpaper');
    const name = readLocalized(body.name, 'name', 64);
    const short = readLocalized(body.short_description, 'short_description', 200);
    const description = readLocalized(body.description, 'description', 20000);
    if (!name.uk && !name.en) fail(400, 'name is required');
    if (!short.uk && !short.en) fail(400, 'short_description is required');
    const sources = readSourcesUrl(body.sources_url);
    const license = readLicense(body.license);

    const exists = await c.env.DB.prepare(`SELECT 1 FROM apps WHERE slug = ?`).bind(body.slug).first();
    if (exists) fail(409, 'slug is taken');

    await c.env.DB.prepare(
        `INSERT INTO apps (slug, owner_id, kind, name_uk, name_en, short_uk, short_en,
                           description_uk, description_en, sources_url, license)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            body.slug,
            user.id,
            body.kind,
            name.uk,
            name.en,
            short.uk,
            short.en,
            description.uk,
            description.en,
            sources,
            license,
        )
        .run();

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

    if (body.name !== undefined) {
        const name = readLocalized(body.name, 'name', 64);
        if (!name.uk && !name.en) fail(400, 'name cannot be empty');
        set('name_uk', name.uk);
        set('name_en', name.en);
    }
    if (body.short_description !== undefined) {
        const short = readLocalized(body.short_description, 'short_description', 200);
        if (!short.uk && !short.en) fail(400, 'short_description cannot be empty');
        set('short_uk', short.uk);
        set('short_en', short.en);
    }
    if (body.description !== undefined) {
        const description = readLocalized(body.description, 'description', 20000);
        set('description_uk', description.uk);
        set('description_en', description.en);
    }
    if (body.sources_url !== undefined) set('sources_url', readSourcesUrl(body.sources_url));
    if (body.license !== undefined) set('license', readLicense(body.license));
    if (body.status !== undefined) {
        if (body.status === 'hidden') {
            set('status', 'hidden');
        } else if (body.status === 'published') {
            const approved = await c.env.DB.prepare(
                `SELECT 1 FROM versions WHERE app_id = ? AND status = 'approved' LIMIT 1`,
            )
                .bind(app.id)
                .first();
            if (!approved) fail(409, 'app has no approved version yet');
            set('status', 'published');
        } else {
            fail(400, 'status must be hidden or published');
        }
    }
    if (sets.length === 0) fail(400, 'nothing to update');

    sets.push(`updated_at = datetime('now')`);
    await c.env.DB.prepare(`UPDATE apps SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...params, app.id)
        .run();

    // Metadata of a published app goes into the catalog: rebuild it
    if (app.status === 'published' || body.status !== undefined) {
        c.executionCtx.waitUntil(dispatch(c.env, c.env.CATALOG_REPO, 'api-sync', { slug: app.slug }));
    }
    const updated = await findApp(c.env, app.slug);
    const latest = await latestApproved(c.env, [app.id]);
    return c.json(serializeApp(c.env, updated!, latest.get(app.id) ?? null));
});

/**
 * Upload of a new version: multipart form with
 *   version, keira_version, entry_type, changelog  — text fields
 *   entry (1 file), files (0..16), icon (0..1), screenshots (0..6)
 *
 * Files are stored right away but stay private until the scan is clean and a
 * moderator approves the version.
 */
apps.post('/:slug/versions', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || !canManage(user, app)) fail(404, 'app not found');

    const length = Number(c.req.header('Content-Length') ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) fail(413, `upload is larger than ${MAX_UPLOAD_BYTES} bytes`);

    const pending = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM versions v JOIN apps a ON a.id = v.app_id
          WHERE a.owner_id = ? AND v.status IN ('pending_scan', 'pending_review')`,
    )
        .bind(app.owner_id)
        .first<{ n: number }>();
    if ((pending?.n ?? 0) >= MAX_PENDING_PER_USER) fail(429, 'too many versions are waiting for review');

    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        fail(400, 'body must be multipart/form-data');
    }

    const text = (key: string, re?: RegExp): string => {
        const value = form.get(key);
        if (typeof value !== 'string' || !value.trim()) fail(400, `${key} is required`);
        if (re && !re.test(value.trim())) fail(400, `${key} has an invalid format`);
        return value.trim();
    };
    const version = text('version', VERSION_RE);
    const keiraVersion = text('keira_version', VERSION_RE);
    const entryType = text('entry_type') as EntryType;
    if (!['lua', 'archive', 'binary'].includes(entryType)) fail(400, 'entry_type must be lua, archive or binary');
    const changelogRaw = form.get('changelog');
    const changelog = typeof changelogRaw === 'string' && changelogRaw.trim() ? changelogRaw.trim() : null;
    if (changelog && changelog.length > 20000) fail(400, 'changelog is too long');

    const filesOf = (key: string): File[] =>
        form.getAll(key).filter((item): item is File => typeof item !== 'string' && item.size > 0);
    const entry = filesOf('entry');
    const extra = filesOf('files');
    const icon = filesOf('icon');
    const screenshots = filesOf('screenshots');

    if (entry.length !== 1) fail(400, 'exactly one entry file is required');
    if (extra.length > MAX_EXTRA_FILES) fail(400, `at most ${MAX_EXTRA_FILES} extra files`);
    if (icon.length > 1) fail(400, 'at most one icon');
    if (screenshots.length > MAX_SCREENSHOTS) fail(400, `at most ${MAX_SCREENSHOTS} screenshots`);

    const all = [...entry, ...extra, ...icon, ...screenshots];
    const names = new Set<string>();
    let total = 0;
    for (const file of all) {
        if (!FILENAME_RE.test(file.name)) fail(400, `bad file name "${file.name}": use letters, digits, . _ -`);
        if (names.has(file.name)) fail(400, `file name "${file.name}" is used twice`);
        names.add(file.name);
        if (file.size > MAX_FILE_BYTES) fail(413, `"${file.name}" is larger than ${MAX_FILE_BYTES} bytes`);
        total += file.size;
    }
    if (total > MAX_UPLOAD_BYTES) fail(413, `upload is larger than ${MAX_UPLOAD_BYTES} bytes`);
    if (entryTypeOf(entry[0].name) !== entryType) {
        fail(400, `entry file "${entry[0].name}" does not match entry_type ${entryType}`);
    }
    for (const image of [...icon, ...screenshots]) {
        if (!isImageName(image.name)) fail(400, `"${image.name}" must be a PNG or JPEG`);
    }

    const duplicate = await c.env.DB.prepare(`SELECT 1 FROM versions WHERE app_id = ? AND version = ?`)
        .bind(app.id, version)
        .first();
    if (duplicate) fail(409, `version ${version} already exists`);

    const row = await c.env.DB.prepare(
        `INSERT INTO versions (app_id, version, keira_version, entry_type, entry_file, files, icon, screenshots, changelog)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
        .bind(
            app.id,
            version,
            keiraVersion,
            entryType,
            entry[0].name,
            JSON.stringify(extra.map((f) => f.name)),
            icon[0]?.name ?? null,
            JSON.stringify(screenshots.map((f) => f.name)),
            changelog,
        )
        .first<{ id: number }>();
    const versionId = row!.id;

    try {
        const checksums = [];
        for (const file of all) {
            const data = await file.arrayBuffer();
            await c.env.FILES.put(`v/${versionId}/${file.name}`, data);
            checksums.push({ name: file.name, size: file.size, sha256: await sha256Hex(data) });
        }
        await c.env.DB.prepare(`UPDATE versions SET checksums = ? WHERE id = ?`)
            .bind(JSON.stringify(checksums), versionId)
            .run();
    } catch (error) {
        // A version without its files must not reach the review queue
        await c.env.DB.prepare(`DELETE FROM versions WHERE id = ?`).bind(versionId).run();
        await deleteVersionFiles(c.env, versionId);
        throw error;
    }

    c.executionCtx.waitUntil(dispatch(c.env, c.env.SCAN_REPO, 'scan-version', { version_id: versionId }));

    const created = await c.env.DB.prepare(`SELECT * FROM versions WHERE id = ?`)
        .bind(versionId)
        .first<VersionRow>();
    return c.json(serializeVersion(c.env, app.slug, created!, true), 201);
});

apps.put('/:slug/rating', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || app.status !== 'published') fail(404, 'app not found');
    if (app.owner_id === user.id) fail(403, 'cannot rate your own app');
    const { stars } = await readJson<{ stars?: unknown }>(c);
    if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) {
        fail(400, 'stars must be an integer from 1 to 5');
    }
    await c.env.DB.prepare(
        `INSERT INTO ratings (app_id, user_id, stars) VALUES (?, ?, ?)
         ON CONFLICT (app_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = datetime('now')`,
    )
        .bind(app.id, user.id, stars)
        .run();
    const updated = await findApp(c.env, app.slug);
    return c.json({ average: updated!.rating_avg, count: updated!.rating_count, my_rating: stars });
});

apps.post('/:slug/reports', async (c) => {
    const user = requireUser(c);
    const app = await findApp(c.env, c.req.param('slug'));
    if (!app || app.status !== 'published') fail(404, 'app not found');
    const { reason } = await readJson<{ reason?: unknown }>(c);
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) {
        fail(400, 'reason is required (up to 2000 characters)');
    }
    await c.env.DB.prepare(`INSERT INTO reports (app_id, user_id, reason) VALUES (?, ?, ?)`)
        .bind(app.id, user.id, reason.trim())
        .run();
    return c.json({ ok: true }, 201);
});

export async function deleteVersionFiles(env: Env, versionId: number): Promise<void> {
    const listed = await env.FILES.list({ prefix: `v/${versionId}/` });
    if (listed.objects.length) await env.FILES.delete(listed.objects.map((o) => o.key));
}

/* --------------------------------------------------- users and files ------ */

export const users = new Hono<AppEnv>();

/** Own apps include drafts and hidden ones; anyone else's — only published. */
users.get('/:login/apps', async (c) => {
    const viewer = c.get('user');
    const login = c.req.param('login');
    const owner = await c.env.DB.prepare(`SELECT id FROM users WHERE login = ? COLLATE NOCASE`)
        .bind(login)
        .first<{ id: number }>();
    if (!owner) fail(404, 'user not found');
    const own = viewer?.id === owner.id || viewer?.role === 'moderator';
    const { results } = await c.env.DB.prepare(
        `${APP_SELECT} WHERE a.owner_id = ? ${own ? '' : `AND a.status = 'published'`} ORDER BY a.updated_at DESC`,
    )
        .bind(owner.id)
        .all<AppRow>();
    const latest = await latestApproved(
        c.env,
        results.map((a) => a.id),
    );
    return c.json({ items: results.map((a) => serializeApp(c.env, a, latest.get(a.id) ?? null)) });
});

export async function serveFile(c: Context<AppEnv>) {
    const slug = c.req.param('slug')!;
    const versionId = Number(c.req.param('id'));
    const name = c.req.param('name')!;
    if (!Number.isInteger(versionId) || !FILENAME_RE.test(name)) fail(404, 'file not found');

    const row = await c.env.DB.prepare(
        `SELECT v.status AS version_status, a.status AS app_status, a.owner_id
           FROM versions v JOIN apps a ON a.id = v.app_id WHERE v.id = ? AND a.slug = ?`,
    )
        .bind(versionId, slug)
        .first<{ version_status: string; app_status: string; owner_id: number }>();
    if (!row) fail(404, 'file not found');

    // Approved versions stay downloadable while the app is hidden: devices that
    // already installed it may re-fetch, and the catalog drops it on next build
    const isPublic = row.version_status === 'approved' && row.app_status !== 'draft';
    const user = c.get('user');
    const privileged = !!user && (user.id === row.owner_id || user.role === 'moderator');
    if (!isPublic && !privileged) fail(404, 'file not found');

    const object = await c.env.FILES.get(`v/${versionId}/${name}`);
    if (!object) fail(404, 'file not found');

    const headers = new Headers({
        'Content-Type': contentTypeOf(name),
        'Content-Length': String(object.size),
        ETag: object.httpEtag,
        // The web IDE runs cross-origin isolated (COEP: require-corp), so it
        // may only load resources that opt in to being embedded elsewhere
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
        // Versions never change after upload, so approved files cache forever
        'Cache-Control': isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
    });
    if (c.req.query('download') !== undefined) headers.set('Content-Disposition', `attachment; filename="${name}"`);
    return new Response(object.body, { headers });
}
