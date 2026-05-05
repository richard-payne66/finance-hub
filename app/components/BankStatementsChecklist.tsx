"use client";

import { useEffect, useState } from "react";
import type { Document } from "@/app/lib/types";

const YEARS = [
  { year: "2023", count: 11, note: "Feb–Dec" },
  { year: "2024", count: 12, note: "All months" },
  { year: "2025", count: 12, note: "All months" },
  { year: "2026", count: 4,  note: "Jan–Apr" },
];

export default function BankStatementsChecklist() {
  const [docs, setDocs] = useState<Document[]>([]);

  useEffect(() => {
    fetch("/api/documents/list")
      .then((r) => r.json())
      .then((all: Document[]) => setDocs(all.filter((d) => d.category === "Bank Statement")))
      .catch(() => {});
  }, []);

  function docsForYear(year: string) {
    return docs.filter((d) => d.year === year);
  }

  return (
    <div>
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
        Bank Statements
        <span className="ml-2 text-muted/40 normal-case font-normal">Monzo Business</span>
      </p>
      <div className="bg-surface border border-white/8 rounded-xl divide-y divide-white/6">
        {YEARS.map(({ year, count, note }) => {
          const yearDocs = docsForYear(year);
          const ready = yearDocs.length > 0;
          return (
            <div key={year} className="flex items-center justify-between px-4 py-3 gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground">{year}</span>
                <span className="text-[10px] text-muted/50">{note} · {count} statements</span>
              </div>
              <div className="flex items-center gap-2">
                {ready ? (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      ✓ {yearDocs.length} files
                    </span>
                    {/* Link to filtered view — individual downloads on share page */}
                    <a
                      href={`/api/documents/list?year=${year}&category=Bank+Statement`}
                      className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
                      title="Individual files downloadable via share link"
                    >
                      {yearDocs.length} PDFs ↓
                    </a>
                  </>
                ) : (
                  <span className="text-[10px] text-muted/30 uppercase tracking-widest font-bold">
                    Not uploaded
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted/30 mt-2">
        Individual statements downloadable via the accountant share link below
      </p>
    </div>
  );
}
