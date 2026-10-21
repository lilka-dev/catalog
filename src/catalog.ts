import { Hono, type Context } from 'hono';
import type { AppEnv, Env } from './env';
import { displayAuthor, kindDir, type AppRow } from './apps';
import { contentTypeOf, fail, parseJsonArray, sha256Hex } from './util';
import { objectKey } from './versions';

/**
 * The catalog as static-looking files, in exactly the layout the old repo's
 * build.py wrote to GitHub Pages:
 *
 *   /catalog/{apps|wallpapers|mods}/index_<page>.json
 *   /catalog/<dir>/<id>/index.json, index_short.json, package.zip
 *   /catalog/<dir>/<id>/static/<file>
 *   /catalog/authors.json
 *
 * Keira's lilcatalog requests these paths under CATALOG_BASE_URL, and the
 * Pages mirror is a plain copy of this tree, so every field name and its order
 * follows build.py's `process_manifest` rather than this API's own JSON.
 */

const PER_PAGE = 12; // gen_json_index_manifests
const LANGUAGES = ['uk', 'en'] as const;
const DIRS: Record<string, AppRow['kind']> = { apps: 'app', wallpapers: 'wallpaper', mods: 'mod' };

interface CatalogRow extends AppRow {
    v_id: number;
    keira_version: string | null;
    entry_type: string | null;
    entry_file: string | null;
    files: string;
    files_meta: string | null;
    icon: string | null;
    icon_min: string | null;
    screenshots: string;
    changelog: string | null;
    changelog_en: string | null;
    package: string | null;
    security: string | null;
    storage_prefix: string;
}

/** Published apps with their latest approved version, sorted like Python's sorted(os.listdir()). */
async function published(env: Env, kind?: AppRow['kind'], slug?: string): Promise<CatalogRow[]> {
    const where = [`a.status = 'published'`];
    const params: unknown[] = [];
    if (kind) {
        where.push('a.kind = ?');
        params.push(kind);
    }
    if (slug) {
        where.push('a.slug = ?');
        params.push(slug);
    }
    const { results } = await env.DB.prepare(
        `SELECT a.*, u.login AS owner_login, u.avatar_url AS owner_avatar,
                v.id AS v_id, v.keira_version, v.entry_type, v.entry_file, v.files, v.files_meta, v.icon, v.icon_min,
                v.screenshots, v.changelog, v.changelog_en, v.package, v.security, v.storage_prefix
           FROM apps a
           JOIN users u ON u.id = a.owner_id
           JOIN versions v ON v.id = (SELECT v2.id FROM versions v2
                                       WHERE v2.app_id = a.id AND v2.status = 'approved'
                                       ORDER BY v2.approved_at DESC, v2.id DESC LIMIT 1)
          WHERE ${where.join(' AND ')}
          ORDER BY a.slug COLLATE BINARY`,
    )
        .bind(...params)
        .all<CatalogRow>();
    return results;
}

type Fields = Partial<Record<'name' | 'short_description' | 'description' | 'changelog', string>>;

/** build_localization_map: per-language fields, only languages that have any. */
function localization(row: CatalogRow): Record<string, Fields> {
    const source: Record<string, Fields> = {
        uk: { name: row.name_uk ?? '', short_description: row.short_uk ?? '', description: row.description_uk ?? '', changelog: row.changelog ?? '' },
        en: { name: row.name_en ?? '', short_description: row.short_en ?? '', description: row.description_en ?? '', changelog: row.changelog_en ?? '' },
    };
    const out: Record<string, Fields> = {};
    for (const lang of LANGUAGES) {
        const entry: Fields = {};
        for (const [key, value] of Object.entries(source[lang]) as [keyof Fields, string][]) {
            if (value) entry[key] = value;
        }
        if (Object.keys(entry).length) out[lang] = entry;
    }
    return out;
}

/** pick_default_language: Ukrainian first, then any language that has text. */
function pick(loc: Record<string, Fields>, field: keyof Fields): string {
    for (const lang of LANGUAGES) {
        const value = loc[lang]?.[field];
        if (value) return value;
    }
    return '';
}

function onlyFields(loc: Record<string, Fields>, keys: (keyof Fields)[]): Record<string, Fields> {
    const out: Record<string, Fields> = {};
    for (const [lang, fields] of Object.entries(loc)) {
        out[lang] = Object.fromEntries(Object.entries(fields).filter(([k]) => keys.includes(k as keyof Fields)));
    }
    return out;
}

