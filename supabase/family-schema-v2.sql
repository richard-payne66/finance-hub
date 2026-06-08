-- ============================================================================
-- Family finances — schema v2 additions
-- ----------------------------------------------------------------------------
-- Run in Supabase SQL Editor (project jeifndupsazbuafwvnpn) after the original
-- family-schema.sql. Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ── Additions to existing tables ────────────────────────────────────────────

alter table public.family_accounts
  add column if not exists tax_wrapper           text default 'other',
  -- isa | lisa | pension | sipp | gia | cash | other
  add column if not exists tax_year_contribution numeric default 0,
  -- how much has been paid in this tax year (for ISA allowance tracking)
  add column if not exists accessible_from_age   integer;
  -- pension / LISA lock-in age; null = accessible now

alter table public.family_expenses
  add column if not exists variable boolean default false;
  -- true = estimate (food, petrol); false = fixed direct debit

-- ── family_income ────────────────────────────────────────────────────────────

create table if not exists public.family_income (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                          -- "Richard Ltd salary", "Cat teaching"
  amount     numeric not null default 0,
  frequency  text not null default 'monthly',        -- weekly | monthly | quarterly | annual
  owner      text not null default 'rich',           -- rich | cat | joint
  type       text not null default 'salary',         -- salary | dividend | rental | benefit | other
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.family_income enable row level security;
create index if not exists family_income_owner_idx on public.family_income (owner);

-- ── family_liabilities ───────────────────────────────────────────────────────

create table if not exists public.family_liabilities (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,              -- "Barclays mortgage"
  type                  text not null default 'mortgage',
  -- mortgage | loan | credit_card | car_finance | other
  balance               numeric not null default 0, -- current outstanding balance
  monthly_payment       numeric not null default 0,
  interest_rate         numeric,                    -- annual %, e.g. 4.5
  rate_type             text default 'fixed',       -- fixed | variable | tracker
  rate_expiry_date      date,                       -- when the current deal ends
  original_amount       numeric,                    -- original loan amount
  term_remaining_months integer,                    -- months left on loan
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.family_liabilities enable row level security;

-- ── family_goals ─────────────────────────────────────────────────────────────

create table if not exists public.family_goals (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                   -- "Extension fund", "New car"
  target_amount    numeric not null default 0,
  target_date      date,                            -- when you want to hit it
  current_amount   numeric not null default 0,      -- manually tracked
  category         text not null default 'savings', -- savings | house | car | holiday | retirement | education | other
  linked_account   uuid references public.family_accounts(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.family_goals enable row level security;

-- ── family_snapshots ─────────────────────────────────────────────────────────

create table if not exists public.family_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  snapshot_date      date not null,
  total_assets       numeric not null default 0,
  total_liabilities  numeric not null default 0,
  net_worth          numeric not null default 0,   -- assets - liabilities
  monthly_income     numeric default 0,
  monthly_outgoings  numeric default 0,
  monthly_surplus    numeric default 0,            -- income - outgoings
  notes              text,
  created_at         timestamptz not null default now()
);

alter table public.family_snapshots enable row level security;
create index if not exists family_snapshots_date_idx on public.family_snapshots (snapshot_date desc);
