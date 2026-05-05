// Uploads all Monzo bank statement PDFs from Desktop to Supabase Storage
// and inserts records into the documents table.
//
// Run AFTER db/003-documents-updates.sql has been applied:
//   node scripts/upload-statements.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
// Load .env.local manually (no dotenv dependency)
import { readFileSync as _readEnv } from "fs";
try {
  _readEnv(".env.local", "utf8").split("\n").forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const BASE   = "/Users/richardpayne/Desktop/Monthly statement";
const YEARS  = ["2023", "2024", "2025", "2026"];
const MONTHS = {
  January:1, February:2, March:3, April:4, May:5, June:6,
  July:7, August:8, September:9, October:10, November:11, December:12,
};

let uploaded = 0, skipped = 0, errors = 0;

for (const year of YEARS) {
  const dir = join(BASE, year, "PDF");
  const files = readdirSync(dir).filter(f => f.endsWith(".pdf")).sort();

  for (const filename of files) {
    const monthName = filename.replace(` ${year}.pdf`, "");
    const monthNum  = String(MONTHS[monthName] ?? 0).padStart(2, "0");
    const itemId    = `bank-statement-${year}-${monthNum}`;
    const storageKey = `statements/${year}/${filename.replace(/ /g, "_")}`;

    // Skip if already in documents table
    const { data: existing } = await supabase
      .from("documents")
      .select("id")
      .eq("checklist_item_id", itemId)
      .maybeSingle();

    if (existing) {
      console.log(`  ⊘ skip  ${filename}`);
      skipped++;
      continue;
    }

    try {
      const buffer = readFileSync(join(dir, filename));

      const { error: uploadErr } = await supabase
        .storage.from("documents")
        .upload(storageKey, buffer, { contentType: "application/pdf", upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      const { error: insertErr } = await supabase.from("documents").insert({
        category: "Bank Statement",
        year: year,
        filename,
        file_url: storageKey,
        checklist_item_id: itemId,
        notes: `Monzo Business Account — ${monthName} ${year}`,
      });

      if (insertErr) throw new Error(insertErr.message);

      console.log(`  ✓ ok    ${filename}`);
      uploaded++;
    } catch (err) {
      console.error(`  ✗ ERR   ${filename}: ${err.message}`);
      errors++;
    }
  }
}

console.log(`\nDone — ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);
