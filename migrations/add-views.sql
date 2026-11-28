-- Loop: post view counts.
-- Run this once in your Postgres console (Neon / Vercel Postgres / psql)
-- against the same database the app uses. It is safe to run more than once.
-- The app already ships with view tracking and display; counts stay 0
-- until this column exists, then start counting real views immediately.
ALTER TABLE loop_posts ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;
