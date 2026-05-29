"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// Where Supabase password-recovery links land. By the time we hit this
// page the recovery code has already been exchanged for a session in
// /auth/callback, so we just need to ask the user for a new password
// and call supabase.auth.updateUser({ password }).
//
// Also works as a general "change password" page for any logged-in user.

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function supabase() {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase().auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      window.location.href = "/";
      router.push("/");
    }, 1200);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-tight text-foreground mb-1">
            SET PASSWORD
          </h1>
          <p className="text-xs text-muted/50 uppercase tracking-widest">
            Finance Hub
          </p>
        </div>

        {done ? (
          <div className="bg-surface border border-white/8 rounded-xl p-6 text-center">
            <p className="text-2xl mb-3">✓</p>
            <p className="text-sm font-bold text-foreground mb-1">Password saved</p>
            <p className="text-xs text-muted/60">Taking you home…</p>
          </div>
        ) : (
          <form onSubmit={save} className="bg-surface border border-white/8 rounded-xl p-6 flex flex-col gap-4">
            <p className="text-[11px] text-muted/70 leading-relaxed">
              Set a new password for your account. You&apos;ll use this to
              sign in from now on.
            </p>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-2">
                New password
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-surface-light border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted/30 focus:outline-none focus:border-primary transition-colors"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-2">
                Confirm
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Same again"
                className="w-full bg-surface-light border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted/30 focus:outline-none focus:border-primary transition-colors"
                style={{ fontSize: "16px" }}
              />
            </div>

            {error && (
              <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                ⚠ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !password || !confirm}
              className="w-full px-4 py-2.5 rounded-full bg-primary text-background text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
