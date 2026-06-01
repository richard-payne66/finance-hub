// READ-ONLY. Compares FreeAgent's own auto-guessed categories against our
// seeded learned rules. No writes of any kind. Surfaces where FA's guess
// disagrees with what your supplier history says it should be.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const kvGet = async (k) => { const { data } = await sb.from("kv").select("value").eq("key", k).maybeSingle(); return data ? JSON.parse(data.value) : null; };

let tokens = await kvGet("freeagent_tokens");
if (tokens.expires_at - Date.now() < 60_000) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: env.FREEAGENT_CLIENT_ID, client_secret: env.FREEAGENT_CLIENT_SECRET });
  const r = await fetch("https://api.freeagent.com/v2/token_endpoint", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json(); tokens.access_token = j.access_token;
}
const FA = (p) => fetch(p.startsWith("http") ? p : `https://api.freeagent.com/v2${p}`, { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json", "User-Agent": "Finance Hub / Richard Payne LTD" } });

const STOP = new Set(["the","and","ltd","uk","gbr","usa","irl","com","plc","limited","inc","llc","intl","international","co","payment","transfer","ref","reference","direct","debit","dd","card","bank","gbp","eur","usd","from","via","bgc","fpi","fps","mr","mrs","ms","miss","mx","dr","sir","prof","sq","sumup","zettle","izettle","paypal","pos","pending","www","http","https"]);
const vendorKey = (d) => { if (!d) return ""; const t = String(d).toLowerCase().replace(/[^a-z0-9 .]/g, " ").split(/[ .]+/).filter((w) => w.length >= 2 && /[a-z]/.test(w) && !STOP.has(w)); return t[0] || ""; };

const catsCache = await kvGet("fa_categories_cache");
const catByUrl = new Map((catsCache?.categories ?? []).map((c) => [c.url, c.description]));
const rules = (await kvGet("category_rules")) ?? [];
const ruleByVendor = new Map(rules.map((r) => [r.vendor, r]));

const banks = (await FA("/bank_accounts").then((r) => r.json())).bank_accounts.filter((b) => !b.is_personal && b.status === "active");

// ---- PART 1: current review queue (marked_for_review) ----
const review = [];
for (const a of banks) {
  for (let p = 1; p <= 10; p++) {
    const res = await FA(`/bank_transactions?bank_account=${encodeURIComponent(a.url)}&view=marked_for_review&per_page=50&page=${p}`).then((r) => r.json());
    const t = res.bank_transactions || []; review.push(...t); if (t.length < 50) break;
  }
}

const disagree = [], agree = [], noOpinion = [];
for (const tx of review) {
  const full = (await FA(tx.url.replace("https://api.freeagent.com/v2", "")).then((r) => r.json())).bank_transaction;
  const desc = full.full_description || full.description || "";
  const exps = full.bank_transaction_explanations || [];
  const guess = exps.find((e) => e && typeof e === "object" && e.marked_for_review !== false) || exps[0];
  const faUrl = guess?.category;
  const faName = catByUrl.get(faUrl) || "(no guess)";
  const rule = ruleByVendor.get(vendorKey(desc));
  const row = { desc: desc.slice(0, 36), amount: parseFloat(full.amount), faName, faRule: guess?.guess_rule_name || "?", ourName: rule?.category_name || null };
  if (!rule) noOpinion.push(row);
  else if (rule.category_url === faUrl) agree.push(row);
  else disagree.push(row);
}

const GBP = (n) => "£" + Math.abs(n).toFixed(2);
console.log(`\n========== CURRENT REVIEW QUEUE (${review.length}) ==========`);
console.log(`Where we have a supplier rule: agree ${agree.length} · DISAGREE ${disagree.length} · no rule (can't judge) ${noOpinion.length}\n`);
if (disagree.length) {
  console.log("⚠️  FREEAGENT GUESSED DIFFERENTLY FROM YOUR HISTORY:");
  for (const r of disagree) console.log(`  ${r.desc.padEnd(36)} ${GBP(r.amount).padStart(10)}  FA: ${r.faName}  →  yours: ${r.ourName}`);
} else console.log("✓ No disagreements where we have a rule.");
console.log("\nFA guesses where we have NO rule to judge (FYI):");
for (const r of noOpinion.slice(0, 30)) console.log(`  ${r.desc.padEnd(36)} ${GBP(r.amount).padStart(10)}  FA: ${r.faName} [${r.faRule}]`);

// ---- PART 2: historical accuracy sample (recent confirmed/guessed explanations) ----
console.log(`\n\n========== HISTORICAL SAMPLE: FA category vs your rules ==========`);
let hAgree = 0, hDisagree = 0, hNo = 0; const hDis = [];
for (const a of banks) {
  const res = await FA(`/bank_transaction_explanations?bank_account=${encodeURIComponent(a.url)}&per_page=100`).then((r) => r.json());
  for (const ex of res.bank_transaction_explanations || []) {
    if (!ex.category) continue;
    const desc = ex.description || ex.transaction_description || "";
    const rule = ruleByVendor.get(vendorKey(desc));
    if (!rule) { hNo++; continue; }
    if (rule.category_url === ex.category) hAgree++;
    else { hDisagree++; if (hDis.length < 20) hDis.push({ desc: desc.slice(0, 36), fa: catByUrl.get(ex.category) || "?", ours: rule.category_name }); }
  }
}
const judged = hAgree + hDisagree;
console.log(`Of recent explanations we can judge (${judged}): FA matched your history ${hAgree} (${judged ? Math.round(100*hAgree/judged) : 0}%) · differed ${hDisagree}`);
console.log(`(plus ${hNo} we have no rule for)`);
if (hDis.length) { console.log("\nExamples where FA's historical category differs from your rule:"); for (const r of hDis) console.log(`  ${r.desc.padEnd(36)}  FA: ${r.fa}  →  yours: ${r.ours}`); }
