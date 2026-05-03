-- Migration 002: add description + payment_method to receipts
-- Run once in the Supabase SQL Editor.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;  -- card | cash | bank_transfer | direct_debit

COMMENT ON COLUMN receipts.description    IS 'Concise FreeAgent expense label, e.g. "Adobe Creative Cloud – monthly subscription"';
COMMENT ON COLUMN receipts.payment_method IS 'card | cash | bank_transfer | direct_debit — determines if spend is already in bank feed';
