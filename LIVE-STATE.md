# Finance Hub — Live State

> **Last updated:** 2026-05-29
> Paste this into a fresh `/clear`'d Claude session to resume with full context.

---

## Right now

- **Latest deploy live** at https://finance-hub-psi-khaki.vercel.app/. Big session of work just shipped (see "Recent ships").
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

- ⏳ FY26 "Signed Accounts.pdf" on Desktop is macOS-sandbox-blocked — drag into Dropbox `My_Documents/Statutory_Accounts/` to read.
- ⏳ `/receipts` list paginated at 100; older receipts truncated from view (still in DB). Consider pagination/limit bump.
- ⏳ No supplier filter on `/receipts` — Butler chat `?supplier=X` links go to unfiltered list.
- ⏳ "Use of Home" not yet set up as actual-cost in FA (parked — was about to do this when dupe issue came up).

## Recent ships (newest first)

1. `/auth/set-password` page + recovery-callback routing
2. Email+password login (replacing magic-link-only)
3. Butler chat (floating `?`, Claude + tools)
4. Duplicate detection at intake + 52 historical dupes cleaned
5. FA-aware DELETE (removes FA expense too)
6. Sign-convention fix (FA gross_value negative for expenses) + 99-receipt backfill; apiSend handles empty 200 bodies
7. Bulk-categorise + approve 99 receipts via user-confirmed mappings
8. 90-day Gmail backfill (42 historical receipts; own-business invoices excluded)
9. Brand favicon swap from Richard's .ico
10. Bulk emerald → primary colour sweep

## Env vars in Vercel production

- NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- FREEAGENT_CLIENT_ID · FREEAGENT_CLIENT_SECRET · FREEAGENT_REDIRECT_URI
- GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GOOGLE_REDIRECT_URI
- ANTHROPIC_API_KEY · CRON_SECRET · DATABASE_URL · HMRC_COMPANY_UTR · OWN_BUSINESS_NAMES (optional)

## Locked-in design decisions

1. No Monzo direct integration — FA bank feed is the source of bank data.
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
