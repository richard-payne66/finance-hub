import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

readFileSync("./.env.local","utf8").split("\n").forEach(l=>{const m=l.match(/^([^#=]+)=(.*)$/);if(m)process.env[m[1].trim()]=m[2].trim()});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const {data: fa} = await sb.from('kv').select('value').eq('key','freeagent_tokens').single();
const faTok = JSON.parse(fa.value).access_token;
const FH = {Authorization: 'Bearer ' + faTok, Accept: 'application/json'};

// Pull FA primary account bank transactions for last 90 days
const banks = await fetch('https://api.freeagent.com/v2/bank_accounts', {headers:FH}).then(r=>r.json());
const primary = banks.bank_accounts.find(b => !b.is_personal && b.status === 'active' && b.is_primary);
console.log('Primary account:', primary?.name);

const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0,10);
const txns = [];
for (let p = 1; p <= 20; p++) {
  const r = await fetch(`https://api.freeagent.com/v2/bank_transactions?bank_account=${encodeURIComponent(primary.url)}&from_date=${cutoff}&per_page=50&page=${p}`, {headers:FH}).then(r=>r.json());
  const t = r.bank_transactions ?? [];
  txns.push(...t);
  if (t.length < 50) break;
}
console.log('FA transactions in 90d:', txns.length);

// Receipts in window
const {data: rec} = await sb.from('receipts').select('*').gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());
console.log('Receipts in 90d:', (rec||[]).length);

// Monzo tokens check
const {data: m} = await sb.from('kv').select('value').eq('key','monzo_tokens').maybeSingle();
console.log('Monzo connected:', !!m);
