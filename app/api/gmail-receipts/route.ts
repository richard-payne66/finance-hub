import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/app/lib/db";
import {
  isConnected,
  searchMessages,
  getMessage,
  getAttachment,
  api as googleApi,
  headerValue,
  extractBodyText,
  type GmailFullMessage,
  type GmailPart,
} from "@/app/lib/google";
import { extractReceipt } from "@/app/lib/claude-extract";
import { api as faApi, isConnected as faIsConnected, loadTokens as faLoadTokens } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 300;

// Polls Gmail for any unread receipt — either:
//   - addressed to receipts@richard-payne.com
//   - labelled RECEIPTS by the user
// For each: extract attachments, run through Claude's receipt extractor,
// store in Supabase, mark message processed (apply 'Receipts/Processed' label).
//
// Dedupe by Gmail Message-ID stored in receipts.source_ref.

// Broader inbox scan.
//
// Catches anything that looks like a *purchase made by the company* —
// not just emails forwarded to receipts@. Subject must hint at receipts,
// invoices, orders, purchases, payments; OR be on the existing receipts@
// / RECEIPTS-label channels.
//
// Outgoing invoices Richard sent to clients are excluded with `-from:`
// rules covering both the @richard-payne.com domain and the personal
// info@ alias — both end up in the inbox as "sent" copies otherwise.
//
// `has:attachment` keeps us out of order-confirmation noise that doesn't
// include the actual receipt PDF.
// Default scan: last 30 days, skipping anything already labelled Receipts-
// Processed. Rescan mode (?days=N&force=true) lets the user manually
// re-check a smaller window without the "already processed" filter — the
// per-file SHA256 dedup still stops it creating duplicates.
function buildQuery({ days = 30, includeProcessed = false }: { days?: number; includeProcessed?: boolean } = {}): string {
  const parts: string[] = [
    "(",
    "  to:receipts@richard-payne.com",
    "  OR label:RECEIPTS",
    "  OR subject:(receipt OR invoice OR \"order confirmation\" OR \"payment confirmation\" OR \"your purchase\")",
    ")",
    "has:attachment",
    "-from:richard-payne.com",
    "-from:info@richard-payne.com",
    "-from:no-reply@richard-payne.com",
  ];
  if (!includeProcessed) parts.push("-label:Receipts-Processed");
  parts.push(`newer_than:${days}d`);
  return parts.join(" ");
}

const QUERY = buildQuery();
const PROCESSED_LABEL_NAME = "Receipts-Processed";

// HEIC/HEIF excluded — Claude needs jpeg/png/webp/pdf. Email-forwarded
// receipts are almost always one of those; HEIC mostly comes from iPhone
// camera roll which the user would use /capture for instead.
const ACCEPTABLE_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function flattenParts(part: GmailPart, acc: GmailPart[] = []): GmailPart[] {
  acc.push(part);
  if (part.parts) for (const p of part.parts) flattenParts(p, acc);
  return acc;
}

