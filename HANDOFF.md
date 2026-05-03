# HANDOFF — Finance Hub session log

---

## HANDOFF — 3 May 2026, end of bootstrap session (Phases 1 + 2 complete)

**Current state**
- Phases 1 + 2 done. Phase 3 (receipt pipeline) is the next major build.
- Project moved to `02_PERSONAL_BRAND/06_PAYNE-BOT/finance-hub/`
- Live at https://finance-hub-psi-khaki.vercel.app
- Repo: `git@github.com:richard-payne66/finance-hub.git`
- Vercel-GitHub integration connected — every push to `main` auto-deploys
- Supabase project: `https://jeifndupsazbuafwvnpn.supabase.co` (London region)
- All 7 DB tables created and confirmed reachable via `/api/health`

**Done across both phases**
- Next.js 16 App Router scaffolded (TypeScript, Tailwind 4, Turbopack)
- Mind-Flux design tokens copied verbatim into `app/globals.css` (matching colours, fonts, conventions)
- Space Grotesk + DM Sans fonts, PWA viewport meta, `manifest.json`
- Six page shells: `/`, `/receipts`, `/capture`, `/deadlines`, `/setup`, `/documents`
- Dashboard placeholder with 6 tiles + nav pills (Mind-Flux style)
- `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` written
- Session hygiene: `/handoff` slash command + PreCompact transcript backup hook
- **Supabase schema applied** — 7 tables: `receipts`, `processed_files`, `freeagent_categories`, `checklist_state`, `documents`, `tax_deadlines`, `kv`
- RLS enabled (default-deny for browser; service-role bypasses, so server code works)
- `app/lib/db.ts` lazy-init Supabase client (server-side only)
- `app/lib/types.ts` matching TypeScript types for all tables
- `@supabase/supabase-js` + `@anthropic-ai/sdk` installed
- Vercel env vars set (production scope): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`
- `.env.local` populated locally with same vars
- `/api/health` endpoint live — returns ok status + per-table verification

**Phase 3 — next step (the receipt pipeline, the heart of the app)**
1. **Install** `heic-to` (client-side HEIC→JPEG) and `sharp` (server-side resize)
2. **Build** `app/lib/claude-extract.ts` — wraps Claude Sonnet 4.6 with the structured outputs beta header (`anthropic-beta: structured-outputs-2025-11-13`) and the receipt JSON schema (see CLAUDE.md or original brief). Returns parsed receipt data.
3. **Build** `app/api/process-receipt/route.ts`:
   - Accept multipart file upload
   - SHA-256 hash → check `processed_files` for dedup → 409 if exists
   - Convert PDF→JPEG (first page only) using `pdf2pic` if PDF
   - Resize if > 2576px long edge using `sharp`
   - Upload original to Supabase Storage bucket `receipts` (create bucket first via SQL or dashboard)
   - Base64 encode for Claude
   - Call Claude with image + structured prompt (see "Claude Receipt Extraction" in CLAUDE.md)
   - Run sanity checks (gross > 0, net+vat≈gross within £0.05, line items sum, supply_date sane, currency valid ISO)
   - Check semantic dupe (same supplier+date+amount in last 7 days)
   - INSERT into `receipts` with status='pending'
   - INSERT into `processed_files`
   - Return inserted row
4. **Build** `/capture` page:
   - Two big buttons: 📷 Take Photo (`<input type="file" accept="image/*" capture="environment">`) and Upload File
   - On select: HEIC→JPEG client-side using `heic-to`
   - POST to `/api/process-receipt`
   - Show loading state, on success → redirect to `/receipts`
   - On 409 dedup → show "Already captured"
5. **Build** `/receipts` queue page:
   - List pending receipts (cards showing supplier, date, total, VAT, image thumb)
   - Approve / Reject / Edit buttons (Approve API in Phase 4 once FreeAgent is wired)
   - Show low-confidence warning if `model_confidence < 0.75`
   - Show "possible duplicate" warning when applicable
6. **Generate PWA icons** — 192px + 512px PNG files in `/public/icon-192.png` and `/public/icon-512.png` (manifest.json already references them)

**Key decisions to keep**
- Stack: Next 16 / Supabase (Postgres + Storage) / Claude Sonnet 4.6 / Vercel / n8n only for Gmail receipt watcher
- Setup checklist: definitions in TypeScript const, state-only in DB
- `/capture` is a real PWA, not just a bookmark
- HEIC conversion client-side
- Optional `CAPTURE_SECRET` env var for soft URL guard (not yet implemented; add when convenient)
- All design follows Mind-Flux conventions — see `CLAUDE.md` and `app/globals.css`. Mind-Flux source for reference: `../braindump/`

**Gotchas (read these BEFORE writing receipt code)**
- **FreeAgent `gross_value` must be NEGATIVE** on expense push
- **FreeAgent attachments are base64 inline in JSON body** — NOT multipart upload (most common mistake)
- **iPhone HEIC photos** — convert to JPEG **client-side** before sending to Claude (no Vercel `libheif` dependency)
- **Claude structured outputs need beta header**: `anthropic-beta: structured-outputs-2025-11-13`
- **Send image FIRST, then text prompt** in Claude messages array
- **`{{categories_json}}` placeholder** in prompt is filled at runtime from `freeagent_categories` cache
- **Supabase Storage bucket `receipts`** must be created before upload code runs — do it in dashboard or via SQL
- **FreeAgent rate limit 120/min** — never poll on page load, always cache
- **Monzo balance lags up to 24h in FreeAgent** — show both sources with timestamps
- **PAYE/VAT direct debits cannot be set up by an agent** — surface in checklist
- **Dividend rates rise +2pp April 2026** — calc must accept tax year input
- **`/categories` only returns admin_expenses / cost_of_sales / income / general** — don't expect anything else

**Files / structure**
- `app/globals.css` — Mind-Flux design tokens
- `app/layout.tsx` — fonts + PWA viewport + manifest link
- `app/page.tsx` — dashboard shell
- `app/{receipts,capture,deadlines,setup,documents}/page.tsx` — placeholder pages
- `app/api/health/route.ts` — DB connectivity check
- `app/lib/db.ts` — Supabase client (lazy-init, service role)
- `app/lib/types.ts` — TS types matching DB schema
- `db/schema.sql` — full Postgres schema (idempotent)
- `public/manifest.json` — PWA manifest (icons not yet generated)
- `CLAUDE.md` — project bible (read first)
- `AGENTS.md` — Next.js 16 caveat
- `.claude/commands/handoff.md` — `/handoff` slash command
- `.claude/hooks/pre-compact.sh` — transcript backup
- `.claude/settings.local.json` — PreCompact hook wired (gitignored)
- `.env.local` — local env vars (gitignored)

**Where to find things you'll need**
- Original full brief: in the previous Mind-Flux Claude conversation. Includes full Claude extraction prompt body, structured output JSON schema, sanity checks, FreeAgent expense payload template, Monzo endpoints. **CLAUDE.md does not yet contain the full prompt — fetch it from the user if not in your context.**
- Mind-Flux reference codebase: `../braindump/` (sibling folder). Patterns to copy: `app/lib/api-helpers.ts` (safeJson, errorResponse), HEIC handling, Anthropic client setup, route structure.
- Vercel project: `richard-payne66s-projects/finance-hub`
- Health check URL: https://finance-hub-psi-khaki.vercel.app/api/health

**To resume in a new chat**
1. `cd "/Volumes/MACBOOK_NVME/Mike&Payne Dropbox/Richard Payne/02_PERSONAL_BRAND/06_PAYNE-BOT/finance-hub"`
2. `claude` (start a new session in this folder)
3. Paste this entire HANDOFF section as your first message
4. Tell Claude: "Resume from Phase 3 — receipt pipeline. Read CLAUDE.md, then start by installing dependencies."

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
