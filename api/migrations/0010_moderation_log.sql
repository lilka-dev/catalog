-- Moderation log and the fixes that need a column.
--
-- An item a moderator hid stays hidden until a moderator publishes it again:
-- the owner's "Return to catalog" only undoes what the owner hid. The reason
-- is shown to the owner in My apps.
ALTER TABLE apps ADD COLUMN mod_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE apps ADD COLUMN hidden_note TEXT;

-- Files a version copied from the approved one (keep_* on the upload), so
-- the review can tell "kept" from "uploaded again": processing shrinks
-- images, so a kept screenshot's checksum differs from its first upload's
ALTER TABLE versions ADD COLUMN kept TEXT;

-- What the staff did: reviews, hiding, hand-overs, bans, roles. No foreign
-- keys on what an entry is about: the entry outlives a deleted item, and
-- keeps the slug, login and version as they were at the time.
CREATE TABLE mod_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    app_slug    TEXT,
    user_id     INTEGER,
    user_login  TEXT,
    version_id  INTEGER,
    version     TEXT,
    -- JSON: the note, what changed (from, to), counts
    detail      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX mod_log_app ON mod_log (app_slug, id);
CREATE INDEX mod_log_user ON mod_log (user_id, id);
CREATE INDEX mod_log_actor ON mod_log (actor_id, id);
