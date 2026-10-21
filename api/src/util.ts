import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env, User } from './env';

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 502 | 503, message: string): never {
    throw new HTTPException(status, { message });
}

export function requireUser(c: Context<AppEnv>): User {
    const user = c.get('user');
    if (!user) fail(401, 'sign in required');
    if (user.role === 'banned') fail(403, 'account is banned');
    return user;
}

export function requireModerator(c: Context<AppEnv>): User {
    const user = requireUser(c);
    if (user.role !== 'moderator') fail(403, 'moderator only');
    return user;
}

export function csv(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function allowedOrigins(env: Env): string[] {
    return csv(env.ALLOWED_ORIGINS);
}

export function randomToken(bytes = 32): string {
    const data = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...data))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares secrets without leaking their length or common prefix through timing. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
    const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
    let diff = 0;
    for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
    return diff === 0;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
// The catalog build flattens every file into one folder by its basename, so
// names must be plain and unique within a version.
export const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

// Imported apps keep the names they had in the repo, e.g. `LilkaCubes` or
// `bmp280%2Bbme280_lilka.lua`: Keira already caches entries under them
export const LOOSE_NAME_RE = /^(?!\.\.?$)[^/\\\x00-\x1f]{1,200}$/;

export type EntryType = 'lua' | 'archive' | 'binary' | 'js';
export const ENTRY_TYPES: readonly EntryType[] = ['lua', 'archive', 'binary', 'js'];

/** Same mapping as `infer_type_from_extension` in the old catalog build.py, plus mJS. */
export function entryTypeOf(filename: string): EntryType | null {
    const name = filename.toLowerCase();
    if (name.endsWith('.lua')) return 'lua';
    if (name.endsWith('.js')) return 'js';
    if (name.endsWith('.bin')) return 'binary';
    if (/\.(zip|tar|tar\.gz|tgz)$/.test(name)) return 'archive';
    return null;
}

export function isImageName(filename: string): boolean {
    return /\.(png|jpe?g)$/i.test(filename);
}

const CONTENT_TYPES: Record<string, string> = {
    lua: 'text/plain; charset=utf-8',
    js: 'text/plain; charset=utf-8',
    bin: 'application/octet-stream',
    stl: 'model/stl',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    zip: 'application/zip',
    json: 'application/json',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
};

export function contentTypeOf(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function parseJsonArray<T>(value: string | null | undefined): T[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function readJson<T>(c: Context<AppEnv>): Promise<T> {
    try {
        return (await c.req.json()) as T;
    } catch {
        fail(400, 'body must be JSON');
    }
}

/**
 * Asks GitHub to run a workflow through `repository_dispatch`.
 *
 * Without a token this is a no-op: local development and a fresh deploy keep
 * working, and the scan workflow's schedule picks up anything that was missed.
 */
export async function dispatch(
    env: Env,
    repo: string,
    eventType: string,
    payload: Record<string, unknown>,
): Promise<void> {
    if (!env.GITHUB_DISPATCH_TOKEN || !repo) return;
    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'lilka-catalog-api',
        },
        body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    });
    if (!response.ok) {
        console.error(`dispatch ${eventType} to ${repo} failed: ${response.status} ${await response.text()}`);
    }
}
