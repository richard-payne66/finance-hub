"use client";

import { useEffect, useRef, useState } from "react";
import type { Document, DocumentCategory } from "@/app/lib/types";

type Item = {
  id: string;
  label: string;
  category?: DocumentCategory;
  year?: string;
  // If true, this item is matched only by checklist_item_id (e.g. bank stmts)
  manualOnly?: boolean;
};

type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "VAT Returns",
    items: [
      { id: "doc-vat-reg",  label: "VAT Registration Certificate", category: "Other" },
      { id: "doc-vat-2023", label: "VAT Returns — 2023", category: "VAT Returns", year: "2023" },
      { id: "doc-vat-2024", label: "VAT Returns — 2024", category: "VAT Returns", year: "2024" },
      { id: "doc-vat-2025", label: "VAT Returns — 2025", category: "VAT Returns", year: "2025" },
      { id: "doc-vat-2026", label: "VAT Returns — 2026", category: "VAT Returns", year: "2026" },
    ],
  },
  {
    title: "Corporation Tax",
    items: [
      { id: "doc-ct600-2223", label: "CT600 — 2022/23", category: "CT600", year: "2023" },
      { id: "doc-ct600-2324", label: "CT600 — 2023/24", category: "CT600", year: "2024" },
      { id: "doc-ct600-2425", label: "CT600 — 2024/25", category: "CT600", year: "2025" },
    ],
  },
  {
    title: "Statutory Accounts",
    items: [
      { id: "doc-accounts-2223", label: "Statutory Accounts — 2022/23", category: "Statutory Accounts", year: "2023" },
      { id: "doc-accounts-2324", label: "Statutory Accounts — 2023/24", category: "Statutory Accounts", year: "2024" },
      { id: "doc-accounts-2425", label: "Statutory Accounts — 2024/25", category: "Statutory Accounts", year: "2025" },
    ],
  },
  {
    title: "Self Assessment",
    items: [
      { id: "doc-sa-2223", label: "Self Assessment — 2022/23", category: "Self Assessment", year: "2023" },
      { id: "doc-sa-2324", label: "Self Assessment — 2023/24", category: "Self Assessment", year: "2024" },
      { id: "doc-sa-2425", label: "Self Assessment — 2024/25", category: "Self Assessment", year: "2025" },
    ],
  },
  {
    title: "PAYE / P60",
    items: [
      { id: "doc-p60-2223", label: "P60 — 2022/23", category: "P60", year: "2023" },
      { id: "doc-p60-2324", label: "P60 — 2023/24", category: "P60", year: "2024" },
      { id: "doc-p60-2425", label: "P60 — 2024/25", category: "P60", year: "2025" },
      { id: "doc-p60-2526", label: "P60 — 2025/26", category: "P60", year: "2026" },
    ],
  },
  {
    title: "Trial Balance",
    items: [
      { id: "doc-tb-2223", label: "Trial Balance — 2022/23", category: "Trial Balance", year: "2023" },
      { id: "doc-tb-2324", label: "Trial Balance — 2023/24", category: "Trial Balance", year: "2024" },
    ],
  },
  {
    title: "Company Formation",
    items: [
      { id: "doc-incorporation", label: "Certificate of Incorporation", manualOnly: true },
      { id: "doc-articles",      label: "Articles of Association",      manualOnly: true },
      { id: "doc-confirmation",  label: "Confirmation Statement",       manualOnly: true },
      { id: "doc-share-cert",    label: "Share Certificate(s)",         manualOnly: true },
    ],
  },
  {
    title: "Insurance",
    items: [
      { id: "doc-insurance-pi", label: "Professional Indemnity Insurance", manualOnly: true },
      { id: "doc-insurance-pl", label: "Public Liability Insurance",       manualOnly: true },
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

  async function upload(itemId: string, file: File, item: Item) {
    setUploading(itemId);
    const form = new FormData();
    form.append("file", file);
    form.append("checklist_item_id", itemId);
    if (item.category) form.append("category", item.category);
    if (item.year)     form.append("year", item.year);
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    if (res.ok) {
      const doc: Document = await res.json();
      setDocs((prev) => [doc, ...prev]);
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

  // Match docs by category+year, or fall back to checklist_item_id
  function docsFor(item: Item): Document[] {
    if (item.manualOnly) {
      const d = docs.find((d) => d.checklist_item_id === item.id);
      return d ? [d] : [];
    }
    if (item.category && item.year) {
      return docs.filter((d) => d.category === item.category && d.year === item.year);
    }
    if (item.category) {
      return docs.filter((d) => d.category === item.category);
    }
    const d = docs.find((d) => d.checklist_item_id === item.id);
    return d ? [d] : [];
  }

  // An item is "present" if it has docs OR is manually checked
  function isPresent(item: Item): boolean {
    return docsFor(item).length > 0 || checked.has(item.id);
  }

  const presentCount = ALL_ITEMS.filter(isPresent).length;
  const total        = ALL_ITEMS.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          Documents
        </p>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-emerald-400 font-mono font-bold">{presentCount} have</span>
          <span className="text-[9px] text-muted/30 font-mono">·</span>
          <span className="text-[9px] text-amber-400/80 font-mono font-bold">{total - presentCount} missing</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {GROUPS.map((group) => {
          const groupPresent = group.items.filter(isPresent).length;
          const allPresent   = groupPresent === group.items.length;
          const nonePresent  = groupPresent === 0;

          return (
            <div key={group.title} className="bg-surface border border-white/8 rounded-xl overflow-hidden">
              {/* Group header */}
              <div className="flex items-center justify-between px-4 py-2 bg-white/3 border-b border-white/6">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted/70">
                  {group.title}
                </span>
                <span className={`text-[9px] font-bold font-mono ${
                  allPresent  ? "text-emerald-400" :
                  nonePresent ? "text-amber-400/70" :
                                "text-amber-300/60"
                }`}>
                  {groupPresent}/{group.items.length}
                </span>
              </div>

              <div className="divide-y divide-white/4">
                {group.items.map((item) => {
                  const matchedDocs  = docsFor(item);
                  const present      = matchedDocs.length > 0 || checked.has(item.id);
                  const isSaving     = saving    === item.id;
                  const isUploading  = uploading === item.id;
                  const primaryDoc   = matchedDocs[0];

                  return (
                    <div key={item.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      present ? "" : "bg-amber-500/[0.02]"
                    }`}>

                      {/* Status indicator */}
                      <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[8px] font-bold transition-all ${
                        present
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : "border-amber-500/30 bg-amber-500/5 text-amber-400/60"
                      }`}>
                        {present ? "✓" : "–"}
                      </div>

                      {/* Label + file info */}
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs transition-colors ${
                          present ? "text-foreground/80" : "text-muted/50"
                        }`}>
                          {item.label}
                        </span>
                        {present && primaryDoc && (
                          <p className="text-[10px] text-muted/40 mt-0.5 truncate">
                            {matchedDocs.length > 1
                              ? `${matchedDocs.length} files`
                              : primaryDoc.filename}
                          </p>
                        )}
                        {!present && (
                          <p className="text-[9px] text-amber-400/50 mt-0.5 uppercase tracking-widest font-bold">
                            Not yet uploaded
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex items-center gap-1.5">
                        {present && primaryDoc && (
                          matchedDocs.length > 1 ? (
                            // Multiple files — link to category view
                            <span className="text-[9px] text-emerald-400/60 font-bold uppercase tracking-widest">
                              {matchedDocs.length} ↓
                            </span>
                          ) : (
                            <a
                              href={`/api/documents/${primaryDoc.id}/download`}
                              className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
                            >
                              ↓
                            </a>
                          )
                        )}

                        {/* Manual tick for items without file upload */}
                        {item.manualOnly && !primaryDoc && (
                          <button
                            onClick={() => toggle(item.id)}
                            disabled={isSaving}
                            className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-muted/50 hover:border-white/25 hover:text-foreground transition-all"
                          >
                            {isSaving ? "…" : "Mark"}
                          </button>
                        )}

                        {/* Upload for category-matched items */}
                        {!present && !item.manualOnly && (
                          <>
                            <input
                              ref={(el) => { fileRefs.current[item.id] = el; }}
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) upload(item.id, f, item);
                                e.target.value = "";
                              }}
                            />
                            <button
                              onClick={() => fileRefs.current[item.id]?.click()}
                              disabled={isUploading}
                              className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-500/25 text-amber-400/60 hover:border-amber-500/50 hover:text-amber-400 transition-all disabled:opacity-40"
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
