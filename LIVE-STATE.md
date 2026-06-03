# Finance Hub — Live State

> **Last updated:** 2026-06-01
> Paste this into a fresh `/clear`'d Claude session to resume with full context.

---

## Right now

- **✅ NEW: Dividend voucher tool `/dividends` (commit 4db82da, 2026-06-02, tested live).** Enter amount + date → records the dividend (KV `dividend_log`) and generates a printable **dividend voucher** (company facts, shareholder, date, amount, gross/no-tax-credit wording, signature line) + shows tax-year total + print-to-PDF + remove. Linked from the DividendCard ("Pay yourself a dividend & get the voucher →"). Purpose: the missing paperwork that keeps the Director's Loan from going overdrawn. Does NOT post to FreeAgent (accountant records the formal entry) and doesn't check distributable profit. API `/api/dividends` GET/POST/DELETE. **Reclassified ~£365 of mis-marked-personal items to business categories + £3,050 drawings → Director's Loan Account this session (all confirmed in FA via the manual-approve flow).** DLA cleanup = declare dividends to clear it (accountant records; use this tool for the vouchers — genuine dates, no backdating).

- **✅ Review queue cleared to 0 (2026-06-02), done conversationally with Richard.** 13 held items resolved: Golden Wolf £6,480 (already an invoice payment in FA — left untouched, just cleared from queue); £467.21 + £157.12 HMRC → both booked as **PAYE/NI** (the £157.12 overrode FA's wrong "VAT" guess); 10 Leipzig/Berlin business-trip items → confirmed as subsistence (Accommodation & Meals / Travel). **Also fixed a real bug:** the manual approve route, `queue-reconcile`, and the gmail receipt-attach were reading the FA access token RAW via `loadTokens()` without refreshing → 401 "Access token not recognised" once it expired. Exported `getValidToken()` (auto-refresh) and used it in all three (commit b7e858f). Built read-only `/api/admin/handover` health check: **0 unexplained transactions**; remaining handover tidy-ups are reconciling tax payments to returns, finalising draft CT returns, closing dormant £0 bank accounts (HSBC, Tax Pot), re-linking the stale "VAT & Tax 40%" pot feed (shows £8,001, 404 days stale), and chasing 1 overdue invoice (3 open, £33,222). Full checklist in `06_ACCOUNTING/TAX-RECONCILIATION-2026-06.md`.

- **🔎 TAX RECONCILIATION FINDING (2026-06-01) — taxes ARE being paid; FreeAgent just hasn't reconciled them.** Built read-only `/api/admin/tax-reconcile` (lists every unpaid VAT/CT return + HMRC payments in the bank feed + naive match). Key facts: every HMRC payment in FA's Monzo feed is **unexplained**, and the feed only goes back to **~Sep 2025**. So FA's scary "£47,923 unpaid" is mostly (a) paid-but-unreconciled or (b) future estimates. **Verified PAID via bank refs:** CT FY25 £10,979 → paid £11,435.72 on 2026-05-05 ref **3131219862A00107A** (exact CT ref; ~£456 interest); VAT May–Jul25 £1,683.34 → £1,683.84 on 2025-09-30; VAT Nov25–Jan26 £4,269.74 → £4,260.34 DD 2026-03-11. **Future/not-due (ignore):** CT FY26 £11,076 (due 2027), CT FY27 estimate £3,282, VAT Feb–Apr26 £4,357 (due 7 Jun 26), VAT May–Jul26 estimate £2,888. **Needs manual check (pre-feed / ambiguous):** VAT Feb–Apr25 £5,359 (payment predates FA feed — check bank), VAT Aug–Oct25 £3,812 (closest is £4,091.36 on 2026-01-15, unclear), £216.65 VAT refund (HMRC owes Richard). PAYE + some SA also being paid (£467.21 Cumbernauld, £157s Shipley, £3,829.21 SA Glasgow 2025-11-29). **DID NOT auto-write "paid" to FA** — mapping/interest needs judgment; proper fix = explain the bank payments against the returns (Richard/accountant, or me on explicit go-ahead). SA items in FA Income Tax (2022/23–2024/25 "overdue") are personal estimates — separate.

- **✅ SHIPPED — "financial butler" cycle (commits 61c6367 + 34a99c3, main, 2026-06-01). Backup tag `backup-pre-butler-2026-06-01`. Tested live in Chrome (logged-in session).** Goal per Richard's brief: *not* accounting software — a butler that reduces thinking and helps decisions. (1) **`ButlerBriefing`** (`app/components/ButlerBriefing.tsx`) is now the top of the dashboard — plain-English opening line ("Good afternoon, Richard… you can safely take ~£X / I'd hold off — cash short of £Y tax due soon"), the "needs you" list, and one-tap decision questions. Deterministic numbers (no LLM figures). **Replaced/deleted `CaughtUpBanner`.** (2) **"Can I…?" decision support**: new `financial_position` tool in `/api/chat` feeds the butler live cash/tax/safe-dividend so it answers affordability questions with real numbers; chips open the butler pre-asked via exported `openButler()`. (3) **Extracted `getDividendHeadroom()` → `app/lib/headroom.ts`** (one source of truth for API + butler tool). (4) **MAJOR ACCURACY FIX found via Chrome testing:** headroom was summing ALL unpaid VAT/CT (£46,747) incl. ~£26k of 2025 VAT FreeAgent never marked paid (DD, unreconciled) + £11k CT due Feb 2027. Now counts only tax due in next 90d / overdue <45d (= £6,463, matches forecast); old probably-paid surfaces as `stale_unpaid` with a "mark these paid in FA" nudge. (5) `BUTLER-VISION.md` = the feature plan (shipped/next/rejected; DLA tracking deliberately deferred). **NEXT idea (not built): proactive push nudge (email/WhatsApp) reusing the briefing; a `set-aside-for-tax` reserve tracker; consolidated `/api/briefing` endpoint to cut duplicate FA calls.** Also shipped (commit befe454): a deterministic **`estimate_dividend_tax` tool** so the butler answers "what if I take £X as a dividend" / "dividend vs pension" with correct 2026/27 numbers (tested live in Chrome: £10k dividend → ~£8,979 net, with the pension-vs-dividend framing); refreshed the butler's baked `STRATEGY_BRIEF` to 2026/27 (was 33.75% / "salary may not be optimal"). Commits this session: 61c6367 → 34a99c3 → cbbc2ce → befe454. Rollback = `git revert` or Vercel instant-rollback to `backup-pre-butler-2026-06-01`.
- **✅ SHIPPED — "calm cleanup" deployed (commit 844050c, main, 2026-06-01):** Part-1 cleanup from a UX/overlap audit. (1) Removed the superseded auto-categorise POST model (the double-booking-risk "create new FA explanation" engine) — `/api/auto-categorise` is now GET-only (still powers the home card); deleted the unscheduled `/api/cron/auto-categorise` route. (2) **Merged 3 transaction surfaces into one `/bookkeeping` page** with tabs: "Needs you" (was /review), "Done for you" (was /activity), "Cross-check" (was /reconcile). Old routes redirect to /bookkeeping; components left in place, imported by `app/bookkeeping/BookkeepingTabs.tsx`. (3) Nav trimmed 6→5 (Dashboard · Bookkeeping · Receipts · Strategy · Setup). (4) Home reorganised into calm sections ("Your money" / "What I'm handling for you" / collapsed detail), backlog tucked into a disclosure, intro reframed. Net −373/+59 lines. Type-check + production build both clean; not visually verified pre-deploy (auth gate blocks local preview without a Supabase session). **Rollback = Vercel dashboard instant-rollback or `git revert 844050c`.** Then a follow-up deploy (same day): built the top-of-home **"Needs you / all caught up" banner** (`app/components/CaughtUpBanner.tsx` — reads the live review queue + the next non-direct-debit tax bill due ≤14 days; stays silent if it can't confirm the queue rather than falsely reassure); **fixed stale dividend rates** in `DividendCard` (were 8.75%/33.75%, now 10.75%/35.75% for 2026/27, incl. the s455 mention); refreshed `/strategy` (salary lever → "keep £12,570, confirmed optimal"; dividends lever reframed around the 35.75% band + pension-for-surplus; VAT lever corrected — turnover £112,948 so registration is mandatory, Standard scheme confirmed; added a **spouse income-shifting** lever; added a "What changed in April 2026" callout). Type-check + production build both clean.
- **Tax note (2026-06-01 research):** dividend tax ROSE +2pts (basic 8.75→10.75%, higher 33.75→35.75%) from 6 Apr 2026 (Autumn 2025 Budget). £12,570 salary still optimal; pension now clearly beats higher-rate dividends (£10k→pension keeps £10k vs ~£4,722 in hand as a higher-rate dividend). Part-2 "pay yourself" plan drafted but not yet built into the app.
- **Live at commit e73b9d8** (https://finance-hub-psi-khaki.vercel.app/). **Auto-approve is the model now:** FreeAgent guesses every txn; we CONFIRM the confident+safe ones (PUT marked_for_review:false), HOLD the rest. First real run done: 2 approved (interest, Claude), 16 held, 0 errors; FA marked_for_review 26→23. Nightly cron `0 8 * * *` + "Approve now" button on home card.
- ✅ RESOLVED — manual approve (`/api/categorisation/approve`) now PUT-confirms FA's guessed explanation (`marked_for_review:false`) instead of trying to POST a new one. Override category included in same PUT. `/api/categorisation/correct` also now clears `marked_for_review` on re-categorise. All approve paths consistent.
- **Auth model now: Supabase email+password.** Vercel Deployment Protection is OFF on production. User sent a password-recovery email; can also visit `/auth/set-password` directly while logged in. Long-lived Supabase session = no more lockouts.
- **Receipts pipeline working end-to-end** — capture (camera + email), Claude extraction, dedup, auto-approve (manual or 30d cron), FA push as out-of-pocket Expense with correct sign + image attachment, learned vendor→category rules.
- **Site-wide Butler chat** (floating yellow `?` bottom-right) — Claude with tools reading receipts/suppliers/categories/strategy.
- **Open user actions:** (1) drag FY26 "Signed Accounts.pdf" off Desktop into `My_Documents/Statutory_Accounts/` so I can read it (macOS sandbox blocks Desktop). (2) Set new password via `/auth/set-password`. (3) Send the drafted reply to the new accountant.

## The user

Richard Payne — sole director of Richard Payne LTD (film/animation production, SIC 59111). Single shareholder. Family expenses lock extraction at ~£50k+/yr after tax — explicitly off the table to reduce take-home. Wants automation + peace of mind, not detailed control. **Strong preference for plain English; hates jargon and tables of percentages.** Currently with Jungle Tax (Sal Tarar, sal@jungletax.co.uk); switching to a cheaper provider (~£85-107/mo). Reply drafted, awaiting his send. He's deliberately choosing "cheap + reliable" since he'll drive the optimisation himself.

## Company facts (for the Butler / accountant)

- Richard Payne Ltd · Co. No. 11954006 · Co. UTR 3131219862 · Personal UTR 8294275119 · NI JH681353B
- VAT scheme: **Standard** (confirmed from VAT returns — Box 4 reclaims input VAT). VAT reg 440353917
- PAYE 120/JE12664 · Accounts Office 120PZ02084487 · HMRC Auth FYHBK7 · Personal Code XNR-XSY3-2223
- Year end 30 April
- FY26: turnover £112,948 (+28%), net profit £57,849, CT £11,577 due 1 Feb 2027
- CT payment ref FY25 (paid): 3131219862A00107A · FY26 (expected, verify): 3131219862A00108A
- Pension: Vanguard SIPP VG0355609-001, pot ~£47.7k, ~£300/mo employer contributions, LifeStrategy 100% Equity Acc

## What works (verified live this session)

- ✅ Supabase email+password login + magic-link fallback (`/login`); `/auth/set-password` page
- ✅ Vercel Deployment Protection OFF — Supabase Auth gates the app
- ✅ Fire-and-forget capture (`after()` background extraction; ✓ in ~1s)
- ✅ `/capture` minimal mobile entry view (nav hidden) — pinnable to iPhone Home Screen
- ✅ Daily Gmail scan 06:00 UTC — broad subject query + own-domain `from:` exclusion + own-business supplier guard
- ✅ Manual "rescan last 10 days" button (bypasses Receipts-Processed label)
- ✅ Duplicate detection at intake (supplier+date+total+currency) — Gmail skips, camera rejects
- ✅ Approve → FA `/v2/expenses` POST with **negative** gross_value + explicit `manual_sales_tax_amount`
- ✅ `?force=true` re-push uses PUT (updates existing FA expense, no dupe)
- ✅ Receipt image attached to FA expense (base64)
- ✅ DELETE receipt also deletes FA expense (`?keep-fa=true` opts out)
- ✅ 30-day auto-approve cron 07:00 UTC
- ✅ Learned vendor→category rules (upsert on approve, lookup on extraction)
- ✅ FA category filter ~110 → ~30 (`?all=true` escape hatch); dropdown in editor with frequently-used default
- ✅ Receipt edit page stripped + Save bounces back to /receipts; rejected hidden behind disclosure
- ✅ Brand colour sweep (emerald → primary); red/orange kept for warnings
- ✅ FH brand favicon from Richard's .ico → all sizes (source scripts/icon-source.png; regen `node scripts/generate-icons.mjs`)
- ✅ One-click migrations runner at /setup (direct Postgres via DATABASE_URL)
- ✅ Butler chat — floating `?` → Claude w/ tools (search_receipts, supplier_stats, spend_by_category, recent_activity) + baked-in facts + strategy
- ✅ `/strategy` page — readable tax/extraction briefing
- ✅ Admin endpoints: `/api/admin/{audit-fa,find-dupes,clean-fa-orphans}`

## Current data state

- 33 unique approved receipts in DB, all linked to FA expenses, all correctly signed + VAT + image attached
- Zero FA orphans, zero DB dupe groups after cleanup
- ~17 supplier→category learned rules saved (Anthropic→Software, Vercel→Web Hosting, Jungle Tax→Accountancy, Pixie Barnes→Advertising, Ravensburger→Business Entertaining, G-Star→Materials, Howler Brothers→Travel, The Metamovement→Accommodation & Meals, etc.)

## Outstanding / known issues

- ✅ RESOLVED (2026-06-01) — **categorisation model pivoted to auto-APPROVE.** FreeAgent's own guess-rules pre-explain every marked-for-review txn (explanation `marked_for_review:true` + `guess_rule_name`). FA's guessing is actually good (~70% match to Richard's history once our 2 buggy seed rules removed). So instead of creating/overriding explanations (risked double-booking; can't override anyway), we now CONFIRM FA's confident guesses (PUT `marked_for_review:false`) and HOLD the judgement calls. See Recent ships #1. The old auto-categorise POST-new model is superseded (route kept but its cron removed).
- ✅ RESOLVED — crons never ran (middleware gated `/api/cron/*` → 302 /login, and CRON_SECRET unset). Fixed: middleware now exempts `/api/cron/` (guarded by CRON_SECRET, which is now SET in Vercel prod). This also revives gmail-receipts + receipts auto-approve crons (intended features that were silently dead).
- ⏳ FY26 "Signed Accounts.pdf" on Desktop is macOS-sandbox-blocked — drag into Dropbox `My_Documents/Statutory_Accounts/` to read.
- ⏳ `/receipts` list paginated at 100; older receipts truncated from view (still in DB). Consider pagination/limit bump.
- ⏳ No supplier filter on `/receipts` — Butler chat `?supplier=X` links go to unfiltered list.
- ⏳ "Use of Home" not yet set up as actual-cost in FA (parked — was about to do this when dupe issue came up).

## Recent ships (newest first)

1. **Auto-approve FreeAgent's guesses (the new model).** `app/lib/auto-approve.ts` `autoApproveGuesses()` walks marked-for-review txns and CONFIRMS FA's guess in place (PUT explanation `marked_for_review:false`) when CONFIDENT + SAFE; HOLDS the rest for manual review. Confident = our saved rule agrees with FA's guess, OR FA's `guess_rule_name` ∈ {invoice_rule, bill_rule, similar_explained_transactions_rule}. Hold if: amount > **£350**, category ∈ {Accommodation and Meals, Business Entertaining, Staff Entertaining, Sundries}, or not confident. Only ever confirms FA's OWN guess (never invents/changes) → no double-booking. Approved → logged `auto_applied` (shows on `/activity`); held → `queued_for_review` (shows on `/review`). Routes: `/api/approve-guesses` (POST, manual), `/api/cron/approve-guesses` (nightly `0 8 * * *`, replaced old auto-categorise cron). Home card button now "Approve now". Middleware exempts `/api/cron/*` + CRON_SECRET set so crons finally run. Diagnostic: `scripts/compare-guesses.mjs` (read-only FA-guess vs rules). *Shipping this commit.*
2. **Monzo-seeded vendor rules (LIVE in prod DB now).** Mined the Monzo export sheet (3,275 txns) and seeded the learned-rules store from Richard's own Monzo categories — but ONLY the reliable, mappable ones. `category_rules` now has **86 rules** (was 25; +61 from `scripts/seed-monzo-rules.mjs` + 1 manual `plusnet`). Seeded: ~41 software/AI tools→Computer Software, ~20 transit→Travel, accountants→Accountancy Fees, Plusnet→Internet & Telephone (both `pnet4167773` + `plusnet` keys), SMARTY→Mobile Phone, Monzo Business Pro→Bank/Finance Charges, Google Workspace→Web Hosting. **Deliberately NOT seeded:** all meals/cafés/pubs (subsistence = case-by-case), hotels/Airbnb (business-vs-personal), Amazon/Apple/eBay/Cineworld/Lime/pots/transfers/"catrin probert" (mixed/personal). Deleted the bad `sq` rule. Seeded rules tagged `source:"monzo_seed"`. **Key insight:** description-keying is fragile — same merchant has multiple raw-description forms (Plusnet `PNET4167773-2` vs `PLUSNET PLC`; Uber `uber` vs `ubr`; Square merchants all prefix `SQ *`). Mitigated by (i) seeding every observed variant key and (ii) adding processor/noise tokens (sq, sumup, paypal, pending, zettle…) to `vendorKey` STOP_WORDS.
2. **Self-cleaning queue + auto-file + review surface.** (a) `app/lib/queue-reconcile.ts` — on every `/review` open AND in the daily cron, `reconcileQueue()` checks each queued item LIVE against FA: items already explained/matched in FA are dropped; items matching a saved vendor rule are auto-booked to FA and removed (banner shows "✨ Tidied automatically"). (b) Dedup bug fixed (queued/skipped items no longer re-added each cron run); vendorKey strips titles/banking/processor noise. (c) NEW `/activity` page ("What I filed for you") lists everything auto-booked, newest first — each row can be re-categorised (PUTs new category to FA + re-teaches rule) or marked personal (DELETEs the FA explanation + forgets the rule). APIs: `/api/categorisation/activity` (GET), `/api/categorisation/correct` (POST). Home card "Auto-applied" stat now links to `/activity`. *Shipped — commit 66c8a35, pushed to main / deploying on Vercel.*
3. `/auth/set-password` page + recovery-callback routing
4. Email+password login (replacing magic-link-only)

## Env vars in Vercel production

- NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- **CRON_SECRET** (set 2026-06-01 — was missing; required for crons to run safely)
- FREEAGENT_CLIENT_ID · FREEAGENT_CLIENT_SECRET · FREEAGENT_REDIRECT_URI
- GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GOOGLE_REDIRECT_URI
- ANTHROPIC_API_KEY · CRON_SECRET · DATABASE_URL · HMRC_COMPANY_UTR · OWN_BUSINESS_NAMES (optional)

## Locked-in design decisions

1. No Monzo direct integration as a *bank feed* — FA remains the source of bank data + the write target. (Nuance, 2026-06-01: a Monzo→Google Sheet live export exists and MAY be used as an *enrichment/hint* source — clean merchant names + Richard's own Monzo categories — not as a parallel bank feed. See Useful URLs.)
2. OAuth state in BOTH cookie + Supabase.
3. Auto-categorisation threshold 0.85 for silent FA push.
4. AI bookkeeper learns vendor rules from approvals.
5. Audit log = single kv row, FIFO 500.
6. Hero panel = "Ways to save money", not scores/forecasts.
7. Plain English everywhere.
8. Crons (vercel.json): auto-categorise `0 8 * * *`, gmail-receipts `0 6 * * *`, auto-approve `0 7 * * *`.
9. Client-side image compression > 3MB.
10. Single-user via Supabase Auth; Vercel Protection OFF.
11. **FA expense sign: negative gross_value = expense, positive = refund.** Hard-coded in receipt-approve.ts.

## Gotchas

- `printf` not `echo` for Vercel env vars via CLI.
- **FA gross_value: negative = expense.** Got it wrong once → 99-receipt backfill.
- FA returns 200 empty body on DELETE — apiSend handles it (was throwing "Unexpected end of JSON input").
- FA 422 "already explained" = treat as success.
- **FA pre-guesses marked-for-review txns** — an explanation with `marked_for_review:true` + `guess_rule_name` is an UNCONFIRMED guess, NOT done. Only `marked_for_review:false` = truly confirmed. Never treat "has an explanation" as resolved.
- FA categories come from `kv:fa_categories_cache`.
- `outputFileTracingIncludes` in next.config.ts needed so migrations runner bundles `db/*.sql`.
- macOS Sandbox blocks Bash reading Desktop files — drag into Dropbox first.
- iOS caches favicons hard — delete + re-add Home Screen shortcut after icon change.
- Vercel functions 300s max — backfills must be batched (~15-20/call).

## Useful URLs

- Live: https://finance-hub-psi-khaki.vercel.app/
- Receipt entry: /capture (Add to Home Screen)
- Login: /login · Set password: /auth/set-password · Strategy: /strategy
- Admin: /api/admin/{audit-fa,find-dupes,clean-fa-orphans} · Migrations: /setup
- Supabase project: jeifndupsazbuafwvnpn (org Richard_Payne_Supabase, Pro)
- Repo: github.com/richard-payne66/finance-hub
- **Monzo live export sheet** (read via Google Workspace MCP as info@richard-payne.com): `1p_lbpBf3HkAl7F03jvkTGsUMNfZ-K-_66sqBcN34bO8`, tab "Business Account Transactions" (~3,275 rows from Apr 2023). Cols: Transaction ID, Date, Time, Type, Name (clean merchant), Emoji, Category (Monzo's own), Amount, Currency, Notes/#tags, Address, Receipt, Description (raw), Category split.
