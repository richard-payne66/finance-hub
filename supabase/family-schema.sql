-- ============================================================================
-- Mind-Flux — Family finances schema
-- ----------------------------------------------------------------------------
-- One-time setup. Paste this whole file into the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> Run) for project dkdshmjzezhvkedopmfm.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS).
--
-- RLS is enabled with NO policies, matching the rest of the app: the anon key
-- can read nothing, and the service-role key (used by all our API routes)
-- bypasses RLS entirely. There is intentionally no anon access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- family_accounts — anything that holds a balance: savings, investments,
-- pensions, cash. Powers the net-worth overview, projection chart and the
-- withdrawal recalculator.
-- ----------------------------------------------------------------------------
create table if not exists public.family_accounts (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,                 -- "Aviva Pension - Rich"
  type                 text not null default 'savings', -- savings | investment | pension | cash | other
  owner                text not null default 'joint',   -- joint | rich | cat
  institution          text,                          -- "Aviva", "Vanguard", "Barclays"
  balance              numeric not null default 0,    -- current value, GBP
  currency             text not null default 'GBP',
  monthly_contribution numeric default 0,             -- regular monthly pay-in
  growth_rate          numeric,                       -- expected annual % (e.g. 5 = 5%); null -> type default
  as_of_date           date,                          -- when this balance was accurate
  notes                text,
  document_id          uuid,                          -- statement this came from (optional)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- family_expenses — recurring household expense line items. Stored at their
-- native frequency; the app normalises to monthly/annual for the calculator.
-- ----------------------------------------------------------------------------
create table if not exists public.family_expenses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                          -- "Mortgage", "Swimming"
  amount      numeric not null default 0,
  frequency   text not null default 'monthly',        -- weekly | monthly | quarterly | annual
  category    text not null default 'joint',          -- joint | kids | cat_personal | rich_personal | joint_fun | <custom>
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- family_documents — uploaded statements (bank/pension/investment PDFs or
-- images). Stored in Vercel Blob; we keep the URL + Claude's extracted figures.
-- ----------------------------------------------------------------------------
create table if not exists public.family_documents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  file_url      text not null,
  content_type  text,
  kind          text default 'other',                 -- bank_statement | pension | investment | other
  status        text not null default 'uploaded',     -- uploaded | extracted | error
  extracted     jsonb,                                -- { accounts: [...], expenses: [...] } from Claude
  created_at    timestamptz not null default now()
);

-- Helpful indexes
create index if not exists family_accounts_type_idx   on public.family_accounts (type);
create index if not exists family_expenses_cat_idx     on public.family_expenses (category);
create index if not exists family_documents_status_idx on public.family_documents (status);

-- ----------------------------------------------------------------------------
-- family_doc_checklist — a simple remembered list of documents: what's been
-- uploaded, what still needs to be found, what to remember to add later.
-- Uploaded documents auto-appear as ticked items in the UI; this table holds
-- any manually-added reminder entries.
-- ----------------------------------------------------------------------------
create table if not exists public.family_doc_checklist (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                            -- "Aviva pension statement 2025"
  done        boolean not null default false,           -- ticked off
  note        text,                                     -- optional extra detail
  created_at  timestamptz not null default now()
);

-- Helpful indexes
create index if not exists family_accounts_type_idx    on public.family_accounts (type);
create index if not exists family_expenses_cat_idx      on public.family_expenses (category);
create index if not exists family_documents_status_idx  on public.family_documents (status);

-- Lock down: RLS on, no policies. Service role (our API) bypasses it.
alter table public.family_accounts       enable row level security;
alter table public.family_expenses       enable row level security;
alter table public.family_documents      enable row level security;
alter table public.family_doc_checklist  enable row level security;
