// One-off: seed learned vendor rules from the Monzo export analysis.
// - Only tier="safe" proposals.
// - Resolves FA category name -> url from the cached FA categories.
// - Skips vendor keys that already have a (user-confirmed) rule.
// - Deletes the known-bad "sq" rule (Square processor prefix collision).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const kvGet = async (k) => {
  const { data } = await db.from("kv").select("value").eq("key", k).maybeSingle();
  return data ? JSON.parse(data.value) : null;
};
const kvSet = (k, v) => db.from("kv").upsert({ key: k, value: JSON.stringify(v) });

const APPLY = process.argv.includes("--apply");
const proposals = JSON.parse(readFileSync("/tmp/proposed_rules.json", "utf8")).filter((p) => p.tier === "safe");

const catsCache = await kvGet("fa_categories_cache");
const nameToUrl = new Map((catsCache?.categories ?? []).map((c) => [c.description, c.url]));
const rules = (await kvGet("category_rules")) ?? [];
const existing = new Set(rules.map((r) => r.vendor));
const now = new Date().toISOString();

let added = 0, skippedExisting = 0, unresolved = [];
const seen = new Set();
for (const p of proposals) {
  if (seen.has(p.vendor)) continue;          // dedupe within proposals
  seen.add(p.vendor);
  if (existing.has(p.vendor)) { skippedExisting++; continue; }
  const url = nameToUrl.get(p.fa_category);
  if (!url) { unresolved.push(`${p.display_name} -> ${p.fa_category}`); continue; }
  rules.push({
    vendor: p.vendor,
    raw_pattern: (p.sample_desc || p.display_name).slice(0, 30),
    category_url: url,
    category_name: p.fa_category,
    hits: 1,
    last_used: now,
    created_at: now,
    source: "monzo_seed",
  });
  added++;
}

// Drop the known-bad Square-prefix rule.
const before = rules.length;
let cleaned = rules.filter((r) => r.vendor !== "sq");
const removedSq = before - cleaned.length;

cleaned.sort((a, b) => (b.last_used || "").localeCompare(a.last_used || ""));
cleaned = cleaned.slice(0, 200);

console.log(`Proposals (safe, deduped): ${seen.size}`);
console.log(`  would ADD new:        ${added}`);
console.log(`  skip (already exist): ${skippedExisting}`);
console.log(`  removed bad 'sq' rule: ${removedSq}`);
if (unresolved.length) console.log(`  UNRESOLVED categories:`, unresolved);
console.log(`  total rules after:    ${cleaned.length}`);

if (APPLY) {
  await kvSet("category_rules", cleaned);
  console.log("\n✅ WRITTEN to category_rules.");
} else {
  console.log("\n(dry run — re-run with --apply to write)");
}
