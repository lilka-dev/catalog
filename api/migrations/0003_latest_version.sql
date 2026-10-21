-- Each app points at its current public version.
--
-- The catalog asked "latest approved version of every app" with a correlated
-- subquery that D1 could not answer from an index: it scanned the whole
-- versions table once per app, about 4,000 rows per /catalog/export.json and
-- growing with apps x versions. With D1's 5M rows/day free quota, ~1,200
-- requests were enough to stop the API for the day. A primary-key join reads
-- a few rows per app instead.
ALTER TABLE apps ADD COLUMN latest_version_id INTEGER REFERENCES versions (id) ON DELETE SET NULL;

UPDATE apps SET latest_version_id = (
    SELECT v.id FROM versions v
     WHERE v.app_id = apps.id AND v.status = 'approved'
     ORDER BY v.approved_at DESC, v.id DESC LIMIT 1
);

-- OAuth state is a signed token now (auth.ts); nothing reads this table
DROP TABLE oauth_states;

-- Owners' and moderators' version lists
CREATE INDEX versions_app ON versions (app_id, id);
