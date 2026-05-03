@AGENTS.md

# Finance Hub

Personal finance + accounting dashboard for **Richard Payne LTD** — UK sole-director company (animation director, ~£90–100k revenue, VAT registered).

Connects FreeAgent + Monzo Business + HMRC data into one private single-user dashboard. No auth.

## Stack

- **Next.js 16** (App Router) on **Vercel**
- **Supabase** (Postgres + Storage) — *not* Airtable, despite what the original brief said
- **Claude Sonnet 4.6** for receipt extraction (structured outputs beta)
- **Resend** for email (planned in Phase 6)
- **n8n Cloud** for the Gmail receipt watcher only — everything else is Vercel cron
- **FreeAgent API** for accounting
- **Monzo API** for live balance

## Design system

Matches Mind-Flux exactly. Tokens in `app/globals.css`:

- `--color-background` `#0a0a0a` · `--color-foreground` `#ededed`
- `--color-surface` `#161616` · `--color-surface-light` `#1e1e1e`
- `--color-primary` `#E6FF00` · `--color-secondary` `#ff2d78`
- `--color-muted` `#b0b0b0` · success/warning/danger via Tailwind palette
- Fonts: Space Grotesk (body) + DM Sans (heavy display)

Class conventions:
- Cards: `bg-surface border border-white/8 rounded-xl`
- Pills: `rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest`
- Hover: border-color transitions only — no heavy shadows
- Mobile inputs: `style={{ fontSize: "16px" }}` to stop iOS zoom

## Build phases

1. **Scaffold** — Next.js + design tokens + page shells + GitHub + Vercel ✅
2. **Supabase** — schema, client, page wiring
3. **Receipt pipeline** — `/api/process-receipt`, `/capture` PWA, `/receipts` queue, FreeAgent push
4. **Dashboard** — FreeAgent + Monzo OAuth, six tiles, salary/dividend calc
5. **Setup checklist + Documents** — Claude "how to" explainer, Storage uploads
6. **Crons + n8n** — tax deadline sync, daily email, FreeAgent category cache, Gmail receipt n8n flow

## Gotchas

- **FreeAgent expense `gross_value` MUST be NEGATIVE**
- **FreeAgent attachments are base64 inline in JSON body** — NOT multipart
- **iPhone photos are HEIC** — convert to JPEG client-side on `/capture`
- **`/categories`** only returns admin_expenses / cost_of_sales / income / general
- **Monzo balance lags up to 24h in FreeAgent** — show both with timestamps
- **PAYE/VAT direct debits cannot be set up by an agent** — surface in checklist
- **Dividend rates rise +2pp April 2026** — calc must accept tax year input
- **FreeAgent rate limit 120/min** — cache aggressively, never poll on page load

## What this app does NOT do

- No invoice creation (FreeAgent does that)
- No bank feed management (Monzo→FreeAgent already wired)
- No HMRC submission (FreeAgent files; we just show status)
- No AVEC / R&D credit calculation (specialist — flag only)
- No Companies House filing (link out to WebFiling)

## Session hygiene

Run `/handoff` at task boundaries or when context hits ~60% full. Then `/clear` and paste the latest section back. Full transcripts auto-back-up to `.claude/backups/` before any compaction.
