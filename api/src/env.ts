export interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    /** Per client IP, every route except the secret-protected machine routes. */
    IP_LIMITER: RateLimit;
    /** Per signed-in user, every request that changes something. */
    WRITE_LIMITER: RateLimit;
    /** Per signed-in user, uploads of new versions. */
    UPLOAD_LIMITER: RateLimit;

    PUBLIC_URL: string;
    GITHUB_CLIENT_ID: string;
    ALLOWED_ORIGINS: string;
    SCAN_REPO: string;
    CATALOG_REPO: string;

    GITHUB_CLIENT_SECRET?: string;
    SCAN_SECRET?: string;
    /** For the Pages mirror job; /catalog answers nobody else. */
    MIRROR_SECRET?: string;
    GITHUB_DISPATCH_TOKEN?: string;
}

/** The role a user acts with; who may do what is in permissions.ts. */
export type Role = 'main_admin' | 'admin' | 'moderator' | 'user' | 'banned';

export interface User {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
    /** Effective role: a ban, then the staff table (permissions.ts effectiveRole). */
    role: Role;
    /** Set by a moderator: no per-account item limits (migration 0008). */
    trusted: number;
}

export type AppEnv = {
    Bindings: Env;
    Variables: { user: User | null; tokenHash: string | null };
};
