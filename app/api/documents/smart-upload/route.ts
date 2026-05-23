import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";
import type { DocumentCategory } from "@/app/lib/types";

// Smart document upload: user drops in any PDF/image. Claude reads the
// first page, identifies the document type + year, and we store it in
// the documents table under the right category.

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a document classifier for a UK limited company's records archive. Given the first page of a document, identify what it is.

Possible categories:
- CT600              (Corporation Tax Return)
- Statutory Accounts (Annual Financial Statements)
- Self Assessment    (SA100, SA302, personal tax return)
- Trial Balance
- Directors Loan
- P60                (PAYE end-of-year certificate)
- VAT Returns        (HMRC VAT return)
- Bank Statement
- Other              (anything else — eg confirmation statement, share cert)

For year: identify the relevant tax/accounting year. UK Corp Tax years end 30 April; UK personal tax years end 5 April. Use the calendar year of the year-end. For year ending 30 April 2024 → "2024".

Output JSON only:
{
  "category": "string — one of the categories above exactly",
  "year": "string or null — e.g. '2024'",
  "title": "string — a short human title, e.g. 'CT600 — 2023/24'",
  "confidence": "number 0-1"
}`;

type SupportedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

function isSupported(mime: string): mime is SupportedMime {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "application/pdf";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    if (!isSupported(file.type)) {
      return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 415 });
    }

    const bytes = await file.arrayBuffer();
    const buf = Buffer.from(new Uint8Array(bytes));
    const base64 = buf.toString("base64");

    // Ask Claude what it is
    const content: Anthropic.ContentBlockParam[] = [
      file.type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
        : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
      { type: "text", text: "Classify this document. Return JSON only." },
    ];

    const claude = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });

    const text = claude.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: "Couldn't classify (no JSON)" }, { status: 500 });

    const classification = JSON.parse(m[0]) as {
      category: DocumentCategory;
      year: string | null;
      title: string;
      confidence: number;
    };

    // Store in Supabase storage (documents bucket)
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
    const folder = classification.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const yearPart = classification.year ? `${classification.year}/` : "";
    const storageKey = `smart-upload/${folder}/${yearPart}${Date.now()}-${safeName}`;

    const { error: upErr } = await db().storage.from("documents").upload(storageKey, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) return NextResponse.json({ error: `Storage: ${upErr.message}` }, { status: 500 });

    // Insert document row
    const { data: doc, error: insErr } = await db()
      .from("documents")
      .insert({
        category: classification.category,
        year: classification.year,
        filename: file.name,
        file_url: storageKey,
        notes: `Auto-classified: ${classification.title} (${Math.round(classification.confidence * 100)}% confidence)`,
      })
      .select()
      .single();

    if (insErr) return NextResponse.json({ error: `DB: ${insErr.message}` }, { status: 500 });

    return NextResponse.json({ ok: true, document: doc, classification });
  } catch (err) {
    return errorResponse(err);
  }
}
