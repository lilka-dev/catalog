import type { Context } from 'hono';
import type { AppEnv, Role, User } from './env';
import { fail, requireUser } from './util';

/**
 * Who may do what, in one place.
 *
 * A role is a set of permissions, and MATRIX below is the only place that says
 * which. Routes ask for a permission (`requirePermission(c, 'review')`), never
 * for a role, so moving a permission from one role to another is a one-line
 * change here. The website reads the same matrix from GET /mod/roles and shows
 * it as a table in Moderation → Roles.
 *
 * Roles, highest first. Nobody is named in the repository: staff roles live in
 * the staff table (migration 0009) and are granted on the website.
 *   main_admin  everything, including making other main admins
 *   admin       granted by a main admin
 *   moderator   granted by an admin or a main admin
 *   user        everyone who signs in
 *   banned      set by a ban; no permissions at all
 *
 * Nobody changes their own role, and only a main admin takes the role from
 * another main admin, so there is always at least one main admin left.
 */
export const ROLES: readonly Role[] = ['main_admin', 'admin', 'moderator', 'user', 'banned'];

/** Roles kept in the staff table and granted through the API, highest first. */
export const STAFF_ROLES = ['main_admin', 'admin', 'moderator'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
    /** The review queue: preview files, approve and reject versions. */
    'review',
    /** See and resolve reports. */
    'reports',
    /** All items: edit any item, hide or publish it, change its author line and owner. */
    'items.edit',
    /** Delete an item for good, with its versions, files, ratings and reports. */
    'items.delete',
    /** Import apps from the old catalog repository (scripts/import_catalog.py). */
    'items.import',
    /** The Users tab: everyone who has signed in, with their activity. */
    'users.view',
    /** Trust a user, keep a note, end their sessions, remove their ratings. */
    'users.manage',
    /** Ban and unban users. */
    'users.ban',
    /** Make users moderators and take the role back. */
    'roles.moderator',
    /** Make users admins and take the role back. */
    'roles.admin',
    /** Make users main admins and take the role back from another main admin. */
    'roles.main_admin',
    /** No per-account limits on items, uploads and changes. */
    'limits.exempt',
    /** The moderation log: what staff did, by whom and when. */
    'log',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MODERATOR: readonly Permission[] = [
    'review',
    'reports',
    'items.edit',
    'users.view',
    'users.manage',
    'users.ban',
    'limits.exempt',
    'log',
];
const ADMIN: readonly Permission[] = [...MODERATOR, 'items.delete', 'items.import', 'roles.moderator'];
const MAIN_ADMIN: readonly Permission[] = [...ADMIN, 'roles.admin', 'roles.main_admin'];

export const MATRIX: Readonly<Record<Role, readonly Permission[]>> = {
    main_admin: MAIN_ADMIN,
    admin: ADMIN,
    moderator: MODERATOR,
    user: [],
    banned: [],
};

const RANK: Readonly<Record<Role, number>> = { main_admin: 3, admin: 2, moderator: 1, user: 0, banned: 0 };

/**
 * The role a user acts with: a ban first, then a role from the staff table.
 * `accountRole` is users.role, where only 'banned' counts ('moderator' there
 * is a leftover from before migration 0009).
 */
export function effectiveRole(accountRole: string, staffRole: string | null | undefined): Role {
    if (accountRole === 'banned') return 'banned';
    if (STAFF_ROLES.includes(staffRole as StaffRole)) return staffRole as StaffRole;
    return 'user';
}

export function isStaff(role: Role): boolean {
    return RANK[role] > 0;
}

/** Strictly higher: nobody ends the sessions of a peer or of someone above them. */
export function outranks(actor: User, targetRole: Role): boolean {
    return RANK[actor.role] > RANK[targetRole];
}

export function can(user: User | null | undefined, permission: Permission): boolean {
    return !!user && MATRIX[user.role].includes(permission);
}

export function requirePermission(c: Context<AppEnv>, permission: Permission): User {
    const user = requireUser(c);
    if (!can(user, permission)) fail(403, `your role cannot do this (needs ${permission})`);
    return user;
}

/** The gate of /mod: any staff role. Each route then asks for its own permission. */
export function requireStaff(c: Context<AppEnv>): User {
    const user = requireUser(c);
    if (!isStaff(user.role)) fail(403, 'moderator only');
    return user;
}

/** The staff roles this user may grant and take back. */
export function assignableRoles(user: User): StaffRole[] {
    return STAFF_ROLES.filter((role) => can(user, `roles.${role}`));
}

/**
 * Why `actor` may not move `target` from their current role to `next`, or
 * null when they may. Both the role taken away and the role given need the
 * matching `roles.*` permission: an admin can make and unmake moderators, but
 * cannot touch another admin or a main admin.
 */
export function roleChangeRefusal(
    actor: User,
    target: { id: number; role: Role },
    next: unknown,
): { status: 400 | 403 | 409; message: string } | null {
    if (next !== 'user' && !STAFF_ROLES.includes(next as StaffRole)) {
        return { status: 400, message: `role must be one of user, ${STAFF_ROLES.join(', ')}` };
    }
    if (target.id === 0) return { status: 409, message: 'the catalog account is not a person' };
    // Also what keeps the last main admin: only another main admin can demote one
    if (target.id === actor.id) return { status: 409, message: 'you cannot change your own role' };
    if (target.role === 'banned') return { status: 409, message: 'unban the user first' };
    for (const role of [target.role, next as Role]) {
        if (role !== 'user' && !can(actor, `roles.${role as StaffRole}`)) {
            return { status: 403, message: `your role cannot grant or take away ${role}` };
        }
    }
    return null;
}