async function ensureProcessedLabel(): Promise<string> {
  type Label = { id: string; name: string };
  const list = await googleApi<{ labels: Label[] }>("/users/me/labels");
  const found = list.labels.find((l) => l.name === PROCESSED_LABEL_NAME);
  if (found) return found.id;

  const created = await googleApi<Label>("/users/me/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: PROCESSED_LABEL_NAME, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return created.id;
}

async function markProcessed(messageId: string, labelId: string): Promise<void> {
  await googleApi(`/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
}

async function alreadyProcessed(messageId: string): Promise<boolean> {
  const { data } = await db()
    .from("receipts")
    .select("id")
    .eq("source_ref", `gmail:${messageId}`)
    .maybeSingle();
  return !!data;
}

type ProcessResult = {
  message_id: string;
  from: string;
  subject: string;
  attachments_processed: number;
  receipts_created: number;
  bank_matches: number;
  errors: string[];
};

// Match a receipt to a bank transaction by amount + date proximity.
// Returns the FA bank_transaction URL if found, else null.
async function findMatchingBankTxn(
  amount: number,
  supplyDateISO: string,
  supplier: string | null
): Promise<{ url: string; bank_account: string; description: string } | null> {
  if (!amount || !supplyDateISO) return null;
  if (!(await faIsConnected())) return null;

  try {
    // Window: ±7 days around supply date
    const target = new Date(supplyDateISO).getTime();
    const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string }> }>("/bank_accounts");
    const businessAccounts = banks.bank_accounts.filter((b) => !b.is_personal && b.status === "active");

    for (const acc of businessAccounts) {
      for (let page = 1; page <= 3; page++) {
        const r = await faApi<{ bank_transactions: Array<{ url: string; amount: string; dated_on: string; description: string; bank_account: string }> }>(
          `/bank_transactions?bank_account=${encodeURIComponent(acc.url)}&per_page=50&page=${page}`
        );
        const txns = r.bank_transactions ?? [];
        for (const t of txns) {
          const txnAmount = Math.abs(parseFloat(t.amount));
          const txnDate = new Date(t.dated_on).getTime();
          if (Math.abs(txnAmount - amount) > 0.01) continue;
          if (Math.abs(txnDate - target) > 7 * 86400000) continue;
          if (supplier) {
            const supKey = supplier.toLowerCase().split(/\s+/)[0];
            if (supKey && !t.description.toLowerCase().includes(supKey)) {
              // Allow loose match — only reject if supplier is given and totally absent
              // (fall through anyway: trust amount+date)
            }
          }
          return { url: t.url, bank_account: t.bank_account, description: t.description };
        }
        if (txns.length < 50) break;
        // Stop paging once we've gone past the target date window
        const last = txns[txns.length - 1];
        if (last && new Date(last.dated_on).getTime() < target - 14 * 86400000) break;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Attach a receipt PDF/image to a bank transaction in FA via attachments.
// Endpoint: POST /v2/attachments
async function attachToBankTxn(args: {
  bank_transaction_url: string;
  filename: string;
  contentBase64: string;
  contentType: string;
}): Promise<string | null> {
  const tokens = await faLoadTokens();
  if (!tokens) return null;
  try {
    const r = await fetch("https://api.freeagent.com/v2/attachments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        attachment: {
          data: args.contentBase64,
          file_name: args.filename,
          content_type: args.contentType,
          description: "Receipt auto-attached by Finance Hub",
          // 'attachable_url' style varies by FA endpoint; bank_transaction
          // attachments use /v2/bank_transaction_explanations attachment field.
          // Bare /v2/attachments may not link to bank txns directly — this
          // is best-effort. If unsupported, we leave the receipt in the
          // queue and surface it for manual linking.
          bank_transaction: args.bank_transaction_url,
        },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.attachment?.url ?? null;
  } catch {
    return null;
  }
}

async function processMessage(msg: GmailFullMessage, processedLabelId: string): Promise<ProcessResult> {
  const result: ProcessResult = {
    message_id: msg.id,
    from: headerValue(msg, "From") ?? "?",
    subject: headerValue(msg, "Subject") ?? "(no subject)",
    attachments_processed: 0,
    receipts_created: 0,
    bank_matches: 0,
    errors: [],
  };

  // Body may contain user instructions like "log this as Disney travel"
  const bodyText = extractBodyText(msg);
  const userNote = bodyText.length > 0 ? bodyText.slice(0, 1000) : null;

  // Find usable attachments
  const parts = flattenParts(msg.payload as unknown as GmailPart);
  const attachments = parts.filter(
    (p) => p.body.attachmentId && p.filename && ACCEPTABLE_MIME.has(p.mimeType)
  );

  if (attachments.length === 0) {
    result.errors.push("No usable attachment");
    // Still mark processed so we don't retry forever
    await markProcessed(msg.id, processedLabelId);
    return result;
  }

  for (const att of attachments) {
    try {
      const buffer = await getAttachment(msg.id, att.body.attachmentId!);
      result.attachments_processed++;

      // Hash for dedup
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const { data: existing } = await db().from("processed_files").select("receipt_id").eq("file_sha256", hash).maybeSingle();
      if (existing) {
        // Already captured via another path — just attach a note linking the email
        result.errors.push(`Duplicate (already captured): ${att.filename}`);
        continue;
      }

      // Upload to Supabase storage
      const safeName = (att.filename ?? "receipt").replace(/[^a-z0-9._-]/gi, "_");
      const storageKey = `gmail/${msg.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await db().storage.from("receipts").upload(storageKey, buffer, {
        contentType: att.mimeType,
        upsert: false,
      });
      if (upErr) {
        result.errors.push(`Storage: ${upErr.message}`);
        continue;
      }

      // Extract with Claude. process-receipt route caches categories;
      // here we just call extractReceipt directly.
      const claudeMime = att.mimeType === "application/pdf"
        ? "application/pdf"
        : (att.mimeType as "image/jpeg" | "image/png" | "image/webp");
      const categoriesJson = JSON.stringify([]); // not used for category suggestion in v1
      const extracted = await extractReceipt(buffer, claudeMime, categoriesJson);

      // Insert receipt row
      const noteCombined = [userNote, extracted.notes].filter(Boolean).join("\n\n") || null;
      const { error: insErr } = await db().from("receipts").insert({
        status: "pending",
        source: "email",
        source_ref: `gmail:${msg.id}`,
        file_sha256: hash,
        supplier: extracted.supplier,
        description: extracted.description,
        supply_date: extracted.supply_date,
        currency: extracted.currency,
        gross_total: extracted.gross_total,
        net_total: extracted.net_total,
        vat_total: extracted.vat_total,
        vat_rate: extracted.vat_rate,
        payment_method: extracted.payment_method,
        category_url: extracted.suggested_freeagent_category_url,
        category_name: extracted.suggested_freeagent_category_name,
        line_items: extracted.line_items,
        is_business_card: extracted.is_business_card,
        model_confidence: extracted.model_confidence,
        low_confidence_fields: extracted.low_confidence_fields,
        extracted_json: extracted,
        receipt_image_url: storageKey,
        notes: noteCombined,
      });

      if (insErr) {
        result.errors.push(`DB: ${insErr.message}`);
        continue;
      }

      await db().from("processed_files").insert({ file_sha256: hash, receipt_id: null });
      result.receipts_created++;

      // Cross-reference: find a matching bank transaction and attach
      if (extracted.gross_total && extracted.supply_date) {
        const match = await findMatchingBankTxn(
          extracted.gross_total,
          extracted.supply_date,
          extracted.supplier
        );
        if (match) {
          const attached = await attachToBankTxn({
            bank_transaction_url: match.url,
            filename: safeName,
            contentBase64: buffer.toString("base64"),
            contentType: att.mimeType,
          });
          if (attached) {
            result.bank_matches++;
          } else {
            result.errors.push(`Matched bank txn but couldn't attach`);
          }
        }
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Mark the message as processed so we don't re-fetch it
  try {
    await markProcessed(msg.id, processedLabelId);
  } catch (err) {
    result.errors.push(`label apply: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

// GET — diagnostic; returns the search query and how many would be picked up,
// plus the last cron-run summary so the dashboard panel can show
// "last checked Fri 24 May · 0 new".
export async function GET() {
  try {
    if (!(await isConnected())) {
      return NextResponse.json({ connected: false, message: "Google not connected. Visit /api/google/connect" });
    }
    const [messages, lastRunRow] = await Promise.all([
      searchMessages(QUERY, 25),
      db().from("kv").select("value").eq("key", "gmail_receipts_last_run").maybeSingle(),
    ]);
    let last_run: unknown = null;
    if (lastRunRow.data?.value) {
      try { last_run = JSON.parse(lastRunRow.data.value); } catch {}
    }
    return NextResponse.json({
      connected: true,
      pending_count: messages.length,
      query: QUERY,
      last_run,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — actually process pending receipt emails.
//
// Query parameters:
//   ?days=N      — lookback window (default 30, max 60)
//   ?force=true  — include emails already labelled Receipts-Processed
//                  so we can rescan a window without the dedup label
//                  filter. SHA256 dedup still prevents duplicates.
export async function POST(req: NextRequest) {
  try {
    if (!(await isConnected())) {
      return NextResponse.json({ error: "Google not connected." }, { status: 400 });
    }
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    const daysParam = Number.parseInt(url.searchParams.get("days") ?? "30", 10);
    const days = Math.min(60, Math.max(1, Number.isFinite(daysParam) ? daysParam : 30));

    const query = buildQuery({ days, includeProcessed: force });
    const labelId = await ensureProcessedLabel();
    const messages = await searchMessages(query, 25);

    const results: ProcessResult[] = [];
    for (const m of messages) {
      if (!force && (await alreadyProcessed(m.id))) {
        // Belt-and-braces: mark it processed in Gmail too so the search doesn't return it again
        try { await markProcessed(m.id, labelId); } catch {}
        continue;
      }
      const full = await getMessage(m.id);
      results.push(await processMessage(full, labelId));
    }

    return NextResponse.json({
      query_used: query,
      processed_messages: results.length,
      receipts_created: results.reduce((s, r) => s + r.receipts_created, 0),
      bank_matches: results.reduce((s, r) => s + r.bank_matches, 0),
      results,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
