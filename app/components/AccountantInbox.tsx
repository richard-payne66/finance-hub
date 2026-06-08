"use client";

import { useEffect, useState } from "react";

type Action = { text: string; due: string | null; is_payment?: boolean; amount?: string | null };
type Email = {
  id: string;
  threadId: string;
  subject: string;
  date: string;
  link: string;
  summary: string;
  actions: Action[];
};
type Inbox = {
  connected: boolean;
  checked_at: string | null;
  emails: Email[];
  open_action_count: number;
};

function ago(iso?: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h > 0) return `${h}h ago`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function AccountantInbox() {
  const [d, setD] = useState<Inbox | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/accountant-actions").then((r) => r.json()).then(setD).catch(() => {});
  }
  useEffect(load, []);

  async function rescan() {
    setBusy(true);
    try {
      const r = await fetch("/api/accountant-actions", { method: "POST" });
      if (r.ok) setD(await r.json());
    } finally { setBusy(false); }
  }

  async function done(id: string) {
    const r = await fetch(`/api/accountant-actions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) setD(await r.json());
  }

  // Only show this card when there's actually something to pay — otherwise it's
  // a dead "nothing here" card. Stay hidden while loading too (no skeleton flash).
  if (!d) return null;

  // Not connected — quiet prompt to hook up Gmail
  if (!d.connected) {
    return (
      <div className="mb-6 bg-surface border border-white/8 rounded-2xl p-5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50 mb-2">
          👔 From your accountant
        </p>
        <p className="text-xs text-muted/60 mb-3">
          Connect Gmail and I&apos;ll watch for anything your accountant needs you to do.
        </p>
        <a
          href="/api/google/connect"
          className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity"
        >
          Connect Gmail
        </a>
      </div>
    );
  }

  const withActions = d.emails.filter((e) => e.actions.length > 0);
  // Nothing the accountant needs paid → hide the card entirely.
  if (withActions.length === 0) return null;

  return (
    <div className="mb-6 bg-surface border border-white/8 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50">
          👔 From your accountant
          {d.open_action_count > 0 && (
            <span className="ml-2 text-amber-400">{d.open_action_count} to pay</span>
          )}
        </p>
        <button
          onClick={rescan}
          disabled={busy}
          className="text-[9px] uppercase tracking-widest font-bold text-muted/40 hover:text-foreground transition-colors disabled:opacity-40"
        >
          {busy ? "Checking…" : "Check now ↻"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {withActions.map((e) => (
            <div key={e.id} className="rounded-xl bg-background border border-white/8 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-bold text-foreground/90 hover:text-primary leading-tight min-w-0"
                >
                  {e.subject} ↗
                </a>
                <button
                  onClick={() => done(e.id)}
                  title="Mark these done / hide"
                  className="shrink-0 text-[9px] uppercase tracking-widest font-bold text-muted/40 hover:text-primary transition-colors"
                >
                  Done
                </button>
              </div>
              {e.summary && <p className="text-[11px] text-muted/55 mt-0.5 leading-snug">{e.summary}</p>}
              <ul className="mt-2 flex flex-col gap-1.5">
                {e.actions.map((a, i) => (
                  <li key={i} className="text-[13px] text-foreground/85 leading-snug pl-3 border-l border-amber-400/40">
                    {a.amount && <span className="font-black text-foreground">{a.amount} · </span>}
                    {a.text}
                    {a.due && <span className="text-amber-300/80 font-bold"> · {a.due}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted/35 mt-2">{dayLabel(e.date)}</p>
            </div>
          ))}
      </div>

      <p className="text-[10px] text-muted/35 mt-3">
        Last checked {ago(d.checked_at)} · watches AccKent emails from the last 60 days.
      </p>
    </div>
  );
}
