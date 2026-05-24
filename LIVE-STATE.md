# Finance Hub — Live State

> **Last updated:** 2026-05-24
> Paste this into a fresh `/clear`'d Claude session to resume with full context.

---

## Right now

- **v0.9.1 live** at https://finance-hub-psi-khaki.vercel.app/. Latest deploy ~1 hour ago, all green.
- **Three OAuth sources working:** FreeAgent (live), Gmail (live). Monzo direct integration **removed entirely** — FA's bank feed is the single source of truth for bank data.
- **Open user actions:** (1) email the accountant the drafted "set up CT DD" message, (2) fix the dead `clare.wilson@gorillaaccounting.com` email on HMRC VAT account, (3) pay £2,105.91 SA by 31 Jul 2026, (4) configure Monzo Pots to pay HMRC DDs from "VAT & Tax 40%" pot once new DDs land.

## The user

Richard Payne — sole director of Richard Payne LTD (film/animation production, SIC 59111). Single shareholder, ~£53k annual income, no employees. Pays accountant to handle FA/HMRC filings. Hates FreeAgent's UI overwhelm. Wants automation and peace of mind, NOT detailed financial control. See `MISSION.md` for full portrait.

## What works (verified live in current session)

- ✅ FreeAgent OAuth, auto-refresh, all reads + categorisation pushes via `/v2/bank_transaction_explanations`
- ✅ Gmail OAuth (`info@richard-payne.com`, 6112 messages indexed)
- ✅ Auto-categorisation pipeline (Claude → FA push, daily cron 08:00 UTC)
  - 50 unique transactions in audit log: 11 auto-applied, 21 queued, 18 personal-skips, **0 errors**
  - Learning loop: vendor→category rules persist across runs (`app/lib/category-rules.ts`)
- ✅ Receipt capture (photo / upload / PDF) — client-side compression handles iPhone-sized files
- ✅ Smart document upload at `/setup` (Claude classifies + files in `documents` table)
- ✅ Review queue at `/review` with frequently-used category picker (12 used, 102 hidden behind "Show all")
- ✅ HMRC tax tracking via FA — VAT (£4,357 due 7 Jun, DD active), CT (£10,979 unpaid for 2024/25)
- ✅ Optimisations panel at top of home page — compact one-line tips, click to expand
- ✅ Reconciliation page (FA ↔ Receipts only since Monzo removed)
- ✅ Direct Debit flags + settings at `/settings/dd`
- ✅ Forecast panel = simple "upcoming HMRC bills with DD status" — no scary projections
- ✅ Dividend headroom card with Strategy tab (£12,570 salary + 8.75% dividend explainer)
- ✅ Gmail queue card on home (shows count of pending receipt emails, manual "Process now" button)
- ✅ Anomaly detection (large outgoing / missing recurring / duplicate / new vendor — calm presentation)
- ✅ Monthly digest at `/digest`
- ✅ Audit healed: 250 dirty entries → 50 unique deduped

## Outstanding / known issues

- ⚠️ **23 receipt emails waiting** in Gmail (`receipts@` + label `RECEIPTS`) — daily cron at 09:00 UTC will process; user can hit "Process now" on dashboard for instant.
- ⚠️ **CT 2024/25 (£10,979)** marked unpaid in FA, was due 1 Feb 2026 — actually paid? Need to verify with accountant or look at bank.
- ⚠️ **VAT penalty point active** (1) on HMRC account — user should click "Find out why" on gov.uk VAT page.
- ⚠️ **Old accountant email** `clare.wilson@gorillaaccounting.com` still on user's HMRC VAT contact — penalty notices going to wrong inbox.
- ⚠️ **Monzo Tax pot stale** in FA — £8,001 figure dated April 2025. Actual current balance unknown without Monzo app check. FA doesn't sync Monzo pots.
- ⏳ #6 in MISSION.md (Accountant verification layer) not built — needs historical FA snapshots we don't have.

## Recent ships (newest first)

