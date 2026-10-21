-- The API becomes the only source of the catalog: apps from the old repo are
-- imported, mods join apps and wallpapers, and processed artifacts (icon_min,
-- package.zip, checksums) are tracked per version.
--
-- SQLite cannot change CHECK constraints in place, so the tables are rebuilt.
-- D1 always enforces foreign keys and DROP TABLE runs an implicit DELETE that
-- fires ON DELETE CASCADE, so every table that points at `apps` is copied out
-- and dropped first; otherwise dropping `apps` would wipe them.

CREATE TABLE apps_bak AS SELECT * FROM apps;
CREATE TABLE versions_bak AS SELECT * FROM versions;
CREATE TABLE ratings_bak AS SELECT * FROM ratings;
CREATE TABLE reports_bak AS SELECT * FROM reports;

DROP TABLE reports;
DROP TABLE ratings;
DROP TABLE versions;
DROP TABLE apps;

CREATE TABLE apps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Also the catalog folder name that Keira requests. New apps use the strict
    -- slug format; imported ones keep their historic names, e.g. `LilkaCubes`
    slug            TEXT NOT NULL UNIQUE,
    owner_id        INTEGER NOT NULL REFERENCES users (id),
    kind            TEXT NOT NULL CHECK (kind IN ('app', 'wallpaper', 'mod')),
    -- Shown as the author; NULL means "@<owner login>"
    author          TEXT,
    name_uk         TEXT,
    name_en         TEXT,
    short_uk        TEXT,
    short_en        TEXT,
    description_uk  TEXT,
    description_en  TEXT,
    sources_type    TEXT,
    sources_url     TEXT NOT NULL,
    license         TEXT,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX apps_owner ON apps (owner_id);
CREATE INDEX apps_status ON apps (status, kind);

CREATE TABLE versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id          INTEGER NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
    version         TEXT NOT NULL,
    keira_version   TEXT,
    -- Mods are 3D-printable parts: no entry file, only images and model files
    entry_type      TEXT CHECK (entry_type IN ('lua', 'archive', 'binary', 'js')),
    entry_file      TEXT,
    files           TEXT NOT NULL DEFAULT '[]',
    -- Repo manifests could describe extra files (`type`, `description`); the
    -- entries are kept as written, with `location` reduced to the file name
    files_meta      TEXT,
    icon            TEXT,
    screenshots     TEXT NOT NULL DEFAULT '[]',
    -- `changelog` is the Ukrainian (default) text; repo manifests could also
    -- carry an English one
    changelog       TEXT,
    changelog_en    TEXT,
    checksums       TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'pending_scan'
                    CHECK (status IN ('pending_scan', 'pending_review', 'approved', 'rejected', 'infected')),
    -- Imports skip the moderator: they were already reviewed as repo PRs
    auto_approve    INTEGER NOT NULL DEFAULT 0,
    -- Filled by the processing workflow
    icon_min        TEXT,
    package         TEXT,
    security        TEXT,
    processed_at    TEXT,
    -- R2 folder of this version's files: `<app id>-<app slug>/v/<version>`,
    -- readable in the dashboard. Rows from before this migration keep `v/<id>`
    storage_prefix  TEXT NOT NULL,
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

INSERT INTO apps (id, slug, owner_id, kind, name_uk, name_en, short_uk, short_en, description_uk,
                  description_en, sources_url, license, status, created_at, updated_at)
    SELECT id, slug, owner_id, kind, name_uk, name_en, short_uk, short_en, description_uk,
           description_en, sources_url, license, status, created_at, updated_at FROM apps_bak;
INSERT INTO versions (id, app_id, version, keira_version, entry_type, entry_file, files, icon, screenshots,
                      changelog, checksums, status, storage_prefix, scan_detail, review_note, reviewed_by,
                      created_at, approved_at)
    SELECT id, app_id, version, keira_version, entry_type, entry_file, files, icon, screenshots,
           changelog, checksums, status, 'v/' || id, scan_detail, review_note, reviewed_by, created_at, approved_at
      FROM versions_bak;
INSERT INTO ratings SELECT * FROM ratings_bak;
INSERT INTO reports SELECT * FROM reports_bak;

DROP TABLE apps_bak;
DROP TABLE versions_bak;
DROP TABLE ratings_bak;
DROP TABLE reports_bak;

-- Owner of the apps imported from the old repo. Id 0 is never a GitHub id.
INSERT OR IGNORE INTO users (id, login, name, role) VALUES (0, 'lilka-catalog', 'Lilka catalog', 'user');
