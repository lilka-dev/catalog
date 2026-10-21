import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env } from './env';
import { auth, sessionMiddleware } from './auth';
import { apps, serveFile, users } from './apps';
import { moderation, scan } from './moderation';
import { catalog } from './catalog';
import { allowedOrigins, fail, safeEqual } from './util';

const app = new Hono<AppEnv>();

/**
 * Every request that reaches the Worker counts against its daily limit, and
 * on workers.dev nothing can be filtered before it arrives. What can be
 * controlled is what a request costs once here, so:
 *
 * - nothing anonymous touches the database beyond one indexed lookup; the
 *   public catalog lives on Pages, and /catalog is for the mirror job only;
 * - requests are limited per IP, and writes per user, before any database work;
 * - machine routes check their secret first and fail closed when it is unset.
 */
const machineSecret =
    (name: 'MIRROR_SECRET' | 'SCAN_SECRET'): MiddlewareHandler<AppEnv> =>
    async (c, next) => {
        const secret = c.env[name];
        const header = c.req.header('Authorization') ?? '';
        if (!secret || !(await safeEqual(header, `Bearer ${secret}`))) fail(401, 'not allowed');
        await next();
    };

const clientIp = (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => c.req.header('CF-Connecting-IP') ?? 'unknown';

const ipLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
    const { success } = await c.env.IP_LIMITER.limit({ key: clientIp(c) });
    if (!success) fail(429, 'too many requests, slow down');
    await next();
};

const writeLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
    const user = c.get('user');
    // Moderators are few and trusted, and the one-time import posts dozens of apps a minute
    if (user && user.role !== 'moderator' && c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
        const { success } = await c.env.WRITE_LIMITER.limit({ key: `user:${user.id}` });
        if (!success) fail(429, 'too many changes in a short time, try again in a minute');
    }
    await next();
};

app.use('/scan/*', machineSecret('SCAN_SECRET'));
app.use('/catalog/*', machineSecret('MIRROR_SECRET'));

app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/scan/') || c.req.path.startsWith('/catalog/')) return next();
    return ipLimit(c, next);
});
app.use('*', async (c, next) => {
    // Only the catalog site calls the API from a browser
    if (c.req.path.startsWith('/scan/') || c.req.path.startsWith('/catalog/')) return next();
    return cors({
        origin: (origin) => (allowedOrigins(c.env).includes(origin) ? origin : null),
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        maxAge: 86400,
    })(c, next);
});
app.use('*', sessionMiddleware);
app.use('*', writeLimit);

app.get('/', (c) => c.json({ name: 'lilka-catalog-api', ok: true }));
app.route('/auth', auth);
app.route('/apps', apps);
app.route('/users', users);
app.route('/mod', moderation);
app.route('/scan', scan);
app.route('/catalog', catalog);
app.get('/files/:slug/:id/:name', serveFile);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: 'internal error' }, 500);
});

export default {
    fetch: app.fetch,

    /** Daily cleanup: expired sessions. */
    async scheduled(_event: ScheduledController, env: Env): Promise<void> {
        await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
    },
} satisfies ExportedHandler<Env>;
