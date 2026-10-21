-- When each item became public, for "newest" and "recently updated" sorting.
--
-- published_at: first approval. Apps imported from the old repository were
-- all approved on import day, so they get their real dates from that repo's
-- git history instead (commit 2cbeca7, the last one with the app folders):
--   added   = first commit of <dir>/<id>/manifest.yml (following renames)
--   updated = last commit touching the folder, ignoring bulk edits that
--             touched more than 5 app folders at once (e.g. localization)
-- "updated" is stored as the imported version's approved_at, which is what it
-- means for any other version. Only auto-approved import versions are
-- touched, so a moderator's approval is never rewritten.
ALTER TABLE apps ADD COLUMN published_at TEXT;

UPDATE apps SET published_at = (
    SELECT MIN(v.approved_at) FROM versions v WHERE v.app_id = apps.id AND v.status = 'approved'
);

UPDATE apps SET published_at = '2026-07-21 19:46:52' WHERE slug = '2048' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-08-19 19:15:48' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = '2048' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-06 10:58:24' WHERE slug = 'Darkroom-Timer' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-06 10:58:24' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'Darkroom-Timer' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-21 18:00:13' WHERE slug = 'HC-SR04P' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-21 18:00:58' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'HC-SR04P' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'LIlkaChuVaChi' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'LIlkaChuVaChi' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-25 19:46:47' WHERE slug = 'LilkaCubes' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-01-25 19:58:23' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'LilkaCubes' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'arp-scan-lilka' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'arp-scan-lilka' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-23 06:26:14' WHERE slug = 'asteroids' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-23 06:27:12' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'asteroids' AND kind = 'app');
UPDATE apps SET published_at = '2025-12-15 20:44:19' WHERE slug = 'ble-controller' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-08-12 08:00:23' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'ble-controller' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-25 19:46:47' WHERE slug = 'bmp280' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-03-27 07:09:49' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'bmp280' AND kind = 'app');
UPDATE apps SET published_at = '2025-12-19 12:45:46' WHERE slug = 'doom-port' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-07-22 09:15:38' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'doom-port' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-02 15:18:22' WHERE slug = 'gues-number' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-07 18:39:29' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'gues-number' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'lightmeter' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lightmeter' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-01 16:15:29' WHERE slug = 'lilka-ai' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-06 06:48:28' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilka-ai' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-11 12:33:10' WHERE slug = 'lilka-desktop-monitor' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-06 06:48:28' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilka-desktop-monitor' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-11 13:26:44' WHERE slug = 'lilka-gb-printer' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-06 06:48:28' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilka-gb-printer' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'lilradio' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilradio' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'lilvideo' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilvideo' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'lilweather' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilweather' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'lora-transmitter' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-15 13:51:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lora-transmitter' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-03 22:02:33' WHERE slug = 'mpeg-stream-player' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-01-03 22:16:55' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'mpeg-stream-player' AND kind = 'app');
UPDATE apps SET published_at = '2026-08-11 11:31:32' WHERE slug = 'pc-monitoring' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-08-11 11:31:32' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'pc-monitoring' AND kind = 'app');
UPDATE apps SET published_at = '2026-01-02 22:00:02' WHERE slug = 'picopico' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-05-24 20:22:40' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'picopico' AND kind = 'app');
UPDATE apps SET published_at = '2026-07-04 08:30:12' WHERE slug = 'pinecil-ble-chart(Rust)' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-08-12 08:21:25' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'pinecil-ble-chart(Rust)' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'pixeler' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-03-28 19:50:30' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'pixeler' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-22 16:27:49' WHERE slug = 'pong' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-22 16:49:18' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'pong' AND kind = 'app');
UPDATE apps SET published_at = '2026-06-25 11:58:15' WHERE slug = 'regravity-defied' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-06-25 11:58:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'regravity-defied' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-03 18:56:14' WHERE slug = 'repeat-game' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-07 18:39:29' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'repeat-game' AND kind = 'app');
UPDATE apps SET published_at = '2026-03-17 07:31:14' WHERE slug = 'serial-modem' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-03-17 07:31:14' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'serial-modem' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-14 14:04:45' WHERE slug = 'snake' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-14 14:04:45' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'snake' AND kind = 'app');
UPDATE apps SET published_at = '2026-03-15 11:45:47' WHERE slug = 'stopwatch' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-03-27 07:07:50' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'stopwatch' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-14 14:04:45' WHERE slug = 'tic-tac-toe' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-11-14 14:04:45' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'tic-tac-toe' AND kind = 'app');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'timer' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-07 18:39:29' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'timer' AND kind = 'app');
UPDATE apps SET published_at = '2026-04-21 17:38:35' WHERE slug = 'сapacitive-soil-sensor' AND kind = 'app' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-04-21 17:45:42' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'сapacitive-soil-sensor' AND kind = 'app');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'dpad-case' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'dpad-case' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'hat-caps' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'hat-caps' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'lilcase' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilcase' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'lilka-case-update' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilka-case-update' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'low-profile-case' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'low-profile-case' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'rear-panel' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'rear-panel' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'simple-case' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'simple-case' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'slim-case' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'slim-case' AND kind = 'mod');
UPDATE apps SET published_at = '2025-12-01 10:52:15' WHERE slug = 'standard-case' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2025-12-01 10:52:15' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'standard-case' AND kind = 'mod');
UPDATE apps SET published_at = '2026-08-01 16:41:32' WHERE slug = 'yet-another-slim-case' AND kind = 'mod' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-08-01 16:41:32' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'yet-another-slim-case' AND kind = 'mod');
UPDATE apps SET published_at = '2026-10-09 10:21:26' WHERE slug = 'air-raid-alerts' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-13 09:09:41' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'air-raid-alerts' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'aquarium' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'aquarium' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'boids' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'boids' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'campfire' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'campfire' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'currency' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'currency' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'github-contributions' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'github-contributions' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 10:21:26' WHERE slug = 'home-assistant' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 10:21:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'home-assistant' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-08 14:50:12' WHERE slug = 'iss-tracker' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-08 19:29:07' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'iss-tracker' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 10:21:26' WHERE slug = 'kyiv-metro' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 10:21:26' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'kyiv-metro' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'lilwatchface' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-08 19:29:07' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'lilwatchface' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'living-window' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'living-window' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2025-11-15 13:51:26' WHERE slug = 'matrix-rain' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-08 19:29:07' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'matrix-rain' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 12:02:09' WHERE slug = 'motion-demo' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 12:02:09' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'motion-demo' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'pet-cat' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'pet-cat' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'rain' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'rain' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'starfield' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'starfield' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'synthwave' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'synthwave' AND kind = 'wallpaper');
UPDATE apps SET published_at = '2026-10-09 09:53:47' WHERE slug = 'weather' AND kind = 'wallpaper' AND EXISTS (SELECT 1 FROM versions v WHERE v.app_id = apps.id AND v.auto_approve = 1);
UPDATE versions SET approved_at = '2026-10-09 09:53:47' WHERE auto_approve = 1 AND status = 'approved' AND app_id = (SELECT id FROM apps WHERE slug = 'weather' AND kind = 'wallpaper');
