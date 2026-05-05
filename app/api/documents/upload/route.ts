import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";
import type { DocumentCategory } from "@/app/lib/types";

export const maxDuration = 30;

// Maps checklist item IDs → DocumentCategory
const CATEGORY_MAP: Record<string, DocumentCategory> = {
  "doc-ct600":      "CT600",
  "doc-accounts":   "Statutory Accounts",
  "doc-sa":         "Self Assessment",
  "doc-p60":        "P60",
  "doc-vat":        "VAT Returns",
};

function categoryFor(itemId: string): DocumentCategory {
  for (const [prefix, cat] of Object.entries(CATEGORY_MAP)) {
    if (itemId.startsWith(prefix)) return cat;
  }
  return "Other";
}

// Extracts year label from item IDs like doc-ct600-2324 → "2023/24"
function yearFor(itemId: string): string | null {
  const m = itemId.match(/(\d{2})(\d{2})$/);
  if (!m) return null;
  return `20${m[1]}/20${m[2]}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const itemId = (form.get("checklist_item_id") as string | null) ?? null;

    if (!file) return NextResponse.json({ error: "No file." }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = file.name.split(".").pop() ?? "bin";
    const storageKey = `${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;

    const { error: uploadErr } = await db()
      .storage.from("documents")
      .upload(storageKey, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

    const { data: doc, error: insertErr } = await db()
      .from("documents")
      .insert({
        category: categoryFor(itemId ?? ""),
        year: itemId ? yearFor(itemId) : null,
        filename: file.name,
        file_url: storageKey,
        checklist_item_id: itemId,
      })
      .select()
      .single();

    if (insertErr || !doc) throw new Error(`DB insert: ${insertErr?.message}`);

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    return errorResponse(err, 500, "Upload failed.");
  }
}
