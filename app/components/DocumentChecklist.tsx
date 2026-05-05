"use client";

import { useEffect, useState } from "react";

type Item = { id: string; label: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Company Formation",
    items: [
      { id: "doc-incorporation",    label: "Certificate of Incorporation" },
      { id: "doc-articles",         label: "Articles of Association" },
      { id: "doc-confirmation",     label: "Confirmation Statement (latest)" },
      { id: "doc-share-cert",       label: "Share Certificate(s)" },
    ],
  },
  {
    title: "Corporation Tax",
    items: [
      { id: "doc-ct600-2223", label: "CT600 — 2022/23" },
      { id: "doc-ct600-2324", label: "CT600 — 2023/24" },
      { id: "doc-ct600-2425", label: "CT600 — 2024/25" },
    ],
  },
  {
    title: "Statutory Accounts",
    items: [
      { id: "doc-accounts-2223", label: "Statutory Accounts — 2022/23" },
      { id: "doc-accounts-2324", label: "Statutory Accounts — 2023/24" },
      { id: "doc-accounts-2425", label: "Statutory Accounts — 2024/25" },
    ],
  },
  {
    title: "Self Assessment",
    items: [
      { id: "doc-sa-2223", label: "Self Assessment return — 2022/23" },
      { id: "doc-sa-2324", label: "Self Assessment return — 2023/24" },
      { id: "doc-sa-2425", label: "Self Assessment return — 2024/25" },
    ],
  },
  {
    title: "PAYE",
    items: [
      { id: "doc-p60-2223", label: "P60 — 2022/23" },
      { id: "doc-p60-2324", label: "P60 — 2023/24" },
      { id: "doc-p60-2425", label: "P60 — 2024/25" },
    ],
  },
  {
    title: "VAT",
    items: [
      { id: "doc-vat-reg",     label: "VAT Registration Certificate" },
      { id: "doc-vat-2023",    label: "VAT Returns — 2023" },
      { id: "doc-vat-2024",    label: "VAT Returns — 2024" },
      { id: "doc-vat-2025",    label: "VAT Returns — 2025" },
    ],
  },
  {
    title: "Pension",
    items: [
      { id: "doc-pension-policy",  label: "Pension policy documents (Scottish Equitable)" },
      { id: "doc-pension-2023",    label: "Pension statement — 2023" },
      { id: "doc-pension-2024",    label: "Pension statement — 2024" },
      { id: "doc-pension-2025",    label: "Pension statement — 2025" },
    ],
  },
  {
    title: "Insurance",
    items: [
      { id: "doc-insurance-pi",  label: "Professional Indemnity Insurance" },
      { id: "doc-insurance-pl",  label: "Public Liability Insurance" },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

export default function DocumentChecklist() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/documents/checklist")
      .then((r) => r.json())
      .then((data: string[]) => setChecked(new Set(data)))
      .catch(() => {});
  }, []);

  async function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
    setSaving(id);
    await fetch("/api/documents/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: id, checked: next.has(id) }),
    });
    setSaving(null);
  }

  const done  = ALL_ITEMS.filter((i) => checked.has(i.id)).length;
  const total = ALL_ITEMS.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          Documents to Collect
        </p>
        <span className="text-[9px] text-muted/50 font-mono">
          {done}/{total} obtained
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {GROUPS.map((group) => {
          const groupDone = group.items.filter((i) => checked.has(i.id)).length;
          return (
            <div key={group.title} className="bg-surface border border-white/8 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-white/3 border-b border-white/6">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted/70">
                  {group.title}
                </span>
                <span className="text-[9px] text-muted/40 font-mono">
                  {groupDone}/{group.items.length}
                </span>
              </div>
              <div className="divide-y divide-white/4">
                {group.items.map((item) => {
                  const isChecked = checked.has(item.id);
                  const isSaving  = saving === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      disabled={isSaving}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors disabled:opacity-50"
                    >
                      <span className={`
                        shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[8px] font-bold transition-all
                        ${isChecked
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : "border-white/15"}
                      `}>
                        {isChecked ? "✓" : ""}
                      </span>
                      <span className={`text-xs transition-colors ${isChecked ? "text-muted/40 line-through" : "text-foreground/80"}`}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
