"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-tight text-foreground mb-1">
            FINANCE HUB
          </h1>
          <p className="text-xs text-muted/50 uppercase tracking-widest">
            Richard Payne LTD
          </p>
        </div>

        {sent ? (
          <div className="bg-surface border border-white/8 rounded-xl p-6 text-center">
            <p className="text-2xl mb-3">📬</p>
            <p className="text-sm font-bold text-foreground mb-1">Check your email</p>
            <p className="text-xs text-muted/60">
              Magic link sent to <span className="text-foreground">{email}</span>
              <br />
              Click it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-surface border border-white/8 rounded-xl p-6 flex flex-col gap-4">
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-2">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-surface-light border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted/30 focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {error && (
              <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                ⚠ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full px-4 py-2.5 rounded-full bg-primary text-background text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
