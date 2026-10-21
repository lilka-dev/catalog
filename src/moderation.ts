import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';
import {
    APP_SELECT,
    displayAuthor,
    findApp,
    kindDir,
    readKind,
    readLicense,
    readLocalized,
    readSourcesUrl,
    serializeVersion,
    type AppRow,
    type LocalizedInput,
    type VersionRow,
} from './apps';
import { LOOSE_NAME_RE, dispatch, fail, parseJsonArray, readJson, requireModerator, safeEqual } from './util';
import { createVersion, deleteVersionFiles, objectKey, readVersionForm } from './versions';

/* --------------------------------------------------------- moderators ------ */

export const moderation = new Hono<AppEnv>();

moderation.use('*', async (c, next) => {
    requireModerator(c);
    await next();
});

/** Everything that waits for a human, oldest first. */
moderation.get('/queue', async (c) => {
    const status = c.req.query('status') ?? 'pending_review';
    const allowed = ['pending_scan', 'pending_review', 'infected', 'rejected', 'approved'];
    if (!allowed.includes(status)) fail(400, `status must be one of ${allowed.join(', ')}`);
    const { results } = await c.env.DB.prepare(
        `SELECT v.*, a.slug, a.kind, a.name_uk, a.name_en, a.author, a.owner_id, u.login AS owner_login
           FROM versions v JOIN apps a ON a.id = v.app_id JOIN users u ON u.id = a.owner_id
          WHERE v.status = ? ORDER BY v.created_at ASC LIMIT 100`,
    )
        .bind(status)
        .all<
            VersionRow & {
                slug: string;
                kind: string;
                name_uk: string | null;
                name_en: string | null;
                author: string | null;
                owner_id: number;
                owner_login: string;
            }
        >();
    return c.json({
        items: results.map((v) => ({
            app: {
                slug: v.slug,
                kind: v.kind,
                name: { uk: v.name_uk, en: v.name_en },
                author: displayAuthor(v),
                owner: v.owner_login,
                // Still with the catalog account: imported and not handed over yet
                unclaimed: v.owner_id === 0,
            },
            version: serializeVersion(c.env, v.slug, v, true),
        })),
    });
});

async function loadVersion(c: Parameters<MiddlewareHandler<AppEnv>>[0], id: string) {
    const row = await c.env.DB.prepare(
        `SELECT v.*, a.slug, a.status AS app_status FROM versions v JOIN apps a ON a.id = v.app_id WHERE v.id = ?`,
    )
        .bind(Number(id))
        .first<VersionRow & { slug: string; app_status: string }>();
    if (!row) fail(404, 'version not found');
    return row;
}

moderation.post('/versions/:id/approve', async (c) => {
    const moderator = requireModerator(c);
    const version = await loadVersion(c, c.req.param('id'));
    // An unscanned or infected upload must never become public by a misclick
    if (version.status !== 'pending_review') fail(409, `version is ${version.status}, not pending_review`);
    const { note } = await readJson<{ note?: string }>(c).catch(() => ({ note: undefined }));

    await c.env.DB.batch([
        c.env.DB.prepare(
            `UPDATE versions SET status = 'approved', approved_at = datetime('now'), reviewed_by = ?, review_note = ?
              WHERE id = ?`,
        ).bind(moderator.id, note ?? null, version.id),
        // A hidden app stays hidden: approving a version is not a decision to republish it
        c.env.DB.prepare(
            `UPDATE apps SET status = CASE WHEN status = 'hidden' THEN 'hidden' ELSE 'published' END,
                             updated_at = datetime('now')
              WHERE id = ?`,
        ).bind(version.app_id),
    ]);
    c.executionCtx.waitUntil(dispatch(c.env, c.env.CATALOG_REPO, 'api-sync', { slug: version.slug }));
    return c.json({ ok: true });
});

moderation.post('/versions/:id/reject', async (c) => {
    const moderator = requireModerator(c);
    const version = await loadVersion(c, c.req.param('id'));
    if (version.status === 'approved') fail(409, 'version is already approved; hide the app instead');
    const { note } = await readJson<{ note?: unknown }>(c);
    if (typeof note !== 'string' || !note.trim()) fail(400, 'note with the reason is required');
    await c.env.DB.prepare(`UPDATE versions SET status = 'rejected', reviewed_by = ?, review_note = ? WHERE id = ?`)
        .bind(moderator.id, note.trim(), version.id)
        .run();
    return c.json({ ok: true });
});

