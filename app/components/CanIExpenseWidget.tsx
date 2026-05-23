"use client";

import { useState } from "react";

type Answer = {
  verdict: "yes" | "maybe" | "no";
  category: string | null;
  tax_saving_estimate: string | null;
  why: string;
  caveat: string | null;
  use_business_card: boolean;
};

export default function CanIExpenseWidget() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await fetch("/api/can-i-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const j = await r.json();
      setAnswer(j);
    } catch {
      setAnswer({
        verdict: "maybe",
        category: null,
        tax_saving_estimate: null,
        why: "Network error, try again.",
        caveat: null,
        use_business_card: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const verdictColor = !answer ? "" :
    answer.verdict === "yes"   ? "border-emerald-500/30 bg-emerald-500/5" :
    answer.verdict === "no"    ? "border-rose-500/30 bg-rose-500/5" :
                                 "border-amber-500/30 bg-amber-500/5";
  const verdictBadge = !answer ? "" :
    answer.verdict === "yes"   ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" :
    answer.verdict === "no"    ? "bg-rose-500/15 text-rose-400 border-rose-500/40" :
                                 "bg-amber-500/15 text-amber-400 border-amber-500/40";

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5">
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-2">
        💭 Can I expense this?
      </p>
      <p className="text-[10px] text-muted/50 mb-3">
        Ask anything — &ldquo;a £250 monitor&rdquo;, &ldquo;dinner with a potential client&rdquo;
      </p>
      <form onSubmit={ask} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
          placeholder="e.g. a £49 plane ticket to Edinburgh for a shoot"
          className="flex-1 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-white/30 transition-colors disabled:opacity-40"
          style={{ fontSize: "16px" }}
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {answer && (
        <div className={`mt-4 border rounded-xl p-4 ${verdictColor}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${verdictBadge}`}>
              {answer.verdict === "yes" ? "✓ Yes" : answer.verdict === "no" ? "✗ No" : "~ Maybe"}
            </span>
            {answer.category && (
              <span className="text-[10px] text-muted/70">→ {answer.category}</span>
            )}
          </div>
          <p className="text-sm text-foreground leading-snug">{answer.why}</p>
          {answer.tax_saving_estimate && (
            <p className="text-[11px] text-emerald-400 mt-2 font-mono">
              💰 {answer.tax_saving_estimate}
            </p>
          )}
          {answer.caveat && (
            <p className="text-[11px] text-amber-400/80 mt-2 italic">
              ⚠ {answer.caveat}
            </p>
          )}
          {answer.use_business_card && answer.verdict !== "no" && (
            <p className="text-[10px] text-muted/50 mt-2">
              Use the business card so it appears in FreeAgent automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
