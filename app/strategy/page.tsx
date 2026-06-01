import Link from "next/link";

// /strategy — the readable web view of the tax & extraction briefing
// prepared for the new accountant.
//
// Source of truth doc:
//   06_ACCOUNTING/ACCOUNTANT-BRIEF.md (Dropbox)
//
// This page is plain English, card-based, no tables — Richard hates
// tables of percentages.

export const dynamic = "force-static";

const LAST_UPDATED = "2026-06-01";

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-foreground/95">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

type Lever = {
  status: "do-now" | "parked" | "ask";
  title: string;
  what: string;
  how: string[];
  worth: string;
};

const LEVERS: Lever[] = [
  {
    status: "do-now",
    title: "Home office — claim it properly",
    what: "Right now you claim £312/yr (the £6/week flat rate). As a sole-director working from home, you can claim the real cost — a proportion of mortgage interest, council tax, utilities, broadband, cleaning.",
    how: [
      "Pick a room you mainly work in.",
      "Work out the proportion (1 room out of 6 = 1/6).",
      "Apply that to each household cost.",
      "Don't claim it as 'exclusively' for business — say it has some personal use. (Otherwise you lose part of the Capital Gains Tax relief when you sell the house.)",
      "The new accountant runs the numbers and puts it through the books.",
    ],
    worth: "£1,500–£3,000/yr as a company expense. CT saved: £300–£700/yr.",
  },
  {
    status: "do-now",
    title: "Trivial benefits — free £300/yr",
    what: "HMRC lets directors take up to £300/yr in small gifts from the company, tax-free. You're claiming £0.",
    how: [
      "Buy a gift card (Amazon, John Lewis, Tesco, anything but cash) with the company card.",
      "Each gift must be under £50.",
      "Max 6 per year = £300 total.",
      "Not a reward for work, not contractual. Just gifts.",
      "Keep the receipt, book it as 'Trivial benefits' or 'Staff welfare'.",
      "Spread them across the year — don't bunch them on one day.",
    ],
    worth: "£300/yr of personal spending money paid pre-tax. Zero hassle.",
  },
  {
    status: "ask",
    title: "Dividends — the band above £50,270 just got pricier",
    what: "Dividend tax rose 2 points in April 2026. Below £50,270 of total income you now pay 10.75% on dividends; above it, 35.75% (it was 33.75%). Your family commitment of ~£50k take-home pushes the last slice of your dividends into that higher band — the slice that just got more expensive.",
    how: [
      "**The cheap zone:** salary £12,570 + dividends up to the £50,270 ceiling lands roughly £46k in your pocket for about £4,000 of tax.",
      "**The expensive bit:** the few thousand above that, to clear your £50k need, is taxed at 35.75%.",
      "**The smarter route for any surplus beyond what the family needs:** the company pays it into your pension instead of you taking a 35.75% dividend — no dividend tax, no NI, and it cuts corporation tax. £10k into pension keeps £10k; the same £10k as a higher-rate dividend leaves you only ~£4,700.",
      "Trade-off: pension money is locked until 57, so only route the genuine surplus there.",
    ],
    worth: "Hundreds to ~£1k+/yr by keeping surplus out of the 35.75% band.",
  },
  {
    status: "ask",
    title: "Spouse / partner — the biggest lever, if it fits",
    what: "Right now every pound runs through you, so it all stacks against your one set of allowances and tax bands — which is what forces you into the 35.75% dividend band. If you have a spouse or partner with little income of their own, splitting income across two people is potentially the single biggest saving available to you.",
    how: [
      "If they genuinely help in the business, a real salary for real work is a company expense.",
      "Making them a shareholder lets dividends be paid to them too — using their personal allowance, their £500 dividend allowance, and their basic-rate band at 10.75% instead of your 35.75%.",
      "**It has to be genuine** — real shares, real involvement — not a paper exercise. HMRC has 'settlements' rules for arrangements that exist only to save tax. So this is a conversation to have with the accountant, not a switch to flip.",
    ],
    worth: "Potentially £1,000s/yr — the biggest single item here if your situation fits.",
  },
  {
    status: "do-now",
    title: "Salary — keep it at £12,570",
    what: "You've worried this needs changing since the April 2025 employer-NI shake-up (threshold dropped to £5k, rate up to 15%). Good news: £12,570 (about £1,048/month) is still the sweet spot for 2026/27. The corporation-tax relief on the salary outweighs the small bit of employer NI it triggers (~£1,135/yr), so a lower salary would actually cost you more overall.",
    how: [
      "Leave the salary at £12,570/yr — no change needed.",
      "You can't claim the Employment Allowance (not available to a sole director with no other staff), so the company does pay a little employer NI — that's expected and still the cheaper option.",
      "Just confirm payroll is running at this level for 2026/27.",
    ],
    worth: "Already optimal — saves ~£500–£1,000/yr vs dropping the salary.",
  },
  {
    status: "ask",
    title: "VAT — Standard vs Flat Rate Scheme",
    what: "Your turnover is now £112,948 — above the £90k threshold — so registration is mandatory; deregistering isn't an option any more. You're on the Standard scheme (you reclaim the VAT on your costs). The one open question is whether the Flat Rate Scheme would beat it.",
    how: [
      "**Standard (what you're on):** charge 20%, reclaim VAT on your expenses. Wins if you have decent VAT-able costs.",
      "**Flat Rate Scheme:** charge 20% but pay HMRC a lower flat % and can't reclaim input VAT (except big one-off equipment). Wins for service businesses with very low costs.",
      "Ask the accountant to compare the two on your real numbers — with the software/subscription VAT you reclaim, Standard probably still wins, but it's a five-minute check.",
    ],
    worth: "£0–£1,500/yr — likely confirms Standard is right.",
  },
  {
    status: "ask",
    title: "Small leaks worth plugging",
    what: "A few small things that quietly cost a bit each year.",
    how: [
      "**Forex losses:** £400–£850/yr lost on currency conversion. A Wise or Revolut Business account would mostly kill this.",
      "**Late-payment tax charges:** £150 hit two years running. Set up a separate company account that holds the CT money so you never miss the deadline.",
      "**Director's Loan Account:** check the current balance — if the company owes you money, you can draw it out tax-free.",
    ],
    worth: "£500–£1,000/yr combined.",
  },
  {
    status: "parked",
    title: "EV through the company — wait until next car",
    what: "Originally the biggest lever, but you own your current car outright. Putting a petrol/diesel car into the company is a tax disaster (huge benefit-in-kind, 25–37%).",
    how: [
      "Park this until the car needs replacing.",
      "When that day comes — make the replacement an EV, bought or leased through Richard Payne Ltd.",
      "BIK on EVs is tiny (3% now, 5% by 2027).",
      "Worth ~£5–8k/yr in freed personal cash at that point.",
    ],
    worth: "Big — but timing-locked.",
  },
  {
    status: "parked",
    title: "Phone via company — not worth switching",
    what: "Smarty doesn't do business contracts and you're only paying £10/month.",
    how: [
      "Stay on Smarty.",
      "Revisit only if/when you upgrade or need a separate work line.",
    ],
    worth: "Maybe £10–£40/yr. Not worth the admin.",
  },
];