1. **v0.9.1 — Compact optimisations panel + DD setup guide.** One-line tips collapsible to expand, plus clear self-serve DD setup paths per tax type. Auto-marked `salary_at_12570` done.
2. **DD audit on HMRC.** Drove user's browser to confirm VAT DD on ✓, SA no DD, CT/PAYE not on their HMRC account. User has since confirmed PAYE DD set up separately.
3. **Photo capture fix + category picker filter.** Client-side image compression to 1600px / 3MB cap fixes Vercel's 4.5MB body limit. Review picker defaults to "frequently used" (12) instead of all 114.
4. **Bug fixes pass.** auto-categorise treated FA's "already explained" 422 as error (44 phantom errors logged); now success. Deduped audit log against `bank_transaction_url`. Bumped log cap to 500.
5. **Monzo direct integration ripped out entirely.** OAuth flow couldn't complete in user's Chrome or Safari ("network error" on Monzo's side). FA's bank feed provides everything we need anyway; lost only the cosmetic "live pot balance" tile.

## Env vars in Vercel production

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `FREEAGENT_CLIENT_ID` (OAuth identifier `rPEGCJEjmfNjnkstxVBxkg`)
- `FREEAGENT_CLIENT_SECRET`
- `FREEAGENT_REDIRECT_URI` (https://finance-hub-psi-khaki.vercel.app/api/freeagent/callback)
- `GOOGLE_CLIENT_ID` (`464895906337-j3l9d5bkeqgcivbt50dr3sgo3743ek8l.apps.googleusercontent.com`)
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (https://finance-hub-psi-khaki.vercel.app/api/google/callback)
- `ANTHROPIC_API_KEY`
- `CRON_SECRET` (optional — Vercel cron auth)

**Removed (don't add back unless re-introducing Monzo direct):**
- `MONZO_CLIENT_ID` / `MONZO_CLIENT_SECRET` / `MONZO_REDIRECT_URI`

## Locked-in design decisions

1. **No Monzo direct integration.** FA's bank feed is the single source of bank data. Pot balances are not tracked live.
2. **OAuth state stored in BOTH cookie AND Supabase** (`app/lib/oauth-state.ts`). Cookie alone gets dropped by Chrome's strict policy during third-party redirects.
3. **Auto-categorisation threshold = 0.85** for silent FA push. Below → queued for review.
4. **AI bookkeeper learns vendor rules** from user approvals — exact vendor match (first word, normalised) skips Claude entirely on next pass.
5. **Audit log = single kv row** (no DDL access from JS client), FIFO-capped at 500 entries, deduped by `bank_transaction_url`.
6. **Hero panel = "Ways to save money"** (actionable optimisations). NOT scores / forecasts — user found those confusing. Forecast panel is a simple bill list now.
7. **Plain English everywhere.** No "liability / accrual / nominal code" jargon.
8. **Cron schedule** (in `vercel.json`):
   - Auto-categorise: `0 8 * * *` (08:00 UTC daily)
   - Gmail receipts: `0 9 * * *` (09:00 UTC daily)
9. **Photo upload pipeline**: client-side compresses any image > 3MB to 1600px JPEG q0.85 BEFORE upload (Vercel edge body-size limit is 4.5MB).
10. **Single-user app.** No auth on Finance Hub itself (Vercel Deployment Protection gates access). Don't add login layers — they'd just be friction.

## Gotchas

- **`printf` not `echo`** when adding Vercel env vars via CLI. `echo` appends a trailing newline that gets stored in the env var. Cost us 2 hours debugging "Unknown Application" from FreeAgent.
- **Vercel auth blocks curl.** Can't test prod API endpoints externally; either trigger via UI button or run logic locally via scripts in `scripts/`.
- **FA's `marked_for_review` filter is eventually consistent.** Returns transactions we already explained for several minutes. Always dedupe against audit log before processing.
- **FA returns 422 "has already been explained"** when pushing a categorisation to a txn that was already done — treat as success not error.
- **FA `bank_account` field** on explanations is required — must look up the txn first to get its `bank_account` URL (the txn URL alone isn't enough).
- **HMRC Individual vs Organisation Gateway.** User's HMRC login is Individual (because of personal SA). Corp Tax can ONLY be added to Organisation Gateway. Can't convert between types — need a new account.
- **Monzo Pots aren't separate bank accounts.** DD always against main current account; routing to pot is configured INSIDE the Monzo app (Pay from Pot feature).
- **FA categories come from `kv:fa_categories_cache`**, not from the `freeagent_categories` table (which was never populated). `app/lib/fa-categories.ts` is the only consumer.
- **HMRC Gov.UK web auth dies in user's Chrome** with "network error" — extension/privacy setting interference. User uses Safari for HMRC tasks now.

## Useful URLs

- Home: https://finance-hub-psi-khaki.vercel.app/
- Capture: /capture
- Receipts: /receipts
- Review queue: /review
- Reconcile: /reconcile
- Settings (DD flags): /settings/dd
- Setup (docs): /setup
- Monthly digest: /digest
- HMRC business: https://www.tax.service.gov.uk/business-account
- FA app: https://richardpayneltd.freeagent.com
- Companies House (#11954006): https://find-and-update.company-information.service.gov.uk/company/11954006

## What I told the user last

Confirmed for them:
1. **Monzo settings are self-serve** — can change DD-to-Pot routing any time in Monzo app
2. **CT DD requires an Organisation HMRC Gateway** — can't convert their Individual one. So either bite-the-bullet 2-hour setup, or let accountant handle via email I drafted
3. **For their goals (peace of mind, not money)**: best path is email to accountant
4. **Email drafted** to send to current accountant (subject "Setting up a Corporation Tax Direct Debit") with Monzo Business bank details + CT UTR `3131219862` + company refs

Mid-flow on: deciding whether to add the dashboard nudge for "configure Monzo Pot to pay HMRC DDs" once those DDs go live.
