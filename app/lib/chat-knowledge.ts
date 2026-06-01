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
STRATEGY — TAX & EXTRACTION (2026/27)

KEY RATES 2026/27 (use the estimate_dividend_tax tool for actual figures —
never compute dividend tax yourself):
- Personal allowance £12,570; basic-rate ceiling £50,270 (frozen to 2031).
- Dividend tax ROSE from 6 Apr 2026: 0% on the first £500, then 10.75% (basic),
  35.75% (higher, above £50,270), 39.35% (additional, above £125,140).
- Optimal director salary stays £12,570/yr (confirmed). No Employment Allowance
  (sole director, no other staff), so the company pays ~£1,135 employer NI on
  it — still cheaper than a lower salary thanks to corporation-tax relief.
- Corporation tax: 19% to £50k profit, ~26.5% marginal £50k–£250k, 25% above.

THE ONE-LINE PICTURE
Setup is mostly right. The family commitment (~£50k/yr take-home) pushes the
last slice of dividends into the 35.75% band. So: fund the family first, then
route any SURPLUS into the pension (beats a higher-rate dividend roughly 2:1)
rather than taking it as an expensive dividend.

LEVERS
1. HOME OFFICE — DO NOW. Switch the £6/week flat rate to actual-cost (a
   proportion of mortgage interest, council tax, utilities, broadband).
   ~£1,500-3,000/yr expense. Don't claim a room as "exclusively" business (CGT trap).
2. TRIVIAL BENEFITS — DO NOW. Up to £300/yr in non-cash gifts, tax-free (each
   ≤£50, max 6/yr). Currently £0.
3. DIVIDENDS — the band above £50,270 is now 35.75%. Keep dividends in the
   cheap 10.75% band where you can; route surplus to pension.
4. SALARY — keep at £12,570 (confirmed optimal for 2026/27).
5. SPOUSE/PARTNER — biggest potential lever IF a partner has little income:
   a real salary for real work and/or shareholding uses their allowances and
   the 10.75% band instead of Richard's 35.75%. Must be genuine (HMRC
   settlements rules). One for the accountant.
6. VAT — registration is mandatory now (turnover £112,948). On the Standard
   scheme (reclaims input VAT); Flat Rate probably doesn't beat it — quick check.
7. SMALL LEAKS — Wise/Revolut for forex; a CT reserve account to avoid
   late-payment charges.

PENSION
Vanguard SIPP, employer contributions ~£300/mo. Locked until 57, so only soak
up genuine surplus. The Apr-2026 dividend rise makes pension clearly better than
a higher-rate dividend for that surplus (£10k in pension keeps £10k; the same as
a higher-rate dividend nets only ~£4,700 in hand).

PARKED
- EV through company — owns current car outright. Revisit at car replacement
  (~£5-8k/yr, timing-locked).
- Phone via company — Smarty £10/mo not worth switching.
`.trim();
