"use client";

import { useEffect, useRef, useState } from "react";
import type { Document } from "@/app/lib/types";

type Item  = { id: string; label: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Company Formation",
    items: [
      { id: "doc-incorporation", label: "Certificate of Incorporation" },
      { id: "doc-articles",      label: "Articles of Association" },
      { id: "doc-confirmation",  label: "Confirmation Statement (latest)" },
      { id: "doc-share-cert",    label: "Share Certificate(s)" },
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
      { id: "doc-sa-2223", label: "Self Assessment — 2022/23" },
      { id: "doc-sa-2324", label: "Self Assessment — 2023/24" },
      { id: "doc-sa-2425", label: "Self Assessment — 2024/25" },
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
      { id: "doc-vat-reg",  label: "VAT Registration Certificate" },
      { id: "doc-vat-2023", label: "VAT Returns — 2023" },
      { id: "doc-vat-2024", label: "VAT Returns — 2024" },
      { id: "doc-vat-2025", label: "VAT Returns — 2025" },
    ],
  },
  {
    title: "Pension",
    items: [
      { id: "doc-pension-policy", label: "Pension policy (Scottish Equitable)" },
      { id: "doc-pension-2023",   label: "Pension statement — 2023" },
      { id: "doc-pension-2024",   label: "Pension statement — 2024" },
      { id: "doc-pension-2025",   label: "Pension statement — 2025" },
    ],
  },
  {
    title: "Insurance",
    items: [
      { id: "doc-insurance-pi", label: "Professional Indemnity Insurance" },
      { id: "doc-insurance-pl", label: "Public Liability Insurance" },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

export default function DocumentChecklist() {
  const [checked,   setChecked]   = useState<Set<string>>(new Set());
  const [docs,      setDocs]      = useState<Document[]>([]);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/documents/checklist").then((r) => r.json()),
      fetch("/api/documents/list").then((r) => r.json()),
    ]).then(([checkedIds, docList]: [string[], Document[]]) => {
      setChecked(new Set(checkedIds));
      setDocs(docList);
    }).catch(() => {});
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

  async function upload(itemId: string, file: File) {
    setUploading(itemId);
    const form = new FormData();
    form.append("file", file);
    form.append("checklist_item_id", itemId);
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    if (res.ok) {
      const doc: Document = await res.json();
      setDocs((prev) => [doc, ...prev]);
      // Auto-tick when a file is uploaded
      const next = new Set(checked);
      next.add(itemId);
      setChecked(next);
      await fetch("/api/documents/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: itemId, checked: true }),
      });
    }
    setUploading(null);
  }

  function docFor(itemId: string): Document | undefined {
    return docs.find((d) => d.checklist_item_id === itemId);
  }

  const done  = ALL_ITEMS.filter((i) => checked.has(i.id)).length;
  const total = ALL_ITEMS.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          Documents to Collect
        </p>
        <span className="text-[9px] text-muted/50 font-mono">{done}/{total} obtained</span>
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
                  const isChecked  = checked.has(item.id);
                  const isSaving   = saving    === item.id;
                  const isUploading = uploading === item.id;
                  const doc        = docFor(item.id);

                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggle(item.id)}
                        disabled={isSaving}
                        className={`
                          shrink-0 w-4 h-4 rounded border flex items-center justify-center
                          text-[8px] font-bold transition-all
                          ${isChecked
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                            : "border-white/15 hover:border-white/30"}
                        `}
                      >
                        {isChecked ? "✓" : ""}
                      </button>

                      {/* Label + file info */}
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs transition-colors ${isChecked && !doc ? "text-muted/40 line-through" : "text-foreground/80"}`}>
                          {item.label}
                        </span>
                        {doc && (
                          <p className="text-[10px] text-muted/50 mt-0.5 truncate">{doc.filename}</p>
                        )}
                      </div>

                      {/* Upload / Download */}
                      <div className="shrink-0 flex items-center gap-2">
                        {doc ? (
                          <a
                            href={`/api/documents/${doc.id}/download`}
                            className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
                          >
                            ↓
                          </a>
                        ) : (
                          <>
                            <input
                              ref={(el) => { fileRefs.current[item.id] = el; }}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) upload(item.id, f);
                                e.target.value = "";
                              }}
                            />
                            <button
                              onClick={() => fileRefs.current[item.id]?.click()}
                              disabled={isUploading}
                              className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all disabled:opacity-40"
                            >
                              {isUploading ? "…" : "Upload"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
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
