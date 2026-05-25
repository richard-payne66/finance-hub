import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// Load env
readFileSync("/Volumes/MACBOOK_NVME/Mike&Payne Dropbox/Richard Payne/02_PERSONAL_BRAND/06_PAYNE-BOT/finance-hub/.env.local", "utf8")
  .split("\n").forEach((l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim(); });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const { data } = await sb.from("kv").select("value").eq("key", "freeagent_tokens").maybeSingle();
const tokens = JSON.parse(data.value);
const H = { Authorization: "Bearer " + tokens.access_token, Accept: "application/json" };

const cats = await fetch("https://api.freeagent.com/v2/categories", {headers:H}).then(r=>r.json());
const allCats = [
  ...cats.admin_expenses_categories || [],
  ...cats.cost_of_sales_categories || [],
  ...cats.general_categories || [],
  ...cats.income_categories || [],
];

const txns = await fetch("https://api.freeagent.com/v2/bank_transactions?bank_account=https%3A%2F%2Fapi.freeagent.com%2Fv2%2Fbank_accounts%2F1262614&view=marked_for_review&per_page=3", {headers:H}).then(r=>r.json());

console.log("Loaded", allCats.length, "categories,", txns.bank_transactions?.length, "uncategorised txns");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const catSummary = allCats.map(c => ({url:c.url, description:c.description, group:c.group_description, allowable_for_tax:c.allowable_for_tax}));

const SYSTEM = `You are a senior UK bookkeeper. Classify each transaction into the most tax-efficient legitimate UK Corp Tax category. Output JSON only: {category_url, confidence (0-1), reasoning, tax_note, is_personal_likely}`;

for (const txn of txns.bank_transactions.slice(0, 3)) {
  const amount = parseFloat(txn.amount);
  const desc = txn.full_description ?? txn.description;
  console.log("\n=== " + desc + " (£" + amount + ") ===");

  const r = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: "CATEGORIES:\n" + JSON.stringify(catSummary, null, 1), cache_control: {type:"ephemeral"} },
    ],
    messages: [{ role: "user", content: `Transaction: "${desc}", amount £${Math.abs(amount)} (${amount<0?"OUT":"IN"}), date ${txn.dated_on}. Return JSON.` }],
  });

  const text = r.content.filter(c=>c.type==="text").map(c=>c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : null;
  if (parsed) {
    const cat = allCats.find(c => c.url === parsed.category_url);
    console.log("  →", cat?.description ?? "?", "(" + Math.round(parsed.confidence*100) + "%)");
    console.log("  reasoning:", parsed.reasoning);
    if (parsed.tax_note) console.log("  tax:", parsed.tax_note);
    if (parsed.is_personal_likely) console.log("  ⚠️  flagged as likely personal");
  }
}