moderation.get('/reports', async (c) => {
    const { results } = await c.env.DB.prepare(
        `SELECT r.id, r.reason, r.created_at, a.slug, u.login AS reporter
           FROM reports r JOIN apps a ON a.id = r.app_id JOIN users u ON u.id = r.user_id
          WHERE r.resolved = 0 ORDER BY r.created_at ASC LIMIT 100`,
    ).all();
    return c.json({ items: results });
});

moderation.post('/reports/:id/resolve', async (c) => {
    await c.env.DB.prepare(`UPDATE reports SET resolved = 1 WHERE id = ?`).bind(Number(c.req.param('id'))).run();
    return c.json({ ok: true });
});

/** A ban also hides every app of the user and ends their sessions. */
moderation.post('/users/:login/ban', async (c) => {
    const user = await c.env.DB.prepare(`SELECT id, role FROM users WHERE login = ? COLLATE NOCASE`)
        .bind(c.req.param('login'))
        .first<{ id: number; role: string }>();
    if (!user) fail(404, 'user not found');
    // Banning the catalog account would hide every imported app at once
    if (user.id === 0) fail(409, 'the catalog account owns imported apps and cannot be banned');
    if (user.role === 'moderator') fail(409, 'remove the user from MODERATORS first');
    await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE users SET role = 'banned' WHERE id = ?`).bind(user.id),
        c.env.DB.prepare(`UPDATE apps SET status = 'hidden', updated_at = datetime('now') WHERE owner_id = ?`).bind(
            user.id,
        ),
        c.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(user.id),
    ]);
    c.executionCtx.waitUntil(dispatch(c.env, c.env.CATALOG_REPO, 'api-sync', {}));
    return c.json({ ok: true });
});

moderation.post('/users/:login/unban', async (c) => {
    await c.env.DB.prepare(`UPDATE users SET role = 'user' WHERE login = ? COLLATE NOCASE AND role = 'banned'`)
        .bind(c.req.param('login'))
        .run();
    return c.json({ ok: true });
});

/**
 * One-time import of an app from the old catalog repo (scripts/import_catalog.py).
 *
 * Multipart: `meta` (JSON with slug, kind, author, name, short_description,
 * description, changelog, sources, license) plus the usual version fields and
 * files. The app belongs to the catalog account and keeps its historic folder
 * name and author line. It skips the moderator after a clean scan: these apps
 * were already reviewed as pull requests.
 */
moderation.post('/import', async (c) => {
    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        fail(400, 'body must be multipart/form-data');
    }
    const rawMeta = form.get('meta');
    if (typeof rawMeta !== 'string') fail(400, 'meta is required');
    let meta: {
        slug?: unknown;
        kind?: unknown;
        author?: unknown;
        name?: LocalizedInput;
        short_description?: LocalizedInput;
        description?: LocalizedInput;
        changelog?: LocalizedInput;
        files?: unknown;
        sources?: { type?: unknown; origin?: unknown };
        license?: unknown;
    };
    try {
        meta = JSON.parse(rawMeta);
    } catch {
        fail(400, 'meta must be JSON');
    }

    if (typeof meta.slug !== 'string' || !LOOSE_NAME_RE.test(meta.slug)) fail(400, 'meta.slug is not a valid folder name');
    const kind = readKind(meta.kind);
    if (typeof meta.author !== 'string' || !meta.author.trim()) fail(400, 'meta.author is required');
    const exact = { trim: false };
    const name = readLocalized(meta.name, 'name', 200, exact);
    const short = readLocalized(meta.short_description, 'short_description', 1000, exact);
    const description = readLocalized(meta.description, 'description', 100000, exact);
    const changelog = readLocalized(meta.changelog, 'changelog', 100000, exact);
    if (!name.uk && !name.en) fail(400, 'name is required');
    if (!short.uk && !short.en) fail(400, 'short_description is required');
    const sourcesUrl = readSourcesUrl(meta.sources?.origin, { strict: false });
    const sourcesType = typeof meta.sources?.type === 'string' ? meta.sources.type : 'url';
    const license = readLicense(meta.license);

    const existing = await findApp(c.env, meta.slug);
    if (existing) {
        // Re-running the import replaces earlier imports, never someone's own app
        if (c.req.query('replace') === undefined || existing.owner_id !== 0) fail(409, `${meta.slug} already exists`);
        const { results } = await c.env.DB.prepare(`SELECT storage_prefix FROM versions WHERE app_id = ?`)
            .bind(existing.id)
            .all<{ storage_prefix: string }>();
        for (const v of results) await deleteVersionFiles(c.env, v.storage_prefix);
        await c.env.DB.prepare(`DELETE FROM apps WHERE id = ?`).bind(existing.id).run();
    }

    const version = readVersionForm(form, kind);
    // The form's changelog field is single-language; the manifest's map wins
    version.changelog = changelog.uk ?? changelog.en ?? version.changelog;

    const app = await c.env.DB.prepare(
        `INSERT INTO apps (slug, owner_id, kind, author, name_uk, name_en, short_uk, short_en,
                           description_uk, description_en, sources_type, sources_url, license)
         VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
        .bind(
            meta.slug,
            kind,
            meta.author.trim(),
            name.uk,
            name.en,
            short.uk,
            short.en,
            description.uk,
            description.en,
            sourcesType,
            sourcesUrl,
            license,
        )
        .first<{ id: number }>();

    let versionId: number;
    try {
        versionId = await createVersion(c.env, { id: app!.id, slug: meta.slug }, version, { imported: true });
    } catch (error) {
        await c.env.DB.prepare(`DELETE FROM apps WHERE id = ?`).bind(app!.id).run();
        throw error;
    }
    // Only entries that describe an uploaded file are kept
    const names = new Set(version.files.map((f) => f.name));
    const filesMeta = Array.isArray(meta.files)
        ? meta.files.filter(
              (entry): entry is Record<string, unknown> =>
                  !!entry && typeof entry === 'object' && names.has((entry as { location?: unknown }).location as string),
          )
        : [];
    await c.env.DB.prepare(`UPDATE versions SET changelog_en = ?, files_meta = ? WHERE id = ?`)
        .bind(changelog.uk && changelog.en ? changelog.en : null, filesMeta.length ? JSON.stringify(filesMeta) : null, versionId)
        .run();
    c.executionCtx.waitUntil(dispatch(c.env, c.env.SCAN_REPO, 'scan-version', { version_id: versionId }));
    return c.json({ slug: meta.slug, version_id: versionId }, 201);
});

