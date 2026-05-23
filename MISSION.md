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
