"use client";

import { useEffect, useState } from "react";

type MigrationFile = {
  filename: string;
  applied: boolean;
  appliedAt: string | null;
};

type Status = {
  migrations: MigrationFile[];
  pending: string[];
  tableExists: boolean;
};

type RunResult = { filename: string; ok: boolean; error?: string };

export default function MigrationsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[] | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/migrations");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
      }
      setStatus(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function runPending() {
    setRunning(true);
    setErr(null);
    setResults(null);
    try {
      const res = await fetch("/api/migrations", { method: "POST" });
      const j = await res.json();
      setResults(j.results ?? []);
      if (!res.ok) {
        setErr(j.detail ?? j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const pending = status?.pending ?? [];
  const applied = status?.migrations.filter((m) => m.applied) ?? [];

  return (
    <section className="bg-surface border border-white/8 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted/60">
            Database migrations
          </p>
          <p className="text-[12px] text-muted/60 mt-0.5 leading-relaxed">
            Detects un-run SQL files in <span className="font-mono">db/</span> and runs them with one click.
          </p>
        </div>
        <button
          onClick={runPending}
          disabled={running || loading || pending.length === 0}
          className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-primary text-background hover:bg-primary/90 disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          {running
            ? "Running…"
            : pending.length === 0
            ? "All applied ✓"
            : `Run ${pending.length} pending`}
        </button>
      </div>

      {loading && <p className="text-[11px] text-muted/50">Loading…</p>}

      {!loading && status && !status.tableExists && (
        <div className="mb-3 px-3 py-2 bg-yellow-500/8 border border-yellow-500/20 rounded-lg">
          <p className="text-[11px] text-yellow-300 leading-relaxed">
            The <span className="font-mono">schema_migrations</span> tracking table doesn&apos;t exist yet.
            Run migration 005 once manually in Supabase SQL Editor (see <span className="font-mono">db/005-migrations-tracking.sql</span>),
            then this panel takes over for everything future.
          </p>
        </div>
      )}

      {err && (
        <div className="mb-3 px-3 py-2 bg-red-500/8 border border-red-500/20 rounded-lg">
          <p className="text-[11px] text-red-400 font-mono break-words">{err}</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {results.map((r) => (
            <div
              key={r.filename}
              className={
                "px-3 py-2 rounded-lg border text-[11px] " +
                (r.ok
                  ? "bg-primary/8 border-primary/20 text-primary"
                  : "bg-red-500/8 border-red-500/20 text-red-300")
              }
            >
              <span className="font-mono">{r.filename}</span>{" "}
              {r.ok ? "✓ applied" : `✗ ${r.error?.slice(0, 200) ?? ""}`}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {pending.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted/50 mb-1.5 mt-2">
              Pending
            </p>
            {pending.map((f) => (
              <div key={f} className="text-[12px] font-mono text-yellow-300/90 pl-2 py-0.5">
                · {f}
              </div>
            ))}
          </div>
        )}
        {applied.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted/50 mb-1.5 mt-2">
              Applied
            </p>
            {applied.map((m) => (
              <div
                key={m.filename}
                className="text-[12px] font-mono text-muted/50 pl-2 py-0.5"
              >
                <span className="text-primary/70">✓</span> {m.filename}
                {m.appliedAt && (
                  <span className="text-muted/30 ml-2">
                    {new Date(m.appliedAt).toLocaleDateString("en-GB")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
