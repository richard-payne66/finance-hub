import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

readFileSync("./.env.local", "utf8").split("\n").forEach((l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim(); });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const { data: tok } = await sb.from("kv").select("value").eq("key", "freeagent_tokens").maybeSingle();
const tokens = JSON.parse(tok.value);
const H = { Authorization: "Bearer " + tokens.access_token, Accept: "application/json" };
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log("Loading categories...");
const cats = await fetch("https://api.freeagent.com/v2/categories", {headers:H}).then(r=>r.json());
const allCats = [...cats.admin_expenses_categories||[], ...cats.cost_of_sales_categories||[], ...cats.general_categories||[], ...cats.income_categories||[]];
const catSummary = allCats.map(c => ({url:c.url, description:c.description, group:c.group_description, allowable_for_tax:c.allowable_for_tax, tax_reporting_name:c.tax_reporting_name}));

console.log("Loading past examples...");
const ex = await fetch("https://api.freeagent.com/v2/bank_transaction_explanations?bank_account=https%3A%2F%2Fapi.freeagent.com%2Fv2%2Fbank_accounts%2F1262614&per_page=30", {headers:H}).then(r=>r.json());
const catLookup = new Map(allCats.map(c=>[c.url,c.description]));
const pastExamples = (ex.bank_transaction_explanations||[]).filter(e=>e.category).slice(0,30).map(e=>({desc:e.description||e.transaction_description||"", amount:parseFloat(e.gross_value||"0"), category:catLookup.get(e.category)||"?"}));

console.log("Loading uncategorised transactions...");
const allTxns = [];
let page = 1;
while (page <= 5) {
  const r = await fetch(`https://api.freeagent.com/v2/bank_transactions?bank_account=https%3A%2F%2Fapi.freeagent.com%2Fv2%2Fbank_accounts%2F1262614&view=marked_for_review&per_page=50&page=${page}`, {headers:H}).then(r=>r.json());
  const t = r.bank_transactions || [];
  allTxns.push(...t);
  if (t.length < 50) break;
  page++;
}
console.log("Found", allTxns.length, "uncategorised transactions");

const SYSTEM = `You are a senior UK bookkeeper for a sole-director limited company doing film/animation production. Classify each transaction into the most tax-efficient legitimate UK Corp Tax category from the provided list.

KEY RULES:
- Prefer Computer Equipment / Office Equipment for hardware (AIA 100% relief)
- Software for SaaS/subscriptions (Adobe, GitHub, hosting)
- Subscriptions for professional bodies / trade pubs
- Subsistence ONLY for meals during business travel
- Travel for trains/flights/taxis on business
- Training for courses/conferences/books
- Reject Entertainment (client entertainment NOT deductible)
- Set is_personal_likely=true ONLY if it clearly looks personal (Netflix, gym, groceries, family gifts). DO NOT flag ambiguous business expenses as personal — just lower the confidence.

OUTPUT: JSON only. {category_url, confidence (0-1), reasoning, tax_note (or null), is_personal_likely (bool)}`;

const entries = [];
let i = 0;
for (const txn of allTxns) {
  i++;
  const amount = parseFloat(txn.amount);
  const desc = txn.full_description || txn.description;
  process.stdout.write(`  ${i}/${allTxns.length} ${desc.slice(0,50)}... `);

  try {
    const r = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: [
        { type: "text", text: SYSTEM },
        { type: "text", text: "CATEGORIES:\n" + JSON.stringify(catSummary, null, 1) + "\n\nPAST USER CATEGORISATIONS:\n" + JSON.stringify(pastExamples, null, 1), cache_control: {type:"ephemeral"} },
      ],
      messages: [{ role: "user", content: `Transaction: "${desc}", amount £${Math.abs(amount)} (${amount<0?"OUT":"IN"}), date ${txn.dated_on}. Return JSON.` }],
    });
    const text = r.content.filter(c=>c.type==="text").map(c=>c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON");
    const p = JSON.parse(m[0]);
    const cat = p.category_url ? allCats.find(c=>c.url===p.category_url) : null;
    let action;
    if (p.is_personal_likely) action = "skipped_personal";
    else if (p.confidence >= 0.85) action = "auto_applied"; // logged only, not actually pushed (dry run)
    else action = "queued_for_review";

    entries.push({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      bank_transaction_url: txn.url,
      txn_description: desc,
      txn_amount: amount,
      txn_date: txn.dated_on,
      category_url: p.category_url || null,
      category_name: cat?.description || null,
      confidence: p.confidence,
      reasoning: p.reasoning,
      tax_note: p.tax_note || null,
      action,
      fa_explanation_url: null,
      error: null,
    });
    process.stdout.write(`${cat?.description||"?"} (${Math.round(p.confidence*100)}%) ${action==="auto_applied"?"✓":action==="queued_for_review"?"⊙":"~"}\n`);
  } catch (err) {
    entries.push({
      id: randomUUID(), created_at: new Date().toISOString(), bank_transaction_url: txn.url, txn_description: desc, txn_amount: amount, txn_date: txn.dated_on,
      category_url: null, category_name: null, confidence: 0, reasoning: "", tax_note: null, action: "error", fa_explanation_url: null, error: err.message,
    });
    process.stdout.write(`ERROR: ${err.message}\n`);
  }
}

// Save to kv audit log
const { data: existing } = await sb.from("kv").select("value").eq("key", "auto_categorisations_log").maybeSingle();
const prior = existing ? JSON.parse(existing.value) : [];
const merged = [...entries, ...prior].slice(0, 250);
await sb.from("kv").upsert({key: "auto_categorisations_log", value: JSON.stringify(merged)});

const summary = {
  total: entries.length,
  auto_applied: entries.filter(e=>e.action==="auto_applied").length,
  queued: entries.filter(e=>e.action==="queued_for_review").length,
  skipped: entries.filter(e=>e.action==="skipped_personal").length,
  errors: entries.filter(e=>e.action==="error").length,
};
console.log("\n\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
