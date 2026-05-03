-- Finance Hub — Postgres schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Idempotent: safe to re-run.

-- ── RECEIPTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                  TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | failed
  source                  TEXT NOT NULL,                    -- photo | upload | email
  source_ref              TEXT,
  file_sha256             TEXT NOT NULL,

  -- Extracted fields
  supplier                TEXT,
  supply_date             DATE,
  currency                TEXT,
  gross_total             NUMERIC(10,2),
  net_total               NUMERIC(10,2),
  vat_total               NUMERIC(10,2),
  vat_rate                TEXT,
  category_url            TEXT,
  category_name           TEXT,
  line_items              JSONB,
  is_business_card        BOOLEAN,

  -- Quality flags
  model_confidence        NUMERIC(3,2),
  low_confidence_fields   TEXT[],
  extracted_json          JSONB,

  -- Storage + push
  receipt_image_url       TEXT,
  freeagent_url           TEXT,
  pushed_at               TIMESTAMPTZ,

  -- Misc
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_status         ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_supply_date    ON receipts(supply_date);
CREATE INDEX IF NOT EXISTS idx_receipts_supplier_date  ON receipts(supplier, supply_date);

-- ── PROCESSED FILES (sha256 dedup) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_files (
  file_sha256   TEXT PRIMARY KEY,
  receipt_id    UUID REFERENCES receipts(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FREEAGENT CATEGORIES CACHE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freeagent_categories (
  category_url    TEXT PRIMARY KEY,
  nominal_code    TEXT,
  description     TEXT,
  category_type   TEXT,         -- admin_expenses | cost_of_sales | income | general
  auto_vat_rate   TEXT,
  usage_count     INT  NOT NULL DEFAULT 0,
  last_synced     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_freeagent_categories_type ON freeagent_categories(category_type);

-- ── CHECKLIST STATE (definitions live in code; only state here) ───────
CREATE TABLE IF NOT EXISTS checklist_state (
  item_id        TEXT PRIMARY KEY,
  completed      BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at   TIMESTAMPTZ,
  notes          TEXT,
  document_id    UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DOCUMENTS (CT600s, P60s, statutory accounts, etc.) ────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,   -- CT600 | Self Assessment | Statutory Accounts | Trial Balance | Directors Loan | P60 | VAT Returns | Other
  year          TEXT,            -- e.g. "2023/24"
  filename      TEXT NOT NULL,
  file_url      TEXT NOT NULL,   -- Supabase Storage public URL
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_year     ON documents(year);

-- ── TAX DEADLINES (mix of FreeAgent-pulled + computed) ────────────────
CREATE TABLE IF NOT EXISTS tax_deadlines (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type                    TEXT NOT NULL,            -- PAYE | VAT | Corporation Tax | Self Assessment | Confirmation Statement | Annual Accounts | P60 | P11D
  due_date                    DATE NOT NULL,
  amount                      NUMERIC(10,2),
  status                      TEXT NOT NULL DEFAULT 'upcoming',  -- upcoming | due | overdue | paid
  google_calendar_event_id    TEXT,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tax_type, due_date)
);

CREATE INDEX IF NOT EXISTS idx_tax_deadlines_due_date ON tax_deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_status   ON tax_deadlines(status);

-- ── KV (OAuth tokens, last sync times, ephemeral state) ───────────────
CREATE TABLE IF NOT EXISTS kv (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AUTO-UPDATE updated_at TRIGGER ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS receipts_updated_at      ON receipts;
DROP TRIGGER IF EXISTS tax_deadlines_updated_at ON tax_deadlines;
DROP TRIGGER IF EXISTS kv_updated_at            ON kv;
DROP TRIGGER IF EXISTS checklist_state_updated_at ON checklist_state;

CREATE TRIGGER receipts_updated_at        BEFORE UPDATE ON receipts        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tax_deadlines_updated_at   BEFORE UPDATE ON tax_deadlines   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER kv_updated_at              BEFORE UPDATE ON kv              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER checklist_state_updated_at BEFORE UPDATE ON checklist_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
