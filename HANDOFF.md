# HANDOFF — Finance Hub session log

---

## HANDOFF — 3 May 2026, scaffold session

**Current task**
- Phase 1 complete (scaffold). Phase 2 next: Supabase schema + integrations.

**Done this session**
- Created `15_FINANCE-HUB/finance-hub/` in `02_PERSONAL_BRAND/`
- Next.js 16 App Router scaffolded (TypeScript, Tailwind, Turbopack)
- Mind-Flux design tokens copied into `app/globals.css`
- Custom layout with Space Grotesk + DM Sans fonts, PWA viewport meta
- Six page shells created: `/`, `/receipts`, `/capture`, `/deadlines`, `/setup`, `/documents`
- Dashboard placeholder with 6 tiles + nav pills
- `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` written
- Session hygiene: `.claude/commands/handoff.md` + PreCompact backup hook

**Next step**
1. Set up Supabase project (or use existing) — paste URL + service role key into `.env.local`
2. Write schema migration: 6 tables (receipts, processed_files, freeagent_categories, checklist_state, documents, tax_deadlines)
3. Wire Supabase client (`app/lib/db.ts`) using same pattern as Mind-Flux
4. Phase 3: receipt pipeline — `/api/process-receipt` + `/capture` PWA + Claude extraction

**Key decisions made**
- Supabase replaces Airtable (storage + DB in one place, signed URLs free)
- `/capture` is a real PWA (manifest.json, standalone display, apple-touch-icon) — not just a bookmark
- HEIC conversion **client-side** (no Vercel `libheif` install)
- Claude **Sonnet 4.6** (not the older 4-20250514 from the original brief)
- Setup checklist: definitions in code, state in DB
- n8n only for Gmail receipt watcher; everything else is Vercel cron
- Soft `/capture` URL guard via optional `CAPTURE_SECRET` env var (off by default)

**Gotchas (carry forward)**
- FreeAgent `gross_value` must be NEGATIVE on expense push
- FreeAgent attachments must be base64 inline in JSON body
- iPhone HEIC photos must be converted to JPEG before Claude
- `/categories` only returns admin_expenses / cost_of_sales / income / general
- Monzo balance lags up to 24h in FreeAgent — show both with timestamps
- Dividend rates rise +2pp April 2026

**Files touched**
- `app/globals.css` — Mind-Flux design tokens
- `app/layout.tsx` — Space Grotesk + DM Sans + PWA viewport
- `app/page.tsx` — dashboard shell with 6 tiles + nav
- `app/{receipts,capture,deadlines,setup,documents}/page.tsx` — placeholder pages
- `CLAUDE.md` + `AGENTS.md` — project docs
- `.claude/commands/handoff.md` + `.claude/hooks/pre-compact.sh` + `.claude/settings.local.json`
- `.gitignore` — added `.claude/backups/` and `settings.local.json`
