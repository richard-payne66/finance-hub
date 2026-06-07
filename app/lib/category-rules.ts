// Learned vendor → category rules.
// Each time the user confirms a category for a transaction (especially
// when they override Claude's suggestion), we store a normalised vendor
// fingerprint → category mapping. On future categorisation runs, the
// rule is checked BEFORE calling Claude — exact vendor match means we
// skip the Claude call entirely.

import { db } from "@/app/lib/db";
import { mutateKvJson } from "@/app/lib/kv";

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
const STOP_WORDS = new Set([
  // generic noise
  "the", "and", "ltd", "uk", "gbr", "usa", "irl", "com", "plc", "limited",
  "inc", "llc", "intl", "international", "co",
  // payment / banking noise
  "payment", "transfer", "ref", "reference", "direct", "debit", "dd",
  "card", "bank", "gbp", "eur", "usd", "from", "via", "bgc", "fpi", "fps",
  // payment-processor prefixes + status noise — these hijack the first token
  // (e.g. "SQ *MINCKA" → "mincka", "UBER * PENDING" → "uber"), and "sq" alone
  // would collide across every Square merchant.
  "sq", "sumup", "zettle", "izettle", "paypal", "pos", "pending", "www", "http", "https",
  // personal titles — so "MR PETER HERON" keys on "peter", not "mr"
  "mr", "mrs", "ms", "miss", "mx", "dr", "sir", "prof",
]);

export function vendorKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 .]/g, " ")
    .split(/[ .]+/)
    // keep words that are ≥2 chars, contain a letter (drop pure numbers/dates),
    // and aren't generic banking/title noise
    .filter((w) => w.length >= 2 && /[a-z]/.test(w) && !STOP_WORDS.has(w))
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
  const now = new Date().toISOString();

  // CAS read-modify-write so two corrections at once don't lose a rule.
  await mutateKvJson<CategoryRule[]>(KV_KEY, (current) => {
    const rules = (current ?? []).slice();
    const idx = rules.findIndex((r) => r.vendor === vendor);
    if (idx >= 0) {
      rules[idx] = {
        ...rules[idx],
        category_url: args.category_url,
        category_name: args.category_name,
        hits: rules[idx].hits + 1,
        last_used: now,
        raw_pattern: args.description.slice(0, 30),
      };
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
    return rules.slice(0, 200);
  });
}

// Forget the rule for a vendor — used when the user corrects an auto-filed
// transaction to "personal", so we don't keep mis-filing that vendor.
export async function removeRule(description: string): Promise<void> {
  const vendor = vendorKey(description);
  if (!vendor) return;
  await mutateKvJson<CategoryRule[]>(KV_KEY, (current) =>
    (current ?? []).filter((r) => r.vendor !== vendor),
  );
}

export async function lookupRule(description: string): Promise<CategoryRule | null> {
  const vendor = vendorKey(description);
  if (!vendor) return null;
  const rules = await loadRules();
  return rules.find((r) => r.vendor === vendor) ?? null;
}
