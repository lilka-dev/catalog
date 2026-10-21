import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv, Env, Role, User } from './env';
import { allowedOrigins, csv, fail, randomToken, requireUser, sha256Hex } from './util';

const SESSION_DAYS = 30;
const STATE_MINUTES = 10;

/**
 * Sessions are bearer tokens, not cookies.
 *
 * The API lives on a different site than catalog.lilka.dev and the web IDE,
 * and browsers block third-party cookies, so a cookie session would silently
 * stop working. The token reaches the page in the URL fragment, which is never
 * sent to any server.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    c.set('user', null);
    c.set('tokenHash', null);
    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/.exec(header);
    if (match) {
        const tokenHash = await sha256Hex(match[1]);
        const user = await c.env.DB.prepare(
            `SELECT u.id, u.login, u.name, u.avatar_url, u.role
               FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
        )
            .bind(tokenHash)
            .first<User>();
        if (user) {
            c.set('user', user);
            c.set('tokenHash', tokenHash);
        }
    }
    await next();
};

/** Only these sites may receive a token, otherwise any page could phish one. */
function checkReturnUrl(env: Env, value: string | undefined): string {
    if (!value) fail(400, 'return is required');
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        fail(400, 'return must be an absolute URL');
    }
    if (!allowedOrigins(env).includes(url.origin)) fail(400, 'return origin is not allowed');
    return url.toString();
}

function callbackUrl(env: Env): string {
    return `${env.PUBLIC_URL.replace(/\/$/, '')}/auth/callback`;
}

interface GithubUser {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
}

export const auth = new Hono<AppEnv>();

auth.get('/login', async (c) => {
    const returnTo = checkReturnUrl(c.env, c.req.query('return'));
    if (!c.env.GITHUB_CLIENT_ID) fail(502, 'GitHub login is not configured');
    const state = randomToken(16);

    await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM oauth_states WHERE expires_at <= datetime('now')`),
        c.env.DB.prepare(
            `INSERT INTO oauth_states (state, return_to, expires_at) VALUES (?, ?, datetime('now', ?))`,
        ).bind(state, returnTo, `+${STATE_MINUTES} minutes`),
    ]);

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
    url.searchParams.set('redirect_uri', callbackUrl(c.env));
    url.searchParams.set('state', state);
    // No scope: only the public profile is needed to know who the user is.
    // The GitHub token itself is thrown away right after the callback.
    url.searchParams.set('scope', '');
    return c.redirect(url.toString(), 302);
});

auth.get('/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) fail(400, 'code and state are required');

    const row = await c.env.DB.prepare(
        `DELETE FROM oauth_states WHERE state = ? AND expires_at > datetime('now') RETURNING return_to`,
    )
        .bind(state)
        .first<{ return_to: string }>();
    if (!row) fail(400, 'login expired, try again');

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: c.env.GITHUB_CLIENT_ID,
            client_secret: c.env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: callbackUrl(c.env),
        }),
    });
    const tokenBody = (await tokenResponse.json()) as { access_token?: string; error_description?: string };
    if (!tokenBody.access_token) fail(502, tokenBody.error_description ?? 'GitHub did not return a token');

    const userResponse = await fetch('https://api.github.com/user', {
        headers: {
            Authorization: `Bearer ${tokenBody.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'lilka-catalog-api',
        },
    });
    if (!userResponse.ok) fail(502, 'could not read the GitHub profile');
    const gh = (await userResponse.json()) as GithubUser;

    const token = await createSession(c.env, gh);
    const target = new URL(row.return_to);
    target.hash = `lilka_token=${token}`;
    return c.redirect(target.toString(), 302);
});

auth.post('/logout', async (c) => {
    const tokenHash = c.get('tokenHash');
    if (tokenHash) await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
    return c.json({ ok: true });
});

auth.get('/me', (c) => c.json({ user: requireUser(c) }));

/**
 * Creates or refreshes the user and opens a session.
 *
 * The moderator list in config is the single source of truth: removing a login
 * from it demotes that user on their next sign-in. A ban set in the database
 * survives every sign-in.
 */
export async function createSession(env: Env, gh: GithubUser): Promise<string> {
    const moderators = csv(env.MODERATORS).map((login) => login.toLowerCase());
    const role: Role = moderators.includes(gh.login.toLowerCase()) ? 'moderator' : 'user';
    const token = randomToken();
    const tokenHash = await sha256Hex(token);

    await env.DB.batch([
        // GitHub logins can be renamed and then taken by someone else; the old
        // holder keeps their id and gets a placeholder until they sign in again
        env.DB.prepare(`UPDATE users SET login = login || '#' || id WHERE login = ?1 COLLATE NOCASE AND id != ?2`).bind(
            gh.login,
            gh.id,
        ),
        env.DB.prepare(
            `INSERT INTO users (id, login, name, avatar_url, role) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (id) DO UPDATE SET
                 login = excluded.login,
                 name = excluded.name,
                 avatar_url = excluded.avatar_url,
                 role = CASE WHEN users.role = 'banned' THEN 'banned' ELSE excluded.role END`,
        ).bind(gh.id, gh.login, gh.name, gh.avatar_url, role),
        env.DB.prepare(
            `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`,
        ).bind(tokenHash, gh.id, `+${SESSION_DAYS} days`),
    ]);
    return token;
}
