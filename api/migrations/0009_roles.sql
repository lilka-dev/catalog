-- Staff roles granted on the website (Moderation → Roles): who has which
-- role, who granted it and when. What each role may do is in
-- src/permissions.ts. users.role keeps only the account state: 'user' or
-- 'banned'.
--
-- A table of its own rather than more values in the CHECK of users.role:
-- changing a CHECK means rebuilding users, and on D1 that means rebuilding
-- every table that references it (see 0002).
CREATE TABLE staff (
    user_id     INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('main_admin', 'admin', 'moderator')),
    granted_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
    granted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Moderators so far had every power there was; they become the main admins.
-- From here on roles exist only in this table: main admins grant every role
-- on the website.
-- users.role = 'moderator' stays for the old Worker, which runs until the
-- deploy finishes; the new one ignores it and resets it at the next sign-in.
INSERT INTO staff (user_id, role) SELECT id, 'main_admin' FROM users WHERE role = 'moderator';
