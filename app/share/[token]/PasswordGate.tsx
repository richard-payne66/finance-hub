"use client";

import { useState } from "react";

export default function PasswordGate({ token, label }: { token: string; label: string }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/share/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? "Incorrect password.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-8 shadow-2xl"
      >
        <h1 className="text-lg font-black tracking-tight text-foreground mb-1">RICHARD PAYNE LTD</h1>
        <p className="text-[10px] text-muted/60 mb-6">Shared with: {label}</p>

        <label className="block text-[9px] text-muted uppercase tracking-widest font-bold mb-2">
          Password
        </label>
        <input
          type="password"
          autoFocus
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          disabled={busy}
          className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30 transition-colors disabled:opacity-40"
          placeholder="Enter the password Richard gave you"
        />

        {err && (
          <p className="text-[10px] text-red-400 mt-2 font-mono">{err}</p>
        )}

        <button
          type="submit"
          disabled={busy || pwd.length === 0}
          className="mt-5 w-full text-[10px] font-bold uppercase tracking-widest px-3 py-2.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {busy ? "Verifying…" : "Unlock"}
        </button>

        <p className="text-[9px] text-muted/30 mt-6 text-center">
          This link is private. Don&apos;t share the password.
        </p>
      </form>
    </main>
  );
}
