// Receipt duplicate detection.
//
// SHA256 of the file catches identical attachments only — but a real
// duplicate often arrives with different file metadata. FreeAgent
// notifies the user multiple times for one transaction (invoice +
// receipt + email body PDFs, all with different bytes but identical
// content). Without the semantic check, those land as N copies.
//
// Match rule: same supplier + same supply_date + same gross_total +
// same currency, in any non-rejected receipt in the DB.

import { db } from "@/app/lib/db";

export type DupeMatch = {
  receipt_id: string;
  status: string;
  created_at: string;
};

export async function findDuplicate(args: {
  supplier: string | null;
  supply_date: string | null;
  gross_total: number | null;
  currency: string | null;
  excludeId?: string;
}): Promise<DupeMatch | null> {
  const { supplier, supply_date, gross_total, currency, excludeId } = args;
  if (!supplier || !supply_date || gross_total == null) return null;

  let q = db()
    .from("receipts")
    .select("id, status, created_at")
    .eq("supplier", supplier)
    .eq("supply_date", supply_date)
    .eq("gross_total", gross_total)
    .neq("status", "rejected")
    .order("created_at", { ascending: true })
    .limit(1);

  if (currency) q = q.eq("currency", currency);
  if (excludeId) q = q.neq("id", excludeId);

  const { data } = await q;
  const row = data?.[0];
  return row ? { receipt_id: row.id, status: row.status, created_at: row.created_at } : null;
}
