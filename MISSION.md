# Finance Hub — Mission

**This is a non-accountant's safety net.**

Richard Payne is the sole director of Richard Payne LTD. He is not an
accountant. He pays an accountant to handle the company's books, but
he should not have to *hope* they are doing it right. This system gives
him the visual confidence to verify it himself.

## What it must do (in order of importance)

1. **Show that everything that should be there, is there.**
   Documents filed (CT600, accounts, VAT, P60, SA, confirmation
   statements). One glance: green ✓ everywhere, or know exactly what's
   missing.

2. **Show what is owed, when, to whom — in plain English.**
   "You owe HMRC £13,084 — next payment 31 Jul 2026." Not "outstanding
   liabilities by jurisdiction."

3. **Show what has already been paid.**
   So mistakes can be caught (double-payments, missed receipts,
   incorrect amounts) by comparing against records.

4. **Show whether the company is healthy.**
   Cash in bank vs tax owed. "After tax, you have £X to play with."
   Not P&L statements.

5. **Catch and queue everything that flows in.**
   Receipts via camera, email forward, label — auto-extracted, no
   manual data entry. Nothing falls through the cracks.

## Design principles

- **Plain English over accounting jargon.** "Money you owe" not
  "Statutory liabilities." "Money you've made" not "Net profit."
- **No empty placeholder tiles.** If a feature isn't built yet, don't
  show a dead "Phase 4" tile — either build it or remove it.
- **Colour-coded urgency.** Red = overdue. Amber = due soon. Green =
  fine. Numbers and dates speak first.
- **Trust but verify.** Pull from authoritative sources (FreeAgent,
  HMRC, Companies House) and cross-check rather than re-key data.
- **Mobile first for capture, desktop first for review.** The
  `/capture` route is one-tap. The home page can be richer.

## Non-goals

- This is **not** a full accounting package. FreeAgent does that.
- This is **not** for an accountant. The accountant has FreeAgent.
  Finance Hub is *for the client of the accountant*.
- It does **not** need to be exhaustively correct. Indicative numbers
  with clear sources beat hidden complexity.

## The user

Richard is the sole director of a single-person Ltd company doing
film/animation production. Predictable monthly rhythm:
- Client invoices in
- Salary out (~£1,047)
- Dividends out (~£3,400 avg)
- Recurring software/tools, occasional kit
- Quarterly VAT, annual CT, annual SA, monthly PAYE

He pays an accountant to do the formal work in FreeAgent. He does
**not** want to learn formal accounting. He finds FreeAgent
overwhelming because it shows everything to everyone without
curating "what does the owner actually need to see?"

The system you are building is a **butler, not a dashboard**. Most
days it stays out of his way. When he needs to know something, it
tells him in one sentence. When he needs to do something, it tells
him exactly what — once, calmly.

## What this system should NEVER do

- Ask the user to configure anything ("first set up your categories…")
- Show charts the user didn't ask for
- Use accounting jargon: *liability, accrual, journal, nominal code*
- Surface more than ONE alert at a time
- Need the user to remember to "sync" or "refresh"
- Have a settings page with toggles
- Force the user to learn how it works
- Default to red/amber tones when there's nothing actually wrong

## The seven things that would make this great

1. **Background auto-categorisation** — Claude learns from history,
   silently applies high-confidence categories, queues low-confidence
   for a weekly 2-min review session.
2. **Forward-anything-to-receipts@** — email forward + optional note,
   auto-extracted, auto-matched to bank transaction, attached in FA.
3. **Monthly "you're fine" digest** — one email per month, plain
   English. Active reassurance, not passive dashboard.
4. **"Can I expense this?" assistant** — real-time ruling on
   purchases with category + tax saving estimate.
5. **Anomaly detection** — quiet most months, lifesaving the one
   month a payment is missing or doubled.
6. **Accountant verification layer** — compares accountant's filings
   against the underlying data, flags discrepancies in plain English.
7. **Dividend assistant** — monthly "you can safely pay yourself £X"
   with the maths one click away.

Build priority: 1 → 2 → 3 → 5 → 4 → 6 → 7.

## Status

- ✅ #1 Auto-categorisation — shipped 2026-05-23. Daily cron 08:00 UTC.
  Threshold 0.85 auto-apply, below queued. Tax-efficiency bias in prompt.
- ✅ #2 Email forward — scaffolding shipped 2026-05-23. /api/gmail-receipts
  + /api/google/{connect,callback}. **Pending:** user to add
  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI envs
  (Google Cloud Console OAuth setup walkthrough already provided).
  Then visit /api/google/connect and the 15-min cron starts harvesting.
- ✅ #3 Monthly digest — shipped 2026-05-23 as /digest page. Email send
  will wire automatically once #2 Google creds are in place.
- ✅ #4 'Can I expense this?' — shipped 2026-05-23. CanIExpenseWidget
  on home page. Real-time Claude UK tax advisor.
- ✅ #5 Anomaly detection — shipped 2026-05-23. 4 heuristics: large
  outgoing, missing recurring, duplicate, new vendor. Calm AnomaliesCard.
- ⏳ #6 Accountant verification — needs historical FA snapshots, not yet
  collecting. TODO: nightly snapshot job → daily diff → flag changes.
- ✅ #7 Dividend assistant — shipped 2026-05-23. Conservative
  cash − tax − buffer formula. DividendCard with expandable maths.
