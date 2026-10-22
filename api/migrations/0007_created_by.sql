-- Who created an item, as opposed to who owns it now. The per-account limits
-- (3 new items a day, 20 in all) count what a user created: imports handed
-- over to their author were created by the import, and counting them blocked
-- authors from adding anything for a day after the hand-over.
-- (0006 is ratings_by_user on a parallel branch; the order does not matter.)
ALTER TABLE apps ADD COLUMN created_by INTEGER REFERENCES users (id);
-- Imports are the apps whose version skipped review; everything else was
-- created by its current owner (nothing user-made has been handed over yet)
UPDATE apps SET created_by = owner_id
 WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
CREATE INDEX apps_created_by ON apps (created_by, created_at);
