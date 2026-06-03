import { db } from "@/app/lib/db";

// Simple dividend log stored in the kv table. This is the paperwork Richard
// was missing — a dated record + voucher for each dividend, which keeps the
// director's loan account from going overdrawn. NOT posted to FreeAgent (the
// accountant records the formal entry); this is the voucher + audit trail.

export type Dividend = {
  id: string;
  date: string;        // declaration / payment date (YYYY-MM-DD)
  amount: number;      // £
  note?: string;
  created_at: string;
};

const KEY = "dividend_log";

export async function loadDividends(): Promise<Dividend[]> {
  const { data } = await db().from("kv").select("value").eq("key", KEY).maybeSingle();
  if (!data) return [];
  try {
    const list = JSON.parse(data.value) as Dividend[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveDividends(list: Dividend[]): Promise<void> {
  await db().from("kv").upsert({ key: KEY, value: JSON.stringify(list) });
}

// UK tax year that a given date falls in (starts 6 April). Returns e.g. "2026/27".
export function taxYearOf(dateISO: string): string {
  const d = new Date(dateISO);
  const y = d.getFullYear();
  const beforeApr6 = d.getMonth() < 3 || (d.getMonth() === 3 && d.getDate() < 6);
  const start = beforeApr6 ? y - 1 : y;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}
