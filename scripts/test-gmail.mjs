import { readFileSync } from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

readFileSync("./.env.local","utf8").split("\n").forEach(l=>{const m=l.match(/^([^#=]+)=(.*)$/);if(m)process.env[m[1].trim()]=m[2].trim()});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data:g} = await sb.from('kv').select('value').eq('key','google_tokens').single();
const tok = JSON.parse(g.value).access_token;
const H = {Authorization: 'Bearer ' + tok};

// Just fetch the queue + 1 sample to confirm shape
const QUERY = '(to:receipts@richard-payne.com OR label:RECEIPTS) -label:Receipts-Processed has:attachment newer_than:30d';
const list = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(QUERY) + '&maxResults=5', {headers:H}).then(r=>r.json());

console.log('Pending count:', list.messages?.length ?? 0);

// Get first message detail
const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${list.messages[0].id}?format=full`, {headers:H}).then(r=>r.json());
const hdrs = Object.fromEntries(m.payload.headers.map(h => [h.name, h.value]));
console.log('First message:');
console.log('  From:    ', hdrs.From);
console.log('  Subject: ', hdrs.Subject);
console.log('  Date:    ', hdrs.Date);
console.log('  Labels:  ', m.labelIds.join(', '));

// Look for attachments
function findAttachments(part, acc = []) {
  if (part.body?.attachmentId && part.filename) acc.push({filename: part.filename, mime: part.mimeType, size: part.body.size});
  if (part.parts) for (const p of part.parts) findAttachments(p, acc);
  return acc;
}
const atts = findAttachments(m.payload);
console.log('  Attachments:', atts.map(a => `${a.filename} (${a.mime}, ${a.size}b)`).join(', ') || 'NONE');
