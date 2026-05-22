import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";

// Load env
try {
  readFileSync("/Volumes/MACBOOK_NVME/Mike&Payne Dropbox/Richard Payne/02_PERSONAL_BRAND/06_PAYNE-BOT/finance-hub/.env.local", "utf8")
    .split("\n").forEach(line => { const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim(); });
} catch {}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DOCS_DIR = "/Volumes/MACBOOK_NVME/Mike&Payne Dropbox/Richard Payne/02_PERSONAL_BRAND/06_PAYNE-BOT/finance-hub/My_Documents";

// Map filename → {category, year, storagePath}
const DOCS = [
  // VAT Returns
  { file: "VAT Return Jul 23.pdf",  category: "VAT Returns", year: "2023", path: "vat-returns/2023/VAT_Return_Jul_23.pdf" },
  { file: "VAT Return Oct 23.pdf",  category: "VAT Returns", year: "2023", path: "vat-returns/2023/VAT_Return_Oct_23.pdf" },
  { file: "VAT Return Jan 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Jan_24.pdf" },
  { file: "VAT Return Apr 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Apr_24.pdf" },
  { file: "VAT Return Jul 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Jul_24.pdf" },
  { file: "VAT Return Oct 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Oct_24.pdf" },
  { file: "VAT Return Jan 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Jan_25.pdf" },
  { file: "VAT Return Apr 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Apr_25.pdf" },
  { file: "VAT Return Jul 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Jul_25.pdf" },
  { file: "VAT Return Oct 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Oct_25.pdf" },
  { file: "VAT Return Jan 26.pdf",  category: "VAT Returns", year: "2026", path: "vat-returns/2026/VAT_Return_Jan_26.pdf" },
  { file: "VAT Return Apr 26.pdf",  category: "VAT Returns", year: "2026", path: "vat-returns/2026/VAT_Return_Apr_26.pdf" },
  // Clearance docs
  { file: "Clearance Info/RICHARD-PAYNE- Final CT600.pdf",   category: "CT600",              year: "2023", path: "ct600/RICHARD-PAYNE-Final-CT600.pdf" },
  { file: "Clearance Info/RICHARD-PAYNE - Final Accounts.pdf", category: "Statutory Accounts", year: "2023", path: "statutory-accounts/RICHARD-PAYNE-Final-Accounts.pdf" },
  { file: "Clearance Info/Final TB.pdf",                     category: "Trial Balance",       year: "2023", path: "trial-balance/Final-TB.pdf" },
  { file: "Clearance Info/VAT Cert..pdf",                    category: "Other",               year: null,   path: "other/VAT-Certificate.pdf" },
  // Self Assessment
  { file: "Tax/2024/PayneRichard_2024_Final Tax Return.pdf", category: "Self Assessment",    year: "2024", path: "self-assessment/2024/PayneRichard_2024_Final_Tax_Return.pdf" },
];

let uploaded = 0, skipped = 0, errors = 0;

for (const doc of DOCS) {
  const fullPath = join(DOCS_DIR, doc.file);
  if (!existsSync(fullPath)) {
    console.log(`  ⊘ not found  ${doc.file}`);
    skipped++;
    continue;
  }

  // Check if already in DB
  const { data: existing } = await sb.from("documents").select("id").eq("file_url", doc.path).maybeSingle();
  if (existing) {
    console.log(`  ⊘ skip  ${doc.file}`);
    skipped++;
    continue;
  }

  try {
    const buffer = readFileSync(fullPath);
    const { error: upErr } = await sb.storage.from("documents").upload(doc.path, buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await sb.from("documents").insert({
      category: doc.category,
      year: doc.year,
      filename: basename(doc.file),
      file_url: doc.path,
      notes: null,
    });
    if (insErr) throw new Error(insErr.message);

    console.log(`  ✓ ok    ${doc.file}`);
    uploaded++;
  } catch (err) {
    console.error(`  ✗ ERR   ${doc.file}: ${err.message}`);
    errors++;
  }
}

console.log(`\nDone — ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);
