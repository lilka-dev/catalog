-- Users are GitHub accounts; the id is GitHub's numeric user id, which never
-- changes even when the login is renamed.
CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    login       TEXT NOT NULL,
    name        TEXT,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'banned')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX users_login ON users (login COLLATE NOCASE);

-- Only a hash of the bearer token is stored, so a leaked database does not
-- leak working sessions.
CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- OAuth `state` values: protects the callback from CSRF and remembers where to
-- send the user back.
CREATE TABLE oauth_states (
    state       TEXT PRIMARY KEY,
    return_to   TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);

CREATE TABLE apps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL UNIQUE,
    owner_id        INTEGER NOT NULL REFERENCES users (id),
    kind            TEXT NOT NULL CHECK (kind IN ('app', 'wallpaper')),
    name_uk         TEXT,
    name_en         TEXT,
    short_uk        TEXT,
    short_en        TEXT,
    description_uk  TEXT,
    description_en  TEXT,
    sources_url     TEXT NOT NULL,
    license         TEXT,
    -- draft: no approved version yet; published: visible; hidden: owner or
    -- moderator took it down
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX apps_owner ON apps (owner_id);
CREATE INDEX apps_status ON apps (status, kind);

-- One uploaded release. Files live in R2 under `v/<version id>/<filename>`.
CREATE TABLE versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id          INTEGER NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
    version         TEXT NOT NULL,
    keira_version   TEXT NOT NULL,
    entry_type      TEXT NOT NULL CHECK (entry_type IN ('lua', 'archive', 'binary')),
    entry_file      TEXT NOT NULL,
    -- JSON arrays of filenames
    files           TEXT NOT NULL DEFAULT '[]',
    icon            TEXT,
    screenshots     TEXT NOT NULL DEFAULT '[]',
    changelog       TEXT,
    -- JSON: [{ "name", "size", "sha256" }], filled by the upload and the scan
    checksums       TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'pending_scan'
                    CHECK (status IN ('pending_scan', 'pending_review', 'approved', 'rejected', 'infected')),
    scan_detail     TEXT,
    review_note     TEXT,
    reviewed_by     INTEGER REFERENCES users (id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at     TEXT,
    UNIQUE (app_id, version)
);
CREATE INDEX versions_status ON versions (status);

CREATE TABLE ratings (
    app_id      INTEGER NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    stars       INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (app_id, user_id)
);

CREATE TABLE reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id      INTEGER NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    resolved    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX reports_open ON reports (resolved, created_at);
