import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { errorResponse } from "@/app/lib/api-helpers";

// "Can I expense this £250 monitor?" → instant plain-English ruling with
// category + estimated tax saving. Designed for real-time use at the
// point of purchase.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a UK tax advisor for a sole-director limited company (Richard Payne LTD — film/animation production, SIC 59111). Corp Tax rate: 19% (Small Profits Rate, profits < £50k) or 25% (Main Rate, profits > £250k) with marginal relief between. VAT registered (standard rate 20%).

When asked "can I expense [X]?":
1. Decide: is it wholly and exclusively for business purposes? (HMRC test)
2. If yes: name the FreeAgent category, estimate tax saving, mention VAT reclaim if applicable, note any caveats
3. If borderline: explain the test and what would tip it either way
4. If no: explain why not, suggest alternative if any

Use plain English. NO accounting jargon. Be confident but honest about edge cases.

Output JSON only:
{
  "verdict": "yes" | "maybe" | "no",
  "category": "string — best FreeAgent category, e.g. 'Computer Equipment'",
  "tax_saving_estimate": "string — e.g. '~£47 corp tax + £41 VAT reclaim'",
  "why": "string — one sentence plain-English explanation",
  "caveat": "string|null — anything to be careful about (max 1 sentence)",
  "use_business_card": boolean
}`;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }

    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: question.slice(0, 500) }],
    });

    const text = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json({
        verdict: "maybe",
        category: null,
        tax_saving_estimate: null,
        why: "Couldn't parse a clear answer — try rephrasing.",
        caveat: null,
        use_business_card: true,
      });
    }
    const parsed = JSON.parse(m[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    return errorResponse(err);
  }
}
