import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';
import { serializeVersion, type VersionRow } from './apps';
import { dispatch, fail, readJson, requireModerator, safeEqual } from './util';

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
        `SELECT v.*, a.slug, a.kind, a.name_uk, a.name_en, u.login AS owner_login
           FROM versions v JOIN apps a ON a.id = v.app_id JOIN users u ON u.id = a.owner_id
          WHERE v.status = ? ORDER BY v.created_at ASC LIMIT 100`,
    )
        .bind(status)
        .all<VersionRow & { slug: string; kind: string; name_uk: string | null; name_en: string | null; owner_login: string }>();
    return c.json({
        items: results.map((v) => ({
            app: { slug: v.slug, kind: v.kind, name: { uk: v.name_uk, en: v.name_en }, owner: v.owner_login },
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

/* -------------------------------------------------------------- scanner ------ */

/**
 * Endpoints for the ClamAV workflow in GitHub Actions.
 *
 * The scanner authenticates with a shared secret rather than a user session:
 * it is a machine, and it needs to read files that no user may see yet.
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
        `SELECT id FROM versions WHERE status = 'pending_scan' ORDER BY id ASC LIMIT 50`,
    ).all<{ id: number }>();
    return c.json({ ids: results.map((r) => r.id) });
});

scan.get('/versions/:id', async (c) => {
    const version = await loadVersion(c, c.req.param('id'));
    const base = c.env.PUBLIC_URL.replace(/\/$/, '');
    const names = [
        version.entry_file,
        ...JSON.parse(version.files),
        ...(version.icon ? [version.icon] : []),
        ...JSON.parse(version.screenshots),
    ] as string[];
    return c.json({
        id: version.id,
        status: version.status,
        files: names.map((name) => ({ name, url: `${base}/scan/files/${version.id}/${encodeURIComponent(name)}` })),
    });
});

scan.get('/files/:id/:name', async (c) => {
    const object = await c.env.FILES.get(`v/${Number(c.req.param('id'))}/${c.req.param('name')}`);
    if (!object) fail(404, 'file not found');
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream' } });
});

scan.post('/versions/:id', async (c) => {
    const version = await loadVersion(c, c.req.param('id'));
    const { result, detail } = await readJson<{ result?: unknown; detail?: unknown }>(c);
    if (result !== 'clean' && result !== 'infected') fail(400, 'result must be clean or infected');
    // Only the first verdict counts; a replayed "clean" cannot undo "infected"
    if (version.status !== 'pending_scan') fail(409, `version is ${version.status}`);
    await c.env.DB.prepare(`UPDATE versions SET status = ?, scan_detail = ? WHERE id = ?`)
        .bind(result === 'clean' ? 'pending_review' : 'infected', typeof detail === 'string' ? detail.slice(0, 4000) : null, version.id)
        .run();
    return c.json({ ok: true });
});
