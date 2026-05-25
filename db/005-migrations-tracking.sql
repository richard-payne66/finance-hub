-- Migration 005: bootstrap the schema_migrations tracking table
-- Run once in the Supabase SQL Editor. After this, future migrations
-- will be detected + applied with one click on /setup.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT
);

-- Record 001-004 as already applied (Richard ran them manually).
INSERT INTO schema_migrations (filename, notes) VALUES
  ('001-initial.sql',                  'Manually applied before tracking existed'),
  ('002-description-payment-method.sql','Manually applied before tracking existed'),
  ('003-documents-updates.sql',        'Manually applied before tracking existed'),
  ('004-fire-and-forget-capture.sql',  'Manually applied before tracking existed'),
  ('005-migrations-tracking.sql',      'Bootstrap of the tracking table itself')
ON CONFLICT (filename) DO NOTHING;
