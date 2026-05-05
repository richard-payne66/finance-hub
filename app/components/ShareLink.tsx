"use client";

import { useEffect, useState } from "react";
import type { ShareToken } from "@/app/api/share/route";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ShareLink() {
  const [tokens,    setTokens]    = useState<ShareToken[]>([]);
  const [creating,  setCreating]  = useState(false);
  const [copied,    setCopied]    = useState<string | null>(null);
  const [revoking,  setRevoking]  = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/share").then((r) => r.json()).then(setTokens).catch(() => {});
  }, []);

  async function create() {
    setCreating(true);
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Gorilla Accounting" }),
    });
    const { token, expires_at } = await res.json();
    const newToken: ShareToken = {
      token,
      label: "Gorilla Accounting",
      created_at: new Date().toISOString(),
      expires_at,
    };
    setTokens((prev) => [newToken, ...prev]);
    setCreating(false);
  }

  async function revoke(token: string) {
    setRevoking(token);
    await fetch("/api/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setTokens((prev) => prev.filter((t) => t.token !== token));
    setRevoking(null);
  }

  function shareUrl(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(shareUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
            Share with Accountant
          </p>
          <p className="text-[10px] text-muted/50 mt-0.5">
            Read-only link · expires in 30 days · revoke any time
          </p>
        </div>
        <button
          onClick={create}
          disabled={creating}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {creating ? "Generating…" : "New link"}
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="border border-dashed border-white/8 rounded-xl p-6 text-center">
          <p className="text-[9px] text-muted/40 uppercase tracking-widest font-bold">
            No active links — generate one to share documents
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-white/8 rounded-xl divide-y divide-white/6">
          {tokens.map((t) => (
            <div key={t.token} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground">{t.label}</p>
                <p className="text-[10px] text-muted/50 font-mono truncate mt-0.5">
                  /share/{t.token.slice(0, 12)}…
                </p>
                <p className="text-[9px] text-muted/40 mt-0.5">Expires {fmtDate(t.expires_at)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(t.token)}
                  className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
                >
                  {copied === t.token ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => revoke(t.token)}
                  disabled={revoking === t.token}
                  className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-red-500/20 text-red-400/60 hover:border-red-500/40 hover:text-red-400 transition-all disabled:opacity-40"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
