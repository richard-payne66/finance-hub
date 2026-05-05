import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { db } from "@/app/lib/db";
import { extractReceipt } from "@/app/lib/claude-extract";
import type { SupportedMimeType } from "@/app/lib/claude-extract";
import { errorResponse } from "@/app/lib/api-helpers";
import type { ReceiptSource } from "@/app/lib/types";

// Claude can take 10–20s on a complex receipt; give Vercel headroom.
export const maxDuration = 60;

const MAX_LONG_EDGE = 2576; // px — above this sharp resizes before sending to Claude

// ── In-memory categories cache ────────────────────────────────────────────────
// Categories change at most once per FreeAgent sync (Phase 6). Caching for 1h
// avoids a DB round-trip on every single receipt upload.
type CategoriesCache = { json: string; expiresAt: number };
let _categoriesCache: CategoriesCache | null = null;

async function getCategoriesJson(): Promise<string> {
  const now = Date.now();
  if (_categoriesCache && now < _categoriesCache.expiresAt) {
    return _categoriesCache.json;
  }
  const { data } = await db()
    .from("freeagent_categories")
    .select("category_url, description, category_type")
    .order("usage_count", { ascending: false });
  const json = JSON.stringify(
    (data ?? []).map((c) => ({
      url: c.category_url,
      description: c.description,
      type: c.category_type,
    }))
  );
  _categoriesCache = { json, expiresAt: now + 60 * 60 * 1000 }; // 1 hour
  return json;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const source = ((formData.get("source") as string | null) ?? "upload") as ReceiptSource;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const originalMime = file.type;
    const bytes = await file.arrayBuffer();
    // Explicit Buffer type avoids ArrayBuffer vs ArrayBufferLike mismatch
    // between File.arrayBuffer() and sharp's toBuffer() return types.
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
    // storageMime tracks what we actually end up storing (may differ from
    // originalMime if sharp converts an oversized image to JPEG).
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
      // Non-fatal — log and continue; the image thumb will just be missing.
      console.error("Storage upload error:", uploadError.message);
    }

    // ── 4. Categories for prompt (cached 1h) ──────────────────────────────────
    const categoriesJson = await getCategoriesJson();

    // ── 5. Claude extraction ──────────────────────────────────────────────────
    const extracted = await extractReceipt(buffer, claudeMime, categoriesJson);

    // ── 6. Semantic dupe check (same supplier + date + amount, last 7 days) ───
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
        .gte("created_at", sevenDaysAgo)
        .limit(1);
      possibleDupe = (dupes?.length ?? 0) > 0;
    }

    // ── 7. Insert receipt ─────────────────────────────────────────────────────
    const { data: receipt, error: insertError } = await db()
      .from("receipts")
      .insert({
        status: "pending",
        source,
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
        receipt_image_url: uploadError ? null : storageKey,
        notes: extracted.notes,
      })
      .select()
      .single();

    if (insertError || !receipt) {
      throw new Error(`DB insert failed: ${insertError?.message}`);
    }

    // ── 8. Record processed file (dedup guard) ────────────────────────────────
    await db().from("processed_files").insert({
      file_sha256: hash,
      receipt_id: receipt.id,
    });

    return NextResponse.json({ receipt, possible_dupe: possibleDupe });
  } catch (err) {
    return errorResponse(err, 500, "Receipt processing failed.");
  }
}
