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

const LAST_UPDATED = "2026-05-25";

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
    title: "Dividends — stop at the basic-rate ceiling",
    what: "Last year £2,835 of your dividends crossed into the 33.75% band. You paid £957 in tax on that chunk. If you'd stopped at the basic-rate ceiling, you'd save the £957 — but you'd have £1,878 less in your pocket that year.",
    how: [
      "**Short version:** yes, this means less monthly take-home.",
      "**The smarter way:** instead of taking the higher-rate dividend, the company pays the same amount into your pension as an employer contribution. No income tax, no dividend tax, no NI.",
      "Trade-off: same total money, but routed via pension → you can't touch it until 55-57+.",
      "Only do this if your monthly budget can absorb the cashflow hit.",
    ],
    worth: "£957/yr saved if you can afford the cashflow swap.",
  },
  {
    status: "ask",
    title: "Salary — needs re-modelling",
    what: "Your salary has been £12,570 for years. That made sense before April 2025, but employer NI rules changed (threshold dropped to £5k, rate up to 15%). The new optimum could be £5k, £9.1k, or still £12.57k — depends on the maths.",
    how: [
      "Ask the new accountant to model the three options for 2026-27.",
      "Pick the cheapest.",
      "Update the payroll.",
    ],
    worth: "Probably £500–£1,000/yr.",
  },
  {
    status: "ask",
    title: "VAT — is registration still right?",
    what: "You're VAT-registered (turnover £88k, just below the £90k threshold = voluntary registration). Worth asking two questions.",
    how: [
      "**Should you stay registered?** If your clients are VAT-registered businesses → they don't care → keep it (so you can reclaim VAT on costs). If clients are individuals or small businesses → being registered makes you 20% more expensive than non-registered competitors → maybe deregister.",
      "**Are you on the right scheme?** You're probably on standard. The Flat Rate Scheme (FRS) can be more profitable for service businesses with low costs — you charge 20%, pay HMRC a lower flat % (e.g. 14.5%), keep the difference.",
    ],
    worth: "£500–£2,000/yr depending on the answer.",
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
    body: "On paper there's £100k+ of unused 'carry-forward' allowance sitting there. In practice, you can't afford to put more in — family expenses eat the take-home. So that's parked.",
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
  "Salary — model £5k vs £9.1k vs £12.57k for 2026-27 under the new NI rules.",
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

      {/* 6 levers */}
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
