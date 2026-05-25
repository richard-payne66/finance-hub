"use client";

import { useEffect, useState } from "react";
import type { ShareToken } from "@/app/api/share/route";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type JustCreated = { token: string; label: string; password: string };

export default function ShareLink() {
  const [tokens,    setTokens]    = useState<ShareToken[]>([]);
  const [showForm,  setShowForm]  = useState(false);
  const [label,     setLabel]     = useState("Accountant");
  const [password,  setPassword]  = useState("");
  const [creating,  setCreating]  = useState(false);
  const [copied,    setCopied]    = useState<string | null>(null);
  const [revoking,  setRevoking]  = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<JustCreated | null>(null);

  useEffect(() => {
    fetch("/api/share").then((r) => r.json()).then(setTokens).catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, password: password || undefined }),
    });
    const { token, expires_at, protected: isProtected } = await res.json();
    const newToken: ShareToken = {
      token,
      label,
      created_at: new Date().toISOString(),
      expires_at,
      protected: !!isProtected,
    };
    setTokens((prev) => [newToken, ...prev]);
    setJustCreated({ token, label, password });
    setShowForm(false);
    setPassword("");
    setLabel("Accountant");
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
    if (justCreated?.token === token) setJustCreated(null);
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
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity"
          >
            New link
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showForm && (
        <form onSubmit={create} className="bg-surface border border-white/8 rounded-xl p-4 mb-3 flex flex-col gap-3">
          <div>
            <label className="block text-[9px] text-muted uppercase tracking-widest font-bold mb-1">
              Label (who's this for?)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={creating}
              className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30 transition-colors disabled:opacity-40"
              placeholder="e.g. Smith & Co Accountants"
            />
          </div>
          <div>
            <label className="block text-[9px] text-muted uppercase tracking-widest font-bold mb-1">
              Password (optional)
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={creating}
              className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-white/30 transition-colors disabled:opacity-40"
              placeholder="Leave blank for no password"
            />
            <p className="text-[9px] text-muted/40 mt-1">
              Share this password separately from the link (email vs text, etc.)
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setPassword(""); }}
              disabled={creating}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || label.trim().length === 0}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {creating ? "Creating…" : "Create link"}
            </button>
          </div>
        </form>
      )}

      {/* One-time password reveal after creation */}
      {justCreated && justCreated.password && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-3">
          <p className="text-[9px] text-primary uppercase tracking-widest font-bold mb-2">
            ✓ Link created — copy the password now
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-foreground">
              {justCreated.password}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(justCreated.password);
              }}
              className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
            >
              Copy
            </button>
            <button
              onClick={() => setJustCreated(null)}
              className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-full border border-white/10 text-muted hover:border-white/25 hover:text-foreground transition-all"
            >
              Dismiss
            </button>
          </div>
          <p className="text-[9px] text-muted/50 mt-2">
            You won&apos;t see this again. Send it to {justCreated.label} via a different channel than the link.
          </p>
        </div>
      )}

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
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-foreground">{t.label}</p>
                  {t.protected && (
                    <span className="text-[8px] font-bold uppercase tracking-widest text-primary/80 px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                      🔒 Password
                    </span>
                  )}
                </div>
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
