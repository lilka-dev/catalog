import { Hono, type MiddlewareHandler } from 'hono';
import type { AppEnv, Env, Role, User } from './env';
import { allowedOrigins, csv, fail, randomToken, requireUser, sha256Hex, signToken, verifyToken } from './util';

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
    bio?: string | null;
    blog?: string | null;
    location?: string | null;
    company?: string | null;
}

/** Profile text is shown on the public Authors page: short, single-line, trimmed. */
function profileText(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, max) : null;
}

/** GitHub lets "blog" be anything, often without a scheme; only http(s) links are kept. */
function profileUrl(value: unknown): string | null {
    const text = profileText(value, 200);
    if (!text) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
        return null;
    }
}

export const auth = new Hono<AppEnv>();

/**
 * The OAuth `state` is signed, not stored.
 *
 * It used to be a row in D1, so every visit to /auth/login was a database
 * write, and a flood of them could use up D1's daily write quota and stop the
 * whole API. A signed token carries the return URL and expiry itself, and
 * nobody without the key can make one, which is what protects the callback
 * from CSRF. The key is derived from the GitHub client secret, so there is no
 * extra secret to manage.
 */
interface OAuthState {
    r: string; // return URL, already checked against ALLOWED_ORIGINS
    e: number; // expiry, ms since epoch
    n: string; // nonce: two logins never share a state
}

function stateKey(env: Env): string {
    if (!env.GITHUB_CLIENT_SECRET) fail(502, 'GitHub login is not configured');
    return `oauth-state:${env.GITHUB_CLIENT_SECRET}`;
}

auth.get('/login', async (c) => {
    const returnTo = checkReturnUrl(c.env, c.req.query('return'));
    if (!c.env.GITHUB_CLIENT_ID) fail(502, 'GitHub login is not configured');
    const payload: OAuthState = { r: returnTo, e: Date.now() + STATE_MINUTES * 60_000, n: randomToken(12) };
    const state = await signToken(stateKey(c.env), payload);

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

    const signed = await verifyToken<OAuthState>(stateKey(c.env), state);
    if (!signed || typeof signed.r !== 'string' || typeof signed.e !== 'number' || signed.e < Date.now()) {
        fail(400, 'login expired, try again');
    }
    // Checked again in case ALLOWED_ORIGINS changed while the user was on GitHub
    const row = { return_to: checkReturnUrl(c.env, signed.r) };

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
    // Best effort: a GitHub hiccup must not break the sign-in itself
    await claimImportedApps(c.env, gh, tokenBody.access_token).catch((error) =>
        console.error(`claiming imported apps for ${gh.login} failed: ${error}`),
    );
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
 * The moderator list in config is the single source of truth: removing an id
 * from it demotes that user on their next sign-in. A ban set in the database
 * survives every sign-in.
 *
 * MODERATORS holds GitHub numeric ids, not logins: a login is freed when its
 * owner renames the account, and whoever registers it next would otherwise
 * sign in as a moderator.
 */
export async function createSession(env: Env, gh: GithubUser): Promise<string> {
    const moderators = csv(env.MODERATORS);
    const role: Role = moderators.includes(String(gh.id)) ? 'moderator' : 'user';
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
            `INSERT INTO users (id, login, name, avatar_url, role, bio, blog, location, company)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT (id) DO UPDATE SET
                 login = excluded.login,
                 name = excluded.name,
                 avatar_url = excluded.avatar_url,
                 bio = excluded.bio,
                 blog = excluded.blog,
                 location = excluded.location,
                 company = excluded.company,
                 role = CASE WHEN users.role = 'banned' THEN 'banned' ELSE excluded.role END`,
        ).bind(
            gh.id,
            gh.login,
            profileText(gh.name, 100),
            gh.avatar_url,
            role,
            profileText(gh.bio, 300),
            profileUrl(gh.blog),
            profileText(gh.location, 100),
            profileText(gh.company, 100),
        ),
        env.DB.prepare(
            `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`,
        ).bind(tokenHash, gh.id, `+${SESSION_DAYS} days`),
    ]);
    return token;
}

const GITHUB_REPO = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i;

/**
 * Hands imported apps over to their author.
 *
 * Apps from the old repo belong to the catalog account. An app goes to the
 * signing-in user only when its author line is their login AND GitHub says
 * they own the repository the app's sources point at, checked by numeric id
 * with their own token. The login alone is not proof: after a rename the old
 * login can be registered by someone else.
 *
 * Mods (authors are Printables names) and apps whose sources live elsewhere,
 * e.g. lilka-dev/examples, are handed over by a moderator instead.
 */
export async function claimImportedApps(env: Env, gh: GithubUser, githubToken: string): Promise<number> {
    const { results } = await env.DB.prepare(
        `SELECT id, sources_url FROM apps
          WHERE owner_id = 0 AND kind IN ('app', 'wallpaper') AND lower(author) = lower('@' || ?)
            AND NOT EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'banned')
          LIMIT 50`,
    )
        .bind(gh.login, gh.id)
        .all<{ id: number; sources_url: string }>();

    const owned = new Map<string, boolean>();
    const claim: number[] = [];
    for (const app of results) {
        const match = GITHUB_REPO.exec(app.sources_url);
        if (!match || match[1].toLowerCase() !== gh.login.toLowerCase()) continue;
        const repo = `${match[1]}/${match[2].replace(/\.git$/, '')}`.toLowerCase();
        if (!owned.has(repo)) {
            const response = await fetch(`https://api.github.com/repos/${repo}`, {
                headers: {
                    Authorization: `Bearer ${githubToken}`,
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'lilka-catalog-api',
                },
            });
            const body = response.ok ? ((await response.json()) as { owner?: { id?: number } }) : null;
            owned.set(repo, body?.owner?.id === gh.id);
        }
        if (owned.get(repo)) claim.push(app.id);
    }
    if (claim.length) {
        await env.DB.prepare(
            `UPDATE apps SET owner_id = ?, updated_at = datetime('now')
              WHERE owner_id = 0 AND id IN (${claim.map(() => '?').join(',')})`,
        )
            .bind(gh.id, ...claim)
            .run();
    }
    return claim.length;
}
