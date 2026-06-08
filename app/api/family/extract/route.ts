import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { errorResponse } from "@/app/lib/api-helpers";
import { getDocument, updateDocument } from "@/app/lib/family";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Pull JSON out of a model reply, tolerating ```json fences or stray prose.
function parseJsonLoose(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

const PROMPT = `You are reading a UK household financial document (a bank statement, savings/ISA statement, investment statement, or pension statement) for Richard and Catrin Payne. Extract the useful figures.

Return ONLY a JSON object (no markdown, no commentary) in this exact shape:
{
  "kind": "bank_statement" | "pension" | "investment" | "other",
  "summary": "<one short sentence describing the document>",
  "accounts": [
    {
      "name": "<account/product name, e.g. 'Aviva Pension', 'Vanguard S&S ISA', 'Barclays Joint Current'>",
      "type": "savings" | "investment" | "pension" | "cash" | "other",
      "owner": "joint" | "rich" | "cat" | "unknown",
      "institution": "<provider, e.g. Aviva, Vanguard, Barclays>",
      "balance": <current value as a number in GBP, no symbols or commas>,
      "asOfDate": "<YYYY-MM-DD if a statement date is shown, else null>"
    }
  ],
  "expenses": [
    {
      "name": "<recurring outgoing seen on the statement, e.g. 'Council Tax', 'Octopus Energy'>",
      "amount": <number in GBP>,
      "frequency": "weekly" | "monthly" | "quarterly" | "annual",
      "category": "joint" | "kids" | "cat_personal" | "rich_personal" | "joint_fun"
    }
  ]
}

Rules:
- Use the CURRENT/closing balance for accounts, not opening balance.
- 'cash' = current accounts; 'savings' = savings/ISA cash; 'investment' = stocks & shares / funds; 'pension' = pensions.
- Only list expenses that look like regular recurring outgoings (direct debits, standing orders). Skip one-off card spending.
- If you cannot tell the owner, use "unknown".
- If the document has no accounts or no expenses, use empty arrays. Never invent figures.`;

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();
    if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

    const doc = await getDocument(documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const ct = (doc.contentType ?? "").toLowerCase();
    const isPdf = ct.includes("pdf") || doc.fileUrl.toLowerCase().endsWith(".pdf");

    const mediaBlock = isPdf
      ? ({ type: "document", source: { type: "url", url: doc.fileUrl } } as const)
      : ({ type: "image", source: { type: "url", url: doc.fileUrl } } as const);

    let message;
    try {
      message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: [mediaBlock as any, { type: "text", text: PROMPT }],
          },
        ],
      });
    } catch (e) {
      await updateDocument(documentId, { status: "error" });
      throw e;
    }

    const rawText = message.content.find((b) => b.type === "text");
    const raw = rawText && rawText.type === "text" ? rawText.text : "";

    let extracted: { kind?: string; summary?: string; accounts?: unknown[]; expenses?: unknown[] };
    try {
      extracted = parseJsonLoose(raw) as typeof extracted;
    } catch {
      await updateDocument(documentId, { status: "error" });
      return NextResponse.json({ error: "Could not read figures from this document.", raw: raw.slice(0, 400) }, { status: 422 });
    }

    await updateDocument(documentId, {
      status: "extracted",
      extracted,
      kind: typeof extracted.kind === "string" ? extracted.kind : undefined,
    });

    return NextResponse.json({
      ok: true,
      extracted: {
        kind: extracted.kind ?? "other",
        summary: extracted.summary ?? "",
        accounts: Array.isArray(extracted.accounts) ? extracted.accounts : [],
        expenses: Array.isArray(extracted.expenses) ? extracted.expenses : [],
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
