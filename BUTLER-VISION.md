# Finance Hub → Financial Butler

> The brief: this is **not accounting software**. It's a financial butler that
> reduces thinking, reduces overwhelm, and helps Richard make better decisions.
> FreeAgent already does the accounting. The value here is **judgement**.

Last updated: 2026-06-01. Backup of the pre-butler system: git tag
`backup-pre-butler-2026-06-01`.

---

## The seven principles (the bar every feature is judged against)

1. Judgement over reporting — "Can I do this?", not "here's a chart".
2. Surface risks/opportunities/actions automatically, without being asked.
3. Always explain WHY, in plain English.
4. Reduce cognitive load — hide complexity until needed.
5. No accounting jargon.
6. Feel like a trusted chief-of-staff / personal CFO.
7. Accuracy is non-negotiable — **numbers come from deterministic code, never
   from the LLM.** The model phrases; it never invents figures.

---

## SHIPPED — cycle 1 (this session)

### 1. Proactive briefing (the butler's opening line)
- **Feature:** A greeting block at the very top of the dashboard that states, in
  one or two plain sentences, where Richard stands: how much he can safely take
  out, what's set aside for tax, and the short list of things only he can action
  (transactions to review, a bill to pay by hand). `app/components/ButlerBriefing.tsx`.
- **Why it works:** Replaces "scan 12 cards and infer" with "read one sentence".
  Deterministic — built from `/api/dividend-headroom`, `/api/forecast`,
  `/api/categorisation/list`, so the numbers are real.
- **User benefit:** Answers "am I OK?" in 3 seconds. Calm by default.
- **Complexity:** Low (compose existing endpoints client-side).
- **Priority:** High. ✅

### 2. "Can I…?" decision support
- **Feature:** The butler can now answer affordability/extraction questions with
  real numbers — new `financial_position` tool feeds it live cash, tax owed,
  buffer and safe-to-take. One-tap decision questions on the dashboard and in the
  chat ("Can I take £3,000 out?", "Can I afford a £2,000 camera?", "Am I set for
  the tax bill?") open the butler pre-asked.
- **Why it works:** This is principle #1 made literal. Before, the butler could
  only talk about receipts — it had no idea what was in the bank.
- **User benefit:** Stops the "should I / can I afford it" mental loop. Clear
  yes/no + the number + one line of why.
- **Complexity:** Low–Medium (one shared lib `getDividendHeadroom`, one tool, an
  `openButler()` event so any button can seed the chat).
- **Priority:** High. ✅

---

## NEXT — strong candidates (not yet built)

### 3. Daily/weekly proactive nudge (push, not pull)
- **Feature:** A short message ("you can take £X; VAT £Y due in 9 days; nothing
  else needs you") delivered by email/WhatsApp on a cadence, reusing the briefing
  logic. ADHD research is clear: the win is the system reaching out, not waiting
  to be opened.
- **Why / benefit:** Removes the need to remember to check. Highest-leverage step
  toward "proactive".
- **Complexity:** Medium (cron + delivery channel; briefing logic already exists).
- **Priority:** High (next cycle).

### 4. "Set aside for tax" pot tracker
- **Feature:** Track money mentally/actually reserved for VAT + CT vs the live
  liability, so "safe to take" can subtract a *true* tax reserve, and warn if the
  reserve is short.
- **Why / benefit:** Turns the biggest founder anxiety ("will I have the tax
  money?") into a solved, visible thing.
- **Complexity:** Medium (needs a reserve figure — a KV value or a tagged FA
  account).
- **Priority:** Medium.

### 5. One consolidated `/api/briefing` endpoint
- **Feature:** Server-side aggregation so the dashboard fetches FreeAgent once
  instead of several endpoints duplicating bank/VAT/CT calls.
- **Why / benefit:** Faster dashboard, fewer FreeAgent calls.
- **Complexity:** Low–Medium.
- **Priority:** Medium (performance, not features).

### 6. Light scenario answers ("what if")
- **Feature:** Let the butler answer "what happens if I take £X as dividend vs
  pension?" using the 2026/27 numbers already on the strategy page.
- **Why / benefit:** Decision support for the one genuinely complex choice.
- **Complexity:** Medium.
- **Priority:** Medium. Keep it conversational — NOT a sliders-and-charts modeller.

---

## REJECTED / DEFERRED (and why)

- **Director's Loan Account monitoring** — listed in the brief, but there's no DLA
  data anywhere (FreeAgent feed or DB). Net-new data + ongoing maintenance for a
  director who extracts via salary+dividends, where the DLA is likely small.
  *Rejected for now: complexity without proportional thinking-reduction.* Revisit
  only if a DLA balance becomes easy to read from FreeAgent.
- **Dividend/payroll history tables with voucher tracking** — useful for an
  accountant, but it's record-keeping (reporting), not judgement, and adds a
  data-entry burden. *Deferred.*
- **Charts / net-worth graphs / spend dashboards** — explicitly against the brief.
  Other tools do this. *Rejected.*
- **Full scenario modeller with sliders** — increases complexity and decisions.
  Replaced by conversational "what if" (#6). *Rejected as built; kept as chat.*
- **More always-on cards** — the fix for overwhelm is fewer surfaces, not more.
  Every new signal must earn its place or hide until it matters.

---

## Design rules going forward

- Deterministic numbers, LLM phrasing. Never let the model state a figure it
  didn't get from a tool/endpoint.
- One clear action at a time. If nothing needs Richard, say so plainly.
- Plain English, no jargon. Translate every accounting term.
- Additive and reversible. Tag a backup before big changes; deploy in slices.
