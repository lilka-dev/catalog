-- /auth/me returns the signed-in user's own ratings with the session check,
-- so the site needs no request per app to show them; this keeps that lookup
-- to the user's own rows instead of a scan of every rating.
CREATE INDEX ratings_user ON ratings (user_id);
