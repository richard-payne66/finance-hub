// FreeAgent category sync + cache.
// We keep a Supabase cache and refresh it lazily (every 24h) so we don't
// hit FA's /categories endpoint on every transaction we classify.
//
// FA ships ~110 categories total but most are balance-sheet entries
// (depreciation, suspense account, prepayments) you'd never categorise
// a real receipt to. `receiptRelevant()` below is the filter used by
// the receipt editor + auto-categorise picker.

import { db } from "@/app/lib/db";
import { api as faApi } from "@/app/lib/freeagent";

export type FaCategory = {
  url: string;
  description: string;
  group_description?: string;
  nominal_code?: string;
  allowable_for_tax?: boolean;
  tax_reporting_name?: string;
  auto_sales_tax_rate?: string;
};

type CategoriesResponse = {
  admin_expenses_categories?: FaCategory[];
  cost_of_sales_categories?: FaCategory[];
  general_categories?: FaCategory[];
  income_categories?: FaCategory[];
};

const KV_KEY = "fa_categories_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type Cache = { fetched_at: string; categories: FaCategory[] };

async function fetchFromFA(): Promise<FaCategory[]> {
  const res = await faApi<CategoriesResponse>("/categories");
  return [
    ...(res.admin_expenses_categories ?? []),
    ...(res.cost_of_sales_categories ?? []),
    ...(res.general_categories ?? []),
    ...(res.income_categories ?? []),
  ];
}

export async function getCategories(force = false): Promise<FaCategory[]> {
  if (!force) {
    const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    if (data) {
      try {
        const cache = JSON.parse(data.value) as Cache;
        const age = Date.now() - new Date(cache.fetched_at).getTime();
        if (age < CACHE_TTL_MS && cache.categories.length > 0) {
          return cache.categories;
        }
      } catch {}
    }
  }

  const fresh = await fetchFromFA();
  const cache: Cache = { fetched_at: new Date().toISOString(), categories: fresh };
  await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(cache) });
  return fresh;
}

export async function findCategoryByUrl(url: string): Promise<FaCategory | null> {
  const cats = await getCategories();
  return cats.find((c) => c.url === url) ?? null;
}

// ── Filter to "categories a receipt actually goes against" ────────────────────
//
// Two rules combined:
//
//   1. Only keep "Admin expenses…" and "Cost of sales…" group_descriptions.
//      Strips balance-sheet items, payroll, capital asset accounts,
//      suspense/contra accounts, and income lines.
//
//   2. Strike specific descriptions that don't apply to a sole-director
//      WFH film/animation Ltd: no rent (WFH), no staff entertaining
//      (no staff), no formation costs (one-time done), no childcare
//      scheme, no leases yet (revisit at EV), wrong pension types,
//      no sales commissions.
//
// To bring the full FA list back temporarily, use `?all=true` on
// /api/categories.

const KEEP_GROUP_PREFIXES = ["Admin expenses", "Cost of sales"];

const RECEIPT_IRRELEVANT_DESCRIPTIONS = new Set<string>([
  "Charitable Donations",  // tiny (~£11/yr); accountant handles separately
  "Childcare Vouchers",    // not enrolled
  "Commission Paid",       // no sales commissions
  "Cost of Sales",         // generic — use the specific cost-of-sales lines
  "Formation Costs",       // one-off at company creation, done
  "Interest Payable",      // no business loans
  "Leasing Payments",      // no leases (revisit when EV happens)
  "Pension (Annuity)",     // wrong pension type
  "Pension (Personal/Stakeholder)", // director uses Directors' Staff Pensions
  "Rent",                  // WFH, no commercial rent
  "Staff Entertaining",    // no staff — use Business Entertaining
  "Unrealized Currency Exchange Gain/Loss", // accountant-level, not a receipt
  "VAT Penalty",           // rare; accountant handles
  "PAYE/NI Penalty",       // rare; accountant handles
]);

export function receiptRelevant(c: FaCategory): boolean {
  const group = c.group_description ?? "";
  if (!KEEP_GROUP_PREFIXES.some((p) => group.startsWith(p))) return false;
  if (RECEIPT_IRRELEVANT_DESCRIPTIONS.has(c.description)) return false;
  return true;
}
