-- Moderator tools: a private note per user, and "trusted" for authors the
-- moderators know, which lifts the per-account item limits (3 new a day,
-- 20 in all, 5 waiting for review). Their uploads are still scanned and
-- reviewed.
ALTER TABLE users ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN mod_note TEXT;
