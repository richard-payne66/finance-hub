// Knowledge the chat butler has at hand without needing a tool call.
// Static, low-cost facts go here; anything live (receipts, expenses) goes
// through tool calls.

export const BUSINESS_FACTS = `
RICHARD PAYNE — BUSINESS FACTS
- Company: Richard Payne Ltd · Co. No. 11954006 · UTR 3131219862
- Sole director, no other employees
- Year end: 30 April
- VAT scheme: Standard (not Flat Rate); registered with HMRC
- PAYE Ref: 120/JE12664 · Accounts Office: 120PZ02084487
- VAT Registration Number: 440353917
- HMRC Auth Code: FYHBK7 · Personal Code: XNR-XSY3-2223
- Personal UTR: 8294275119 · NI: JH681353B

ACCOUNTANT HISTORY
- Was with Gorilla Accounting (Bolton) for several years
- Moved to Jungle Tax (Sal Tarar, sal@jungletax.co.uk) — currently active
- Switching to a cheaper provider (~£85-107/month). Jungle Tax handled the 2025/26 personal SA + FY26 accounts as part of handover.

FY26 RESULTS (most recent)
- Turnover: £112,948 (up 28% YoY)
- Net profit: £57,849 · Corporation tax: £11,577
- CT due 1 February 2027

PENSION
- Vanguard SIPP (acc VG0355609-001) · pot ~£47,733
- Contributing ~£300/month from Richard Payne Ltd as employer contributions
- Invested in LifeStrategy 100% Equity Acc
- Carry-forward room exists but constrained by family cashflow

CASHFLOW CONSTRAINT
- Family expenses lock personal extraction at ~£50k+/yr after tax
- Cannot reduce take-home; the strategy must work around that

HMRC PAYMENT REFERENCE FORMAT
- Format: [10-digit UTR] + A001 + [2-digit period number] + A
- FY25 CT payment ref: 3131219862A00107A (already paid)
- FY26 CT payment ref: 3131219862A00108A (expected; verify on HMRC dashboard)
`.trim();

export const STRATEGY_BRIEF = `
STRATEGY — TAX & EXTRACTION (from /strategy page)

THE PICTURE IN ONE LINE
Setup is mostly right. Biggest miss is the pension, but Richard can't afford
to pay more in directly. Real play: shift personal costs onto the company
(home office actual-cost, gift cards, EV later) — same lifestyle, less tax.

THE 6 LEVERS

1. HOME OFFICE — DO NOW
   Currently claiming £312/yr (£6/week flat rate). Switch to actual-cost
   method: proportion of mortgage interest + council tax + utilities +
   broadband + cleaning. Typical: £1,500-£3,000/yr. CT saved: £300-£700/yr.
   Caveat: don't claim a room as "exclusively" for business — CGT trap.

2. TRIVIAL BENEFITS — DO NOW
   Up to £300/yr in non-cash gifts from the company, tax-free. Each ≤£50,
   max 6/year. Currently claiming £0. Free £75-150/yr in CT saved.

3. DIVIDENDS — ASK ACCOUNTANT
   Last FY £2,835 spilled into the higher-rate band (33.75%) = £957 wasted.
   Stop at basic-rate ceiling if cashflow allows; route excess to pension.

4. SALARY — ASK ACCOUNTANT
   £12,570 salary may no longer be optimal post Apr-2025 NI changes
   (threshold dropped to £5k, rate up to 15%). Model £5k vs £9.1k vs £12.57k.
   Probably £500-£1,000/yr.

5. VAT — ASK ACCOUNTANT
   Currently Standard scheme. Worth reviewing Flat Rate Scheme (13% for
   film/video production) given low input volume. £500-£2,000/yr potential.

6. SMALL LEAKS — ASK ACCOUNTANT
   Forex losses £400-£850/yr — use Wise/Revolut. Late-payment charges
   £150/yr — set up CT reserve account. Check DLA balance.

PARKED
- EV through company — owns current car outright (petrol/diesel). Revisit
  at car replacement. Biggest single lever (£5-8k/yr) but timing-locked.
- Phone via company — Smarty £10/mo not worth switching.
`.trim();