function parseSecurity(value: string | null): unknown {
    if (value) {
        try {
            return JSON.parse(value);
        } catch {
            // fall through: an unreadable record is reported as "not scanned"
        }
    }
    return { scan_date: null, clamav_available: false, files: [] };
}

function entryfile(row: CatalogRow) {
    return row.entry_file ? { type: row.entry_type, location: row.entry_file } : undefined;
}

export function fullDoc(row: CatalogRow): Record<string, unknown> {
    const loc = localization(row);
    const languages = Object.keys(loc);
    const doc: Record<string, unknown> = {
        name: pick(loc, 'name'),
        description: pick(loc, 'description'),
        short_description: pick(loc, 'short_description'),
        author: displayAuthor(row),
        sources: { type: row.sources_type ?? 'url', location: { origin: row.sources_url } },
        screenshots: parseJsonArray<string>(row.screenshots),
    };
    if (languages.length) {
        doc.languages = languages;
        doc.localization = loc;
    }
    if (row.icon) doc.icon = row.icon;
    if (row.icon_min) doc.icon_min = row.icon_min;
    const changelog = pick(loc, 'changelog');
    if (changelog) doc.changelog = changelog;

    const files = parseJsonArray<string>(row.files);
    const described = new Map(
        parseJsonArray<Record<string, unknown>>(row.files_meta).map((entry) => [entry.location, entry]),
    );
    if (row.kind === 'mod') {
        if (files.length) doc.modfiles = files.map((name) => described.get(name) ?? { name, location: name });
    } else {
        if (row.entry_file) doc.entryfile = entryfile(row);
        if (files.length) doc.files = files.map((name) => described.get(name) ?? { location: name });
    }
    if (row.package) doc.package = row.package;
    doc.security = parseSecurity(row.security);
    return doc;
}

function shortDoc(row: CatalogRow): Record<string, unknown> {
    const loc = localization(row);
    const doc: Record<string, unknown> = {
        name: pick(loc, 'name'),
        short_description: pick(loc, 'short_description'),
    };
    if (Object.keys(loc).length) {
        doc.languages = Object.keys(loc);
        doc.localization = onlyFields(loc, ['name', 'short_description']);
    }
    const entry = entryfile(row);
    if (entry) doc.entryfile = entry;
    return doc;
}

/* ----------------------------------------------------------- routes ------ */

export const catalog = new Hono<AppEnv>();

function json(c: Context<AppEnv>, data: unknown) {
    // Short cache: approvals and edits should reach devices within a minute
    return new Response(JSON.stringify(data, null, 2), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        },
    });
}

function dirKind(dir: string): AppRow['kind'] {
    const kind = DIRS[dir];
    if (!kind) fail(404, 'not found');
    return kind;
}

/** Exact text of every document, shared by the single routes and the export. */
function text(data: unknown): string {
    return JSON.stringify(data, null, 2);
}

function authorsDoc(rows: CatalogRow[]): Record<string, unknown[]> {
    const authors = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
        const loc = localization(row);
        const entry: Record<string, unknown> = {
            name: pick(loc, 'name'),
            short_description: pick(loc, 'short_description'),
            icon: row.icon ?? '',
            path: row.slug,
            type: kindDir(row.kind),
        };
        if (Object.keys(loc).length) {
            entry.languages = Object.keys(loc);
            entry.localization = onlyFields(loc, ['name', 'short_description']);
        }
        const author = displayAuthor(row);
        authors.set(author, [...(authors.get(author) ?? []), entry]);
    }
    // Python's sorted(key=str.lower) compares code points, not locale order
    const byLower = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
    const sorted: Record<string, unknown[]> = {};
    for (const author of [...authors.keys()].sort(byLower)) {
        sorted[author] = authors.get(author)!.sort((a, b) => byLower(String(a.name), String(b.name)));
    }
    return sorted;
}

/** index_<n>.json documents of one kind; build.py wrote none for an empty kind, this keeps an empty page 0. */
function indexDocs(rows: CatalogRow[]) {
    const ids = rows.map((row) => row.slug);
    const totalPages = Math.ceil(ids.length / PER_PAGE);
    return Array.from({ length: Math.max(totalPages, 1) }, (_, page) => ({
        page,
        total_pages: totalPages,
        manifests: ids.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
    }));
}

