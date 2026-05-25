import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { db } from "@/app/lib/db";
import { extractReceipt } from "@/app/lib/claude-extract";
import { isOwnBusiness } from "@/app/lib/own-business";
import type { SupportedMimeType } from "@/app/lib/claude-extract";
import { errorResponse } from "@/app/lib/api-helpers";
import type { ReceiptSource } from "@/app/lib/types";

// Fire-and-forget receipt capture.
//
// The synchronous response covers ONLY the fast bits: hash, dedup,
// resize, storage upload, insert a "processing" stub row. Total ~1-2s,
// so the user can close the camera the instant they see ✓.
//
// The expensive bit — base64-encoding the image, calling Claude,
// updating the row with extracted fields — runs via `after()`, which
// keeps the serverless function alive after the response is sent.
// If Claude fails the row is left as `extraction_failed` with the
// underlying message in extraction_error; receipts that get stuck in
// `processing` for more than ~5 min are flagged in the UI.
export const maxDuration = 60;

const MAX_LONG_EDGE = 2576; // px — above this sharp resizes before sending to Claude

// Pull categories from the kv-cached FreeAgent chart of accounts.
type CategoriesCache = { json: string; expiresAt: number };
let _categoriesCache: CategoriesCache | null = null;

async function getCategoriesJson(): Promise<string> {
  const now = Date.now();
  if (_categoriesCache && now < _categoriesCache.expiresAt) {
    return _categoriesCache.json;
  }
  try {
    const { getCategories } = await import("@/app/lib/fa-categories");
    const cats = await getCategories().catch(() => []);
    const json = JSON.stringify(
      cats.map((c) => ({
        url: c.url,
        description: c.description,
        type: c.group_description,
      }))
    );
    _categoriesCache = { json, expiresAt: now + 60 * 60 * 1000 };
    return json;
  } catch {
    return "[]";
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const source = ((formData.get("source") as string | null) ?? "upload") as ReceiptSource;
    const userNote = (formData.get("note") as string | null)?.trim() || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const originalMime = file.type;
    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(new Uint8Array(bytes));

    // ── 1. Hash + dedup ───────────────────────────────────────────────────────
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    const { data: existing } = await db()
      .from("processed_files")
      .select("receipt_id")
      .eq("file_sha256", hash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Already captured.", receipt_id: existing.receipt_id },
        { status: 409 }
      );
    }

    // ── 2. Normalise to a MIME Claude accepts ─────────────────────────────────
    let claudeMime: SupportedMimeType;
    let storageMime: string = originalMime;

    if (originalMime === "application/pdf") {
      claudeMime = "application/pdf";
    } else {
      const img = sharp(buffer);
      const meta = await img.metadata();
      const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);

      if (longEdge > MAX_LONG_EDGE) {
        const scaleOpt =
          (meta.width ?? 0) >= (meta.height ?? 0)
            ? { width: MAX_LONG_EDGE }
            : { height: MAX_LONG_EDGE };
        buffer = await img
          .resize({ ...scaleOpt, withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
        claudeMime = "image/jpeg";
        storageMime = "image/jpeg";
      } else if (originalMime === "image/png") {
        claudeMime = "image/png";
      } else if (originalMime === "image/webp") {
        claudeMime = "image/webp";
      } else {
        claudeMime = "image/jpeg";
        storageMime = "image/jpeg";
      }
    }

    // ── 3. Upload to Supabase Storage ─────────────────────────────────────────
    const extMap: Record<string, string> = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[storageMime] ?? "jpg";
    const storageKey = `${Date.now()}-${hash.slice(0, 8)}.${ext}`;

    const { error: uploadError } = await db()
      .storage.from("receipts")
      .upload(storageKey, buffer, { contentType: storageMime, upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError.message);
    }

    // ── 4. Insert a "processing" stub row so the receipt appears in lists ─────
    //      immediately, and return 200 to the client.
    const { data: stub, error: stubErr } = await db()
      .from("receipts")
      .insert({
        status: "processing",
        source,
        file_sha256: hash,
        receipt_image_url: uploadError ? null : storageKey,
        notes: userNote,
      })
      .select()
      .single();

    if (stubErr || !stub) {
      throw new Error(`DB insert (stub) failed: ${stubErr?.message}`);
    }

    await db().from("processed_files").insert({
      file_sha256: hash,
      receipt_id: stub.id,
    });

    // ── 5. Background: run Claude, update the row when done. ──────────────────
    //      `after()` lets Vercel keep this function warm until the
    //      background work finishes, without blocking the response.
    after(async () => {
      try {
        const categoriesJson = await getCategoriesJson();
        const extracted = await extractReceipt(buffer, claudeMime, categoriesJson);

        // Outgoing-invoice guard. Same logic as the email path: if the
        // extracted supplier is Richard's own business, this isn't an
        // expense — flip the stub row to 'rejected' so it doesn't sit
        // in the pending queue.
        if (isOwnBusiness(extracted.supplier)) {
          await db()
            .from("receipts")
            .update({
              status: "rejected",
              supplier: extracted.supplier,
              notes: "Detected as own-business invoice (not an expense).",
            })
            .eq("id", stub.id);
          return;
        }

        // Semantic dedupe check (same supplier + date + amount, last 7 days)
        let possibleDupe = false;
        if (extracted.supplier && extracted.supply_date && extracted.gross_total) {
          const sevenDaysAgo = new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000
          ).toISOString();
          const { data: dupes } = await db()
            .from("receipts")
            .select("id")
            .eq("supplier", extracted.supplier)
            .eq("supply_date", extracted.supply_date)
            .eq("gross_total", extracted.gross_total)
            .neq("id", stub.id)
            .gte("created_at", sevenDaysAgo)
            .limit(1);
          possibleDupe = (dupes?.length ?? 0) > 0;
        }

        await db()
          .from("receipts")
          .update({
            status: "pending",
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
            possible_dupe: possibleDupe,
            notes: [userNote, extracted.notes].filter(Boolean).join("\n\n") || null,
          })
          .eq("id", stub.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Background extraction failed for receipt", stub.id, msg);
        await db()
          .from("receipts")
          .update({
            status: "extraction_failed",
            extraction_error: msg.slice(0, 1000),
          })
          .eq("id", stub.id);
      }
    });

    // Return immediately. Receipt will appear in the list as "processing".
    return NextResponse.json({ receipt: stub, queued: true });
  } catch (err) {
    return errorResponse(err, 500, "Receipt processing failed.");
  }
}
