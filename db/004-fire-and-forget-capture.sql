-- Migration 004: fire-and-forget receipt capture
-- Adds columns needed for async/background processing of receipts.
-- Run once in the Supabase SQL Editor.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS possible_dupe     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extraction_error  TEXT;

-- 'processing' is a new value for the status column. No CHECK constraint
-- exists today so this is purely informational.
COMMENT ON COLUMN receipts.status IS 'processing | pending | approved | rejected | extraction_failed | failed';
COMMENT ON COLUMN receipts.possible_dupe IS 'Same supplier + date + total as another receipt within the last 7 days';
COMMENT ON COLUMN receipts.extraction_error IS 'If Claude extraction failed in the background, the error message lands here';