/* ------------------------------------------------------------ processor ------ */

/**
 * Endpoints for the processing workflow in GitHub Actions (scripts/process.py).
 *
 * It scans every file with ClamAV and, when clean, makes what the catalog
 * serves next to the uploads: compressed images, the 64x64 RGB565 icon_min for
 * Keira, package.zip, and the checksum/scan record shown on the website. That
 * needs Pillow and ClamAV, which a Worker cannot run.
 *
 * The workflow authenticates with a shared secret rather than a user session:
 * it is a machine, and it needs files that no user may see yet.
 */
export const scan = new Hono<AppEnv>();

scan.use('*', async (c, next) => {
    const secret = c.env.SCAN_SECRET;
    const header = c.req.header('Authorization') ?? '';
    if (!secret || !(await safeEqual(header, `Bearer ${secret}`))) fail(401, 'scanner secret required');
    await next();
});

scan.get('/pending', async (c) => {
    const { results } = await c.env.DB.prepare(
        `SELECT id FROM versions WHERE status = 'pending_scan' ORDER BY id ASC LIMIT 100`,
    ).all<{ id: number }>();
    return c.json({ ids: results.map((r) => r.id) });
});

function versionFileNames(v: VersionRow): string[] {
    const names = [
        ...(v.entry_file ? [v.entry_file] : []),
        ...parseJsonArray<string>(v.files),
        ...(v.icon ? [v.icon] : []),
        ...parseJsonArray<string>(v.screenshots),
    ];
    return [...new Set(names)];
}

