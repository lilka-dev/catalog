-- Public GitHub profile fields for the Authors page, refreshed at every
-- sign-in from the same /user response that gives the login. Only authors with
-- a published item are shown there.
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN blog TEXT;
ALTER TABLE users ADD COLUMN location TEXT;
ALTER TABLE users ADD COLUMN company TEXT;
