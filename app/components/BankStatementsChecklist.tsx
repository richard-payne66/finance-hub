"use client";

import { useEffect, useState } from "react";

// Statements confirmed saved to Dropbox — keyed as "YYYY-MM"
const KNOWN: Record<string, string[]> = {
  "2023": ["02","03","04","05","06","07","08","09","10","11","12"],
  "2024": ["01","02","03","04","05","06","07","08","09","10","11","12"],
  "2025": ["01","02","03","04","05","06","07","08","09","10","11","12"],
  "2026": ["01","02","03","04"],
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function key(year: string, mm: string) {
  return `statement-${year}-${mm}`;
}

export default function BankStatementsChecklist() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  // Seed from checklist_state on mount
  useEffect(() => {
    fetch("/api/statements/checklist")
      .then((r) => r.json())
      .then((data: string[]) => setChecked(new Set(data)))
      .catch(() => {
        // No server state yet — pre-tick all known statements
        const all = new Set<string>();
        for (const [yr, months] of Object.entries(KNOWN)) {
          for (const mm of months) all.add(key(yr, mm));
        }
        setChecked(all);
      });
  }, []);

  async function toggle(k: string) {
    const next = new Set(checked);
    if (next.has(k)) next.delete(k); else next.add(k);
    setChecked(next);
    setSaving(k);
    await fetch("/api/statements/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, checked: next.has(k) }),
    });
    setSaving(null);
  }

  const totalHave = Object.values(KNOWN).flat().length;
  const totalChecked = [...checked].filter(k => k.startsWith("statement-")).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          Bank Statements
        </p>
        <span className="text-[9px] text-muted/50 font-mono">
          {totalChecked}/{totalHave} confirmed
        </span>
      </div>

      <div className="bg-surface border border-white/8 rounded-xl overflow-hidden">
        {Object.entries(KNOWN).map(([year, months], yi) => (
          <div key={year} className={yi > 0 ? "border-t border-white/6" : ""}>
            <div className="px-4 py-2 bg-white/3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted/60">{year}</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-px bg-white/5">
              {Array.from({ length: 12 }, (_, i) => {
                const mm = String(i + 1).padStart(2, "0");
                const k = key(year, mm);
                const have = months.includes(mm);
                const isChecked = checked.has(k);
                const isSaving = saving === k;

                return (
                  <button
                    key={mm}
                    onClick={() => have && toggle(k)}
                    disabled={!have || isSaving}
                    className={`
                      relative bg-surface px-3 py-3 text-left transition-all
                      ${have ? "cursor-pointer hover:bg-white/5" : "cursor-default opacity-25"}
                    `}
                  >
                    <span className="block text-[10px] font-bold text-foreground/70 mb-1">
                      {MONTHS[i]}
                    </span>
                    <span className={`
                      inline-flex items-center justify-center w-4 h-4 rounded border text-[8px] font-bold transition-all
                      ${isChecked
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : have
                          ? "border-white/15 text-transparent"
                          : "border-white/8 text-transparent"}
                    `}>
                      {isChecked ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-muted/40 mt-2">
        Statements saved to Dropbox → 06_ACCOUNTING/Bank Statments/
      </p>
    </div>
  );
}
