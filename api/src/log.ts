import { Hono } from 'hono';
import type { AppEnv, Env, User } from './env';
import { requirePermission } from './permissions';
import { fail } from './util';

/**
 * The moderation log: what staff did, by whom and when (migration 0010).
 *
 * Every staff action adds one row in the same batch as the change itself, so
 * there is no change without its entry. Authors' own actions on their own
 * items are not logged: this is the record of moderation, not of activity.
 */
export type LogAction =
    | 'version.approve'
    | 'version.reject'
    | 'version.withdraw'
    | 'item.edit'
    | 'item.hide'
    | 'item.publish'
    | 'item.owner'
    | 'item.author'
    | 'item.delete'
    | 'item.import'
    | 'report.resolve'
    | 'user.ban'
    | 'user.unban'
    | 'user.trust'
    | 'user.note'
    | 'user.sign_out'
    | 'user.ratings'
    | 'user.role';

export interface LogEntry {
    action: LogAction;
    app?: { slug: string } | null;
    user?: { id: number; login: string } | null;
    version?: { id: number; version: string } | null;
    detail?: Record<string, unknown> | null;
}

/** The insert for one entry, to run in the batch of the change it records. */
export function logStatement(env: Env, actor: User, entry: LogEntry): D1PreparedStatement {
    const detail = entry.detail && Object.keys(entry.detail).length ? JSON.stringify(entry.detail) : null;
    return env.DB.prepare(
        `INSERT INTO mod_log (actor_id, action, app_slug, user_id, user_login, version_id, version, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
        actor.id,
        entry.action,
        entry.app?.slug ?? null,
        entry.user?.id ?? null,
        entry.user?.login ?? null,
        entry.version?.id ?? null,
        entry.version?.version ?? null,
        detail,
    );
}

const PAGE = 50;

export const log = new Hono<AppEnv>();

/**
 * Newest first, 50 at a time: `?before=<id>` for the next page. `?app=<slug>`
 * for one item (also after it was deleted), `?user=<login>` for what was done
 * to a person and what they did as staff.
 */
log.get('/', async (c) => {
    requirePermission(c, 'log');
    const where: string[] = [];
    const params: unknown[] = [];
    const app = c.req.query('app');
    if (app) {
        where.push('l.app_slug = ?');
        params.push(app);
    }
    const login = c.req.query('user');
    if (login) {
        const user = await c.env.DB.prepare(`SELECT id FROM users WHERE login = ? COLLATE NOCASE`)
            .bind(login.replace(/^@/, ''))
            .first<{ id: number }>();
        if (!user) fail(404, 'user not found');
        where.push('(l.user_id = ? OR l.actor_id = ?)');
        params.push(user.id, user.id);
    }
    const before = Number.parseInt(c.req.query('before') ?? '', 10);
    if (Number.isInteger(before) && before > 0) {
        where.push('l.id < ?');
        params.push(before);
    }
    const { results } = await c.env.DB.prepare(
        `SELECT l.id, l.action, l.app_slug, l.user_login, l.version_id, l.version, l.detail, l.created_at,
                a.login AS actor
           FROM mod_log l LEFT JOIN users a ON a.id = l.actor_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY l.id DESC LIMIT ?`,
    )
        .bind(...params, PAGE + 1)
        .all<{
            id: number;
            action: LogAction;
            app_slug: string | null;
            user_login: string | null;
            version_id: number | null;
            version: string | null;
            detail: string | null;
            created_at: string;
            actor: string | null;
        }>();
    const items = results.slice(0, PAGE).map(({ detail, ...row }) => {
        let parsed: unknown = null;
        try {
            parsed = detail ? JSON.parse(detail) : null;
        } catch {
            parsed = null;
        }
        return { ...row, detail: parsed };
    });
    return c.json({ items, has_more: results.length > PAGE });
});