const PENSION: { heading: string; body: string }[] = [
  {
    heading: "What you have",
    body: "Vanguard SIPP, pot value £47,733. Contributing about £300/month from the company as employer contributions. Setup is **correct** — no changes needed to the mechanism.",
  },
  {
    heading: "The honest take on contributing more",
    body: "On paper there's £100k+ of unused 'carry-forward' allowance sitting there. In practice, you can't afford to put much more in directly — family expenses eat the take-home. **But** April 2026's dividend-tax rise sharpened the case for any surplus: above the £50,270 ceiling, a pension contribution beats a dividend by roughly two-to-one. So the rule is simple — fund the family first, and steer anything left over into the pension rather than a 35.75% dividend.",
  },
  {
    heading: "How to actually raise contributions over time",
    body: "Indirect route: do the **home office** + **trivial benefits** + **dividend rebalance** levers above. They free up either personal cash or company cash. Use that freed cash to gradually nudge the £300/month up. Not overnight — drip-fed over 1–2 years.",
  },
];

const COMPANY_FACTS: string[] = [
  "Richard Payne Ltd · Co. No. 11954006 · UTR 3131219862",
  "Sole director, no other employees · Year end 30 April · VAT registered",
  "Current accountant: Jungle Tax (Sal Tarar). Switching to a cheaper provider (~£85-107/mo) — handover in progress.",
  "FY26 (filed May 2026): turnover £112,948 (up 28%) · net profit £57,849 · CT £11,577 due 1 Feb 2027",
  "FY25: turnover £88,240 · net profit £45,411 · CT paid £11,217",
  "Net assets: thin — limits how much the company can retain",
];

