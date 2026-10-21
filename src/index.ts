import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env } from './env';
import { auth, sessionMiddleware } from './auth';
import { apps, serveFile, users } from './apps';
import { moderation, scan } from './moderation';
import { exportRoutes } from './export';
import { allowedOrigins } from './util';

const app = new Hono<AppEnv>();

// Files are public and get their own `*` CORS in serveFile's route below;
// everything else carries a session and is limited to our own sites
app.use('/files/*', cors({ origin: '*', allowHeaders: ['Authorization'] }));
app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/files/')) return next();
    return cors({
        origin: (origin) => (allowedOrigins(c.env).includes(origin) ? origin : null),
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        maxAge: 86400,
    })(c, next);
});
app.use('*', sessionMiddleware);

app.get('/', (c) => c.json({ name: 'lilka-catalog-api', ok: true }));
app.route('/auth', auth);
app.route('/apps', apps);
app.route('/users', users);
app.route('/mod', moderation);
app.route('/scan', scan);
app.route('/export', exportRoutes);
app.get('/files/:slug/:id/:name', serveFile);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: 'internal error' }, 500);
});

export default {
    fetch: app.fetch,

    /** Daily cleanup: expired sessions and abandoned logins. */
    async scheduled(_event: ScheduledController, env: Env): Promise<void> {
        await env.DB.batch([
            env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`),
            env.DB.prepare(`DELETE FROM oauth_states WHERE expires_at <= datetime('now')`),
        ]);
    },
} satisfies ExportedHandler<Env>;
