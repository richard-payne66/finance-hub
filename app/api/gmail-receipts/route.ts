import { NextResponse } from "next/server";
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
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 300;

// Polls Gmail for any unread receipt — either:
//   - addressed to receipts@richard-payne.com
//   - labelled RECEIPTS by the user
// For each: extract attachments, run through Claude's receipt extractor,
// store in Supabase, mark message processed (apply 'Receipts/Processed' label).
//
// Dedupe by Gmail Message-ID stored in receipts.source_ref.

const QUERY = '(to:receipts@richard-payne.com OR label:RECEIPTS) -label:Receipts-Processed has:attachment newer_than:30d';
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
  errors: string[];
};

async function processMessage(msg: GmailFullMessage, processedLabelId: string): Promise<ProcessResult> {
  const result: ProcessResult = {
    message_id: msg.id,
    from: headerValue(msg, "From") ?? "?",
    subject: headerValue(msg, "Subject") ?? "(no subject)",
    attachments_processed: 0,
    receipts_created: 0,
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

// GET — diagnostic; returns the search query and how many would be picked up
export async function GET() {
  try {
    if (!(await isConnected())) {
      return NextResponse.json({ connected: false, message: "Google not connected. Visit /api/google/connect" });
    }
    const messages = await searchMessages(QUERY, 25);
    return NextResponse.json({ connected: true, pending_count: messages.length, query: QUERY });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — actually process pending receipt emails
export async function POST() {
  try {
    if (!(await isConnected())) {
      return NextResponse.json({ error: "Google not connected." }, { status: 400 });
    }
    const labelId = await ensureProcessedLabel();
    const messages = await searchMessages(QUERY, 25);

    const results: ProcessResult[] = [];
    for (const m of messages) {
      if (await alreadyProcessed(m.id)) {
        // Belt-and-braces: mark it processed in Gmail too so the search doesn't return it again
        try { await markProcessed(m.id, labelId); } catch {}
        continue;
      }
      const full = await getMessage(m.id);
      results.push(await processMessage(full, labelId));
    }

    return NextResponse.json({
      processed_messages: results.length,
      receipts_created: results.reduce((s, r) => s + r.receipts_created, 0),
      results,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