catalog.get('/authors.json', async (c) => json(c, authorsDoc(await published(c.env))));

catalog.get('/:dir/:page{index_[0-9]+\\.json}', async (c) => {
    const kind = dirKind(c.req.param('dir'));
    const page = Number(/^index_(\d+)\.json$/.exec(c.req.param('page'))![1]);
    const docs = indexDocs(await published(c.env, kind));
    if (page >= docs.length) fail(404, 'page not found');
    return json(c, docs[page]);
});

/**
 * The whole tree in one response, for scripts/mirror_api.py.
 *
 * Every request to the Worker counts against its daily limit, and copying the
 * tree file by file was over 400 of them per mirror run. This returns every
 * JSON document as the exact text the single routes serve, plus which version
 * each item is at, so the mirror only fetches files of items that changed and
 * skips a run entirely when `stamp` is the one it published last time.
 */
catalog.get('/export.json', async (c) => {
    const rows = await published(c.env);
    const documents: Record<string, string> = { 'authors.json': text(authorsDoc(rows)) };
    const items: Record<string, { version: number; files: string[] }> = {};
    for (const dir of Object.keys(DIRS)) {
        const ofKind = rows.filter((row) => kindDir(row.kind) === dir);
        indexDocs(ofKind).forEach((doc, page) => (documents[`${dir}/index_${page}.json`] = text(doc)));
        for (const row of ofKind) {
            const base = `${dir}/${row.slug}`;
            documents[`${base}/index.json`] = text(fullDoc(row));
            if (row.kind !== 'mod') documents[`${base}/index_short.json`] = text(shortDoc(row));
            const names = new Set(
                [row.entry_file, row.icon, row.icon_min, ...parseJsonArray<string>(row.files), ...parseJsonArray<string>(row.screenshots)].filter(
                    (name): name is string => !!name,
                ),
            );
            items[base] = {
                version: row.v_id,
                files: [...[...names].map((name) => `static/${name}`), ...(row.package ? [row.package] : [])],
            };
        }
    }
    const stamp = await sha256Hex(text({ documents, items }));
    return new Response(text({ stamp, documents, items }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
});

async function one(c: Context<AppEnv>): Promise<CatalogRow> {
    const [row] = await published(c.env, dirKind(c.req.param('dir')!), c.req.param('id'));
    if (!row) fail(404, 'not found');
    return row;
}

catalog.get('/:dir/:id/index.json', async (c) => json(c, fullDoc(await one(c))));

catalog.get('/:dir/:id/index_short.json', async (c) => {
    const row = await one(c);
    // build.py made short manifests only for kinds with an entry file
    if (row.kind === 'mod') fail(404, 'not found');
    return json(c, shortDoc(row));
});

async function serveObject(c: Context<AppEnv>, row: CatalogRow, names: string[]) {
    for (const name of names) {
        const object = await c.env.FILES.get(objectKey(row, name));
        if (!object) continue;
        // The website's download buttons point here from another origin, where
        // the `download` attribute is ignored
        const disposition: Record<string, string> =
            c.req.query('download') !== undefined
                ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` }
                : {};
        return new Response(object.body, {
            headers: {
                ...disposition,
                'Content-Type': contentTypeOf(name),
                'Content-Length': String(object.size),
                ETag: object.httpEtag,
                // Same URL for every version, so it cannot be cached forever
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    }
    fail(404, 'file not found');
}

catalog.get('/:dir/:id/package.zip', async (c) => {
    const row = await one(c);
    if (!row.package) fail(404, 'file not found');
    return serveObject(c, row, [row.package]);
});

catalog.get('/:dir/:id/static/:name', async (c) => {
    const row = await one(c);
    const decoded = c.req.param('name');
    // Some repo files have a literal `%2B` in their name; Keira sends it as is
    const raw = new URL(c.req.url).pathname.split('/').pop() ?? decoded;
    const known = new Set([
        row.entry_file,
        row.icon,
        row.icon_min,
        ...parseJsonArray<string>(row.files),
        ...parseJsonArray<string>(row.screenshots),
    ]);
    const names = [decoded, raw].filter((name, i, all) => known.has(name) && all.indexOf(name) === i);
    return serveObject(c, row, names);
});
