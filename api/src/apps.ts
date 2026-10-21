import { Hono, type Context } from 'hono';
import type { AppEnv, Env, User } from './env';
import {
    LOOSE_NAME_RE,
    contentTypeOf,
    SLUG_RE,
    dispatch,
    fail,
    parseJsonArray,
    readJson,
    requireUser,
    type EntryType,
} from './util';
import { MAX_UPLOAD_BYTES, createVersion, objectKey, readVersionForm } from './versions';

const PAGE_SIZE = 24;
/** Unreviewed uploads per user: keeps one account from flooding the queue. */
const MAX_PENDING_PER_USER = 5;
/** Apps per account, drafts included: stops slug squatting and spam. */
const MAX_APPS_PER_USER = 20;
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
    SELECT a.*, u.login AS owner_login, u.avatar_url AS owner_avatar,
           (SELECT AVG(stars) FROM ratings r WHERE r.app_id = a.id) AS rating_avg,
           (SELECT COUNT(*) FROM ratings r WHERE r.app_id = a.id) AS rating_count
      FROM apps a JOIN users u ON u.id = a.owner_id`;

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
        author: displayAuthor(a),
        name: localized(a.name_uk, a.name_en),
        short_description: localized(a.short_uk, a.short_en),
        description: localized(a.description_uk, a.description_en),
        sources_type: a.sources_type,
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
    author?: unknown;
    owner?: unknown;
}

/* ----------------------------------------------------------- routes ------ */

export const apps = new Hono<AppEnv>();

apps.get('/', async (c) => {
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
    if (user.role !== 'moderator') {
        const owned = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM apps WHERE owner_id = ?`)
            .bind(user.id)
            .first<{ n: number }>();
        if ((owned?.n ?? 0) >= MAX_APPS_PER_USER) fail(429, `at most ${MAX_APPS_PER_USER} apps per account`);
    }

    await c.env.DB.prepare(
        `INSERT INTO apps (slug, owner_id, kind, name_uk, name_en, short_uk, short_en,
                           description_uk, description_en, sources_type, sources_url, license)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            body.slug,
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
    if (body.sources_url !== undefined) {
        const sources = readSourcesUrl(body.sources_url, { strict: user.role !== 'moderator' });
        set('sources_url', sources);
        set('sources_type', sourcesTypeOf(sources));
    }
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
    // Imported apps belong to the catalog account and show the historic author
    // name; a moderator hands them over once the author signs in
    if (body.author !== undefined || body.owner !== undefined) {
        if (user.role !== 'moderator') fail(403, 'only moderators can change the author or owner');
        if (body.author !== undefined) {
            if (body.author !== null && (typeof body.author !== 'string' || body.author.length > 64)) {
                fail(400, 'author must be a short string or null');
            }
            set('author', body.author ? (body.author as string).trim() : null);
        }
        if (body.owner !== undefined) {
            if (typeof body.owner !== 'string') fail(400, 'owner must be a GitHub login');
            const owner = await c.env.DB.prepare(`SELECT id FROM users WHERE login = ? COLLATE NOCASE`)
                .bind(body.owner)
                .first<{ id: number }>();
            if (!owner) fail(404, 'that user has never signed in');
            set('owner_id', owner.id);
        }
    }
    if (sets.length === 0) fail(400, 'nothing to update');

    sets.push(`updated_at = datetime('now')`);
    await c.env.DB.prepare(`UPDATE apps SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...params, app.id)
        .run();

    // The device mirror is rebuilt from the API; it has to pick this up
    if (app.status === 'published' || body.status !== undefined) {
        c.executionCtx.waitUntil(dispatch(c.env, c.env.CATALOG_REPO, 'api-sync', { slug: app.slug }));
    }
    const updated = await findApp(c.env, app.slug);
    const latest = await latestApproved(c.env, [app.id]);
    return c.json(serializeApp(c.env, updated!, latest.get(app.id) ?? null));
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

    const versionId = await createVersion(c.env, app, readVersionForm(form, app.kind));
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

    // Approved versions stay downloadable while the app is hidden: devices that
    // already installed it may re-fetch, and the catalog drops it on next build
    const isPublic = row.version_status === 'approved' && row.app_status !== 'draft';
    const user = c.get('user');
    const privileged = !!user && (user.id === row.owner_id || user.role === 'moderator');
    if (!isPublic && !privileged) fail(404, 'file not found');

    const object = await c.env.FILES.get(objectKey(row, name));
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
    if (c.req.query('download') !== undefined) {
        // Imported names may hold quotes or semicolons; the encoded form cannot break the header
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    return new Response(object.body, { headers });
}
