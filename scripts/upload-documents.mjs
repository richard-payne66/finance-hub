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
  // VAT Returns (now under VAT/ subfolder)
  { file: "VAT/VAT Return Jul 23.pdf",  category: "VAT Returns", year: "2023", path: "vat-returns/2023/VAT_Return_Jul_23.pdf" },
  { file: "VAT/VAT Return Oct 23.pdf",  category: "VAT Returns", year: "2023", path: "vat-returns/2023/VAT_Return_Oct_23.pdf" },
  { file: "VAT/VAT Return Jan 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Jan_24.pdf" },
  { file: "VAT/VAT Return Apr 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Apr_24.pdf" },
  { file: "VAT/VAT Return Jul 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Jul_24.pdf" },
  { file: "VAT/VAT Return Oct 24.pdf",  category: "VAT Returns", year: "2024", path: "vat-returns/2024/VAT_Return_Oct_24.pdf" },
  { file: "VAT/VAT Return Jan 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Jan_25.pdf" },
  { file: "VAT/VAT Return Apr 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Apr_25.pdf" },
  { file: "VAT/VAT Return Jul 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Jul_25.pdf" },
  { file: "VAT/VAT Return Oct 25.pdf",  category: "VAT Returns", year: "2025", path: "vat-returns/2025/VAT_Return_Oct_25.pdf" },
  { file: "VAT/VAT Return Jan 26.pdf",  category: "VAT Returns", year: "2026", path: "vat-returns/2026/VAT_Return_Jan_26.pdf" },
  { file: "VAT/VAT Return Apr 26.pdf",  category: "VAT Returns", year: "2026", path: "vat-returns/2026/VAT_Return_Apr_26.pdf" },
  // Clearance docs
  { file: "Clearance Info/RICHARD-PAYNE- Final CT600.pdf",   category: "CT600",              year: "2023", path: "ct600/RICHARD-PAYNE-Final-CT600.pdf" },
  { file: "Clearance Info/RICHARD-PAYNE - Final Accounts.pdf", category: "Statutory Accounts", year: "2023", path: "statutory-accounts/RICHARD-PAYNE-Final-Accounts.pdf" },
  { file: "Clearance Info/Final TB.pdf",                     category: "Trial Balance",       year: "2023", path: "trial-balance/Final-TB.pdf" },
  { file: "Clearance Info/VAT Cert..pdf",                    category: "Other",               year: null,   path: "other/VAT-Certificate.pdf" },
  // Self Assessment
  { file: "Tax/2024/PayneRichard_2024_Final Tax Return.pdf", category: "Self Assessment",    year: "2024", path: "self-assessment/2024/PayneRichard_2024_Final_Tax_Return.pdf" },
  // P60s (already uploaded — old paths kept for skip detection)
  { file: "P60/P60_2025-26.pdf", category: "P60", year: "2026", path: "p60/2026/P60_2025-26.pdf" },
  { file: "P60/P60_2024-25.pdf", category: "P60", year: "2025", path: "p60/2025/P60_2024-25.pdf" },
  { file: "P60/P60_2023-24.pdf", category: "P60", year: "2024", path: "p60/2024/P60_2023-24.pdf" },
  // P60 2022/23 — HMRC equivalent (FreeAgent didn't run payroll that year)
  { file: "P60/P60_2022-23_HMRC_PAYE_record.pdf", category: "P60", year: "2023", path: "p60/2023/P60_2022-23_HMRC_equivalent.pdf" },

  // Statutory Accounts (Companies House filed)
  { file: "Statutory_Accounts/2022-23_FY_to_30Apr2023.pdf", category: "Statutory Accounts", year: "2023", path: "statutory-accounts/2023/Accounts_2022-23.pdf" },
  { file: "Statutory_Accounts/2023-24_FY_to_30Apr2024.pdf", category: "Statutory Accounts", year: "2024", path: "statutory-accounts/2024/Accounts_2023-24.pdf" },
  { file: "Statutory_Accounts/2024-25_FY_to_30Apr2025.pdf", category: "Statutory Accounts", year: "2025", path: "statutory-accounts/2025/Accounts_2024-25.pdf" },
  // Older Statutory Accounts (informational — not on checklist but uploaded for completeness)
  { file: "Statutory_Accounts/2019-20_FY_to_30Apr2020.pdf", category: "Statutory Accounts", year: "2020", path: "statutory-accounts/2020/Accounts_2019-20.pdf" },
  { file: "Statutory_Accounts/2020-21_FY_to_30Apr2021.pdf", category: "Statutory Accounts", year: "2021", path: "statutory-accounts/2021/Accounts_2020-21.pdf" },
  { file: "Statutory_Accounts/2021-22_FY_to_30Apr2022.pdf", category: "Statutory Accounts", year: "2022", path: "statutory-accounts/2022/Accounts_2021-22.pdf" },

  // CT600
  { file: "CT600/CT600_2024-25_Final.pdf", category: "CT600", year: "2025", path: "ct600/2025/CT600_2024-25.pdf" },

  // Self Assessment
  { file: "Self_Assessment/SA_2024-25_SA100.pdf", category: "Self Assessment", year: "2025", path: "self-assessment/2025/SA100_2024-25.pdf" },

  // Trial Balance
  { file: "Trial_Balance/TB_2022-23.pdf", category: "Trial Balance", year: "2023", path: "trial-balance/2023/TB_2022-23.pdf" },
  { file: "Trial_Balance/TB_2023-24.pdf", category: "Trial Balance", year: "2024", path: "trial-balance/2024/TB_2023-24.pdf" },
  { file: "Trial_Balance/TB_2024-25.pdf", category: "Trial Balance", year: "2025", path: "trial-balance/2025/TB_2024-25.pdf" },
  { file: "Trial_Balance/TB_2025-26_in_progress.pdf", category: "Trial Balance", year: "2026", path: "trial-balance/2026/TB_2025-26_in_progress.pdf" },

  // Company Formation (manual checklist items — checklist_item_id)
  { file: "Companies_House/Certificate_of_Incorporation_2019-04-18.pdf", category: "Other", year: null, path: "company-formation/Certificate_of_Incorporation.pdf", checklistItemId: "doc-incorporation" },
  { file: "Companies_House/Confirmation_Statements/CS01_2026-05-05_LATEST.pdf", category: "Other", year: "2026", path: "company-formation/Confirmation_Statement_2026-05-05.pdf", checklistItemId: "doc-confirmation" },
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
      checklist_item_id: doc.checklistItemId ?? null,
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
