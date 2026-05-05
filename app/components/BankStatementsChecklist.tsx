"use client";

// Simple summary — one row per year, shows count and lets you tick it off.
const YEARS = [
  { year: "2023", count: 11, note: "Feb–Dec" },
  { year: "2024", count: 12, note: "All months" },
  { year: "2025", count: 12, note: "All months" },
  { year: "2026", count: 4,  note: "Jan–Apr" },
];

export default function BankStatementsChecklist() {
  return (
    <div>
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
        Bank Statements
        <span className="ml-2 text-muted/40 normal-case font-normal">Monzo Business — saved to Dropbox</span>
      </p>
      <div className="bg-surface border border-white/8 rounded-xl divide-y divide-white/6">
        {YEARS.map(({ year, count, note }) => (
          <div key={year} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-foreground">{year}</span>
              <span className="text-[10px] text-muted/50">{note} · {count} statements</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              ✓ Saved
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
