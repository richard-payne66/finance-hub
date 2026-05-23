"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DashboardStats } from "@/app/api/dashboard-stats/route";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function StatsTiles() {
  const [data, setData] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard-stats")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  // Loading skeleton
  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface border border-white/8 rounded-xl p-5 animate-pulse">
            <div className="h-3 w-24 bg-white/5 rounded mb-3" />
            <div className="h-8 w-32 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const afterTaxPositive = data.cash_after_tax >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {/* 1. After-tax cash — the most important number */}
      <Tile
        label="After Tax, You Have"
        sublabel={data.connected ? `${GBP.format(data.cash_total)} in bank · ${GBP.format(data.owed_now)} owed` : "Connect FreeAgent for live data"}
        value={data.connected ? GBP.format(data.cash_after_tax) : "—"}
        valueClass={afterTaxPositive ? "text-emerald-400" : "text-red-400"}
      />

      {/* 2. Owed to you */}
      <Tile
        label="Owed to You"
        sublabel={
          data.invoices_overdue_count > 0
            ? `${data.invoices_overdue_count} overdue · ${GBP.format(data.invoices_overdue_total)}`
            : "All invoices on track"
        }
        value={data.connected ? GBP.format(data.invoices_total_owed_to_you) : "—"}
        valueClass={data.invoices_overdue_count > 0 ? "text-amber-400" : "text-foreground"}
        href="https://richardpayneltd.freeagent.com/invoices"
        external
      />

      {/* 3. Receipts queue */}
      <Tile
        label="Receipts to Review"
        sublabel={data.receipts_pending_count === 0 ? "Inbox zero ✓" : "Tap to review"}
        value={String(data.receipts_pending_count)}
        valueClass={data.receipts_pending_count > 0 ? "text-amber-400" : "text-muted"}
        href="/receipts"
      />
    </div>
  );
}

function Tile({
  label,
  sublabel,
  value,
  valueClass = "text-foreground",
  href,
  external,
}: {
  label: string;
  sublabel: string;
  value: string;
  valueClass?: string;
  href?: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted/60 mb-2">{label}</p>
      <p className={`text-3xl font-black tracking-tight ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-muted/50 mt-2 truncate">{sublabel}</p>
    </>
  );

  const cls = "bg-surface border border-white/8 rounded-xl p-5 transition-all block";
  const hover = href ? "hover:border-white/20 hover:bg-white/[0.02]" : "";

  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} ${hover}`}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={`${cls} ${hover}`}>
        {inner}
      </Link>
    );
  }

  return <div className={cls}>{inner}</div>;
}
