// Learned vendor → category rules.
// Each time the user confirms a category for a transaction (especially
// when they override Claude's suggestion), we store a normalised vendor
// fingerprint → category mapping. On future categorisation runs, the
// rule is checked BEFORE calling Claude — exact vendor match means we
// skip the Claude call entirely.

import { db } from "@/app/lib/db";

const KV_KEY = "category_rules";

export type CategoryRule = {
  vendor: string;          // normalised first word of description
  raw_pattern: string;     // first 30 chars of original description (for diagnostics)
  category_url: string;
  category_name: string;
  hits: number;            // number of times this rule has matched
  last_used: string;       // ISO
  created_at: string;
};

// Extract a stable vendor key from a bank txn description.
// Examples:
//   "AMAZON.CO.UK LONDON GBR/// £109" → "amazon"
//   "Apple.com/Bill CORK IRL" → "apple"
//   "TfL Travel Charge SW1H" → "tfl"
export function vendorKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 .]/g, " ")
    .split(/[ .]+/)
    .filter((w) => w.length >= 2 && !["the", "and", "ltd", "uk", "gbr", "usa", "irl", "com"].includes(w))
    .slice(0, 1)
    .join("")
    .trim();
}

export async function loadRules(): Promise<CategoryRule[]> {
  const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
  if (!data) return [];
  try { return JSON.parse(data.value) as CategoryRule[]; } catch { return []; }
}

export async function saveRules(rules: CategoryRule[]): Promise<void> {
  await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(rules) });
}

export async function upsertRule(args: {
  description: string;
  category_url: string;
  category_name: string;
}): Promise<void> {
  const vendor = vendorKey(args.description);
  if (!vendor) return;

  const rules = await loadRules();
  const idx = rules.findIndex((r) => r.vendor === vendor);
  const now = new Date().toISOString();

  if (idx >= 0) {
    rules[idx].category_url = args.category_url;
    rules[idx].category_name = args.category_name;
    rules[idx].hits += 1;
    rules[idx].last_used = now;
    rules[idx].raw_pattern = args.description.slice(0, 30);
  } else {
    rules.push({
      vendor,
      raw_pattern: args.description.slice(0, 30),
      category_url: args.category_url,
      category_name: args.category_name,
      hits: 1,
      last_used: now,
      created_at: now,
    });
  }

  // Cap at 200 most-recently-used rules
  rules.sort((a, b) => b.last_used.localeCompare(a.last_used));
  await saveRules(rules.slice(0, 200));
}

export async function lookupRule(description: string): Promise<CategoryRule | null> {
  const vendor = vendorKey(description);
  if (!vendor) return null;
  const rules = await loadRules();
  return rules.find((r) => r.vendor === vendor) ?? null;
}