const QUESTIONS: string[] = [
  "Home office — switch to actual-cost method. What's the right proportion for me, and can we backdate FY26?",
  "Trivial benefits — confirm I can claim £300/yr in gift cards and how to record them.",
  "VAT — should I stay registered? Standard vs Flat Rate Scheme — which wins for my client mix?",
  "Salary — confirm £12,570 is still the optimal level for 2026/27 (I believe it is, given no Employment Allowance).",
  "Dividend planning — what's the right strategy if we want to stop at the basic-rate ceiling?",
  "Pension — what's a realistic 1–2 year plan to nudge contributions above £300/month?",
  "Spouse / share structure — am I missing income-shifting opportunities?",
  "R&D — does any of my work qualify for SME R&D relief?",
  "Forex — should the company use Wise or Revolut Business to kill conversion losses?",
  "Director's Loan Account — what's the current balance, and can I draw any of it tax-free?",
  "When I replace my car (in [X] years), what's the cleanest way to put an EV through the company?",
];

const STATUS_LABEL: Record<Lever["status"], { label: string; cls: string }> = {
  "do-now": { label: "Do now", cls: "bg-primary/15 text-primary border-primary/30" },
  ask: { label: "Ask accountant", cls: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
  parked: { label: "Parked", cls: "bg-white/5 text-muted/60 border-white/10" },
};

function LeverCard({ lever }: { lever: Lever }) {
  const status = STATUS_LABEL[lever.status];
  return (
    <div className="border border-white/8 rounded-2xl px-5 sm:px-7 py-6 mb-4 bg-surface">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[17px] sm:text-[19px] font-bold text-foreground/95 leading-tight">
          {lever.title}
        </h3>
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border whitespace-nowrap ${status.cls}`}>
          {status.label}
        </span>
      </div>
      <p className="text-[14px] sm:text-[15px] text-foreground/80 leading-relaxed mb-3">
        {renderInline(lever.what)}
      </p>
      <ul className="list-none space-y-1.5 mb-3">
        {lever.how.map((step, i) => (
          <li
            key={i}
            className="text-[13.5px] sm:text-[14px] text-foreground/75 leading-relaxed pl-3 border-l border-primary/20"
          >
            {renderInline(step)}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted/70 uppercase tracking-widest font-mono mt-2">
        Worth: {lever.worth}
      </p>
    </div>
  );
}

export default function StrategyPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-3xl mx-auto">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            TAX STRATEGY
          </h1>
          <p className="text-[13px] text-muted/70 mt-1 leading-relaxed max-w-xl">
            The brief for the new accountant. Active to-dos, things to ask, things to park.
          </p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono shrink-0 mt-1">
          Updated {LAST_UPDATED}
        </span>
      </header>

      <p className="text-[11px] text-muted/50 mb-6 leading-relaxed">
        Source doc: <span className="font-mono">06_ACCOUNTING/ACCOUNTANT-BRIEF.md</span> on Dropbox.
        Live financial data (CT due, VAT, receipts, etc.) on the{" "}
        <Link href="/" className="text-primary hover:underline">Dashboard</Link>.
      </p>

      {/* One-line summary */}
      <section className="bg-surface border border-primary/25 rounded-2xl px-5 sm:px-7 py-6 mb-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary/70 mb-3">
          The picture in one line
        </p>
        <p className="text-[15px] sm:text-[16px] text-foreground/90 leading-relaxed">
          Setup is mostly right. Biggest miss is the <strong className="text-foreground/95">pension</strong>,
          but you can&apos;t afford to pay more in directly. So the real play is{" "}
          <strong className="text-foreground/95">shifting some personal costs onto the company</strong>{" "}
          (home office, gift cards, maybe an EV later) — same lifestyle, less tax.
        </p>
      </section>

      {/* What changed in April 2026 */}
      <section className="bg-amber-500/[0.06] border border-amber-500/25 rounded-2xl px-5 sm:px-7 py-6 mb-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 mb-3">
          What changed in April 2026
        </p>
        <p className="text-[15px] sm:text-[16px] text-foreground/90 leading-relaxed">
          Dividend tax went up 2 points. Below £50,270 of income you now pay{" "}
          <strong className="text-foreground/95">10.75%</strong> on dividends (was 8.75%); above it,{" "}
          <strong className="text-foreground/95">35.75%</strong> (was 33.75%). Your £12,570 salary is still
          the right level. The practical upshot: getting to about £46k in your pocket stays cheap, but the
          last stretch up to your ~£50k family need is taxed at 35.75% — so any money beyond what the family
          needs is far better off going into your <strong className="text-foreground/95">pension</strong> than
          taken as a higher-rate dividend.
        </p>
      </section>

      {/* the levers */}
      <section className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted/60 mb-4">
          The list — what&apos;s worth doing
        </p>
        {LEVERS.map((l, i) => (
          <LeverCard key={i} lever={l} />
        ))}
        <p className="text-[13px] text-foreground/70 leading-relaxed mt-4 px-2">
          Realistic combined saving across the &quot;do now&quot; + &quot;ask&quot; items:{" "}
          <strong className="text-foreground/95">£2–5k/yr</strong> while constraints hold.
          Adds another £5–8k/yr once the EV moment arrives.
        </p>
      </section>

      {/* Pension */}
      <section className="bg-surface/60 border border-white/8 rounded-2xl px-5 sm:px-7 py-6 mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted/60 mb-5">
          Pension — current state &amp; honest take
        </p>
        {PENSION.map((s, i) => (
          <div key={i} className="mb-4 last:mb-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary/70 mb-2">
              {s.heading}
            </p>
            <p className="text-[14px] sm:text-[15px] text-foreground/85 leading-relaxed">
              {renderInline(s.body)}
            </p>
          </div>
        ))}
      </section>

      {/* Questions */}
      <section className="bg-surface border border-primary/15 rounded-2xl px-5 sm:px-7 py-6 mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted/60 mb-5">
          Questions to walk into the meeting with
        </p>
        <ol className="list-decimal list-inside space-y-2.5 marker:text-primary/60 marker:font-bold marker:text-[12px]">
          {QUESTIONS.map((q, i) => (
            <li key={i} className="text-[14px] text-foreground/85 leading-relaxed pl-1">
              {renderInline(q)}
            </li>
          ))}
        </ol>
      </section>

      {/* Company facts */}
      <section className="bg-surface/40 border border-white/5 rounded-2xl px-5 sm:px-7 py-6 mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted/60 mb-4">
          Company facts (for reference)
        </p>
        <ul className="list-none space-y-1.5">
          {COMPANY_FACTS.map((f, i) => (
            <li
              key={i}
              className="text-[13px] sm:text-[14px] text-foreground/75 leading-relaxed pl-3 border-l border-primary/20"
            >
              {renderInline(f)}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-block text-[11px] font-bold uppercase tracking-widest text-primary/80 hover:text-primary transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