/** Everything the processor needs, including the metadata that goes into package.zip's manifest.yml. */
scan.get('/versions/:id', async (c) => {
    const version = await loadVersion(c, c.req.param('id'));
    const app = await c.env.DB.prepare(`${APP_SELECT} WHERE a.id = ?`).bind(version.app_id).first<AppRow>();
    const base = c.env.PUBLIC_URL.replace(/\/$/, '');
    const loc = (uk: string | null, en: string | null) => ({ ...(uk ? { uk } : {}), ...(en ? { en } : {}) });
    return c.json({
        id: version.id,
        status: version.status,
        app: {
            slug: app!.slug,
            kind: app!.kind,
            dir: kindDir(app!.kind),
            author: displayAuthor(app!),
            name: loc(app!.name_uk, app!.name_en),
            short_description: loc(app!.short_uk, app!.short_en),
            description: loc(app!.description_uk, app!.description_en),
            sources: { type: app!.sources_type ?? 'url', location: { origin: app!.sources_url } },
            license: app!.license,
        },
        version: {
            version: version.version,
            keira_version: version.keira_version,
            entry_type: version.entry_type,
            entry: version.entry_file,
            files: parseJsonArray<string>(version.files),
            icon: version.icon,
            screenshots: parseJsonArray<string>(version.screenshots),
            changelog: loc(version.changelog, version.changelog_en),
        },
        files: versionFileNames(version).map((name) => ({
            name,
            url: `${base}/scan/files/${version.id}/${encodeURIComponent(name)}`,
        })),
    });
});

scan.get('/files/:id/:name', async (c) => {
    const version = await loadVersion(c, c.req.param('id'));
    const object = await c.env.FILES.get(objectKey(version, c.req.param('name')));
    if (!object) fail(404, 'file not found');
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream' } });
});

/**
 * The verdict. Multipart:
 *   result: clean | infected, detail
 *   security: JSON record (build.py's format), icon_min / package: generated file names
 *   artifact: files to store — replacements for compressed images, icon_min, package.zip
 */
scan.post('/versions/:id', async (c) => {
    const version = await loadVersion(c, c.req.param('id'));
    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        fail(400, 'body must be multipart/form-data');
    }
    const field = (key: string) => {
        const value = form.get(key);
        return typeof value === 'string' && value ? value : null;
    };
    const result = field('result');
    if (result !== 'clean' && result !== 'infected') fail(400, 'result must be clean or infected');
    // Only the first verdict counts; a replayed "clean" cannot undo "infected"
    if (version.status !== 'pending_scan') fail(409, `version is ${version.status}`);
    const detail = field('detail')?.slice(0, 4000) ?? null;

    if (result === 'infected') {
        await c.env.DB.prepare(`UPDATE versions SET status = 'infected', scan_detail = ?, processed_at = datetime('now') WHERE id = ?`)
            .bind(detail, version.id)
            .run();
        return c.json({ ok: true, status: 'infected' });
    }

    const iconMin = field('icon_min');
    const pkg = field('package');
    const security = field('security');
    if (security) {
        try {
            JSON.parse(security);
        } catch {
            fail(400, 'security must be JSON');
        }
    }
    // The processor may only replace this version's files and add the two it generates
    const allowed = new Set([...versionFileNames(version), ...(iconMin ? [iconMin] : []), ...(pkg ? [pkg] : [])]);
    for (const item of form.getAll('artifact')) {
        if (typeof item === 'string') continue;
        if (!allowed.has(item.name)) fail(400, `unexpected artifact "${item.name}"`);
        await c.env.FILES.put(objectKey(version, item.name), await item.arrayBuffer());
    }

    const status = version.auto_approve ? 'approved' : 'pending_review';
    const statements = [
        c.env.DB.prepare(
            `UPDATE versions SET status = ?, scan_detail = ?, icon_min = ?, package = ?, security = ?,
                                 processed_at = datetime('now'),
                                 approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END
              WHERE id = ?`,
        ).bind(status, detail, iconMin, pkg, security, status, version.id),
    ];
    if (status === 'approved') {
        statements.push(
            c.env.DB.prepare(
                `UPDATE apps SET status = CASE WHEN status = 'hidden' THEN 'hidden' ELSE 'published' END,
                                 updated_at = datetime('now')
                  WHERE id = ?`,
            ).bind(version.app_id),
        );
    }
    await c.env.DB.batch(statements);
    if (status === 'approved') {
        c.executionCtx.waitUntil(dispatch(c.env, c.env.CATALOG_REPO, 'api-sync', { slug: version.slug }));
    }
    return c.json({ ok: true, status });
});
