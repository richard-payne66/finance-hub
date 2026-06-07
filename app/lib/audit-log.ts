// Lightweight audit log stored as a single kv row. Kept compact and
// FIFO-capped because we don't have CREATE TABLE permissions from the
// JS client.

import { db } from "@/app/lib/db";
import { mutateKvJson } from "@/app/lib/kv";

export const AUDIT_LOG_KEY = "auto_categorisations_log";
const KV_KEY = AUDIT_LOG_KEY;
export const AUDIT_MAX_ENTRIES = 500;
const MAX_ENTRIES = AUDIT_MAX_ENTRIES;

export type AuditAction = "auto_applied" | "queued_for_review" | "skipped_personal" | "error";

export type AuditEntry = {
  id: string;
  created_at: string;
  bank_transaction_url: string;
  txn_description: string;
  txn_amount: number;
  txn_date: string;
  category_url: string | null;
  category_name: string | null;
  confidence: number;
  reasoning: string;
  tax_note: string | null;
  action: AuditAction;
  fa_explanation_url: string | null;
  error: string | null;
};

export async function loadAuditLog(): Promise<AuditEntry[]> {
  const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
  if (!data) return [];
  try { return JSON.parse(data.value) as AuditEntry[]; } catch { return []; }
}

export async function appendAuditEntries(entries: AuditEntry[]): Promise<void> {
  await mutateKvJson<AuditEntry[]>(KV_KEY, (current) =>
    [...entries, ...(current ?? [])].slice(0, MAX_ENTRIES),
  );
}

// Replace a single entry (matched by id) against the CURRENT log, not a stale
// snapshot — so a concurrent writer's other changes survive. Used by the
// approve / correct / skip routes after they've done their FreeAgent write.
export async function replaceAuditEntry(updated: AuditEntry): Promise<void> {
  await mutateKvJson<AuditEntry[]>(KV_KEY, (current) => {
    const list = current ?? [];
    const i = list.findIndex((e) => e.id === updated.id);
    if (i < 0) return [updated, ...list].slice(0, MAX_ENTRIES);
    const next = list.slice();
    next[i] = updated;
    return next;
  });
}

export function summarise(entries: AuditEntry[], windowDays = 7): {
  total: number;
  auto_applied: number;
  queued: number;
  skipped: number;
  errors: number;
  cumulative_amount: number;
} {
  const cutoff = Date.now() - windowDays * 86400000;
  const recent = entries.filter((e) => new Date(e.created_at).getTime() >= cutoff);
  return {
    total: recent.length,
    auto_applied: recent.filter((e) => e.action === "auto_applied").length,
    queued: recent.filter((e) => e.action === "queued_for_review").length,
    skipped: recent.filter((e) => e.action === "skipped_personal").length,
    errors: recent.filter((e) => e.action === "error").length,
    cumulative_amount: recent
      .filter((e) => e.action === "auto_applied")
      .reduce((s, e) => s + Math.abs(e.txn_amount), 0),
  };
}
