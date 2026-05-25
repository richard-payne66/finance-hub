import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";
import { BUSINESS_FACTS, STRATEGY_BRIEF } from "@/app/lib/chat-knowledge";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `You are Richard Payne's finance-hub butler — a concise,
practical assistant for his UK Ltd company (Richard Payne Ltd, film/animation
production). You sit on top of his receipts database, his FreeAgent account,
and his pre-prepared tax strategy.

Style:
- Plain English. Short answers (2-4 sentences for most questions).
- No tables of percentages unless explicitly asked.
- If you reference a specific receipt or supplier, render it as a markdown
  link in the form [text](/receipts/<id>) for a single receipt, or
  [text](/receipts?supplier=<encoded>) for a supplier filter.
- If Richard asks about a person you don't recognise from the business
  facts, search the receipts (subcontractors, accountants, etc) — don't make
  someone up.
- When asked about a code/reference (UTR, VAT, payment ref, etc.), answer
  from the business facts directly. Don't add disclaimers.
- If you genuinely don't know, say so once and offer to dig further.

You have tools to query receipts and run aggregates. Use them whenever the
answer needs live data.

Knowledge below.

${BUSINESS_FACTS}

${STRATEGY_BRIEF}
`;

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "search_receipts",
    description:
      "Find receipts matching a supplier name (case-insensitive substring) and/or status. Returns recent matches with id, supplier, date, total, status, category.",
    input_schema: {
      type: "object",
      properties: {
        supplier: { type: "string", description: "Supplier name to match (substring)" },
        status: { type: "string", enum: ["pending", "approved", "rejected", "processing"], description: "Optional status filter" },
        limit: { type: "integer", description: "Max rows (default 20, max 50)" },
      },
    },
  },
  {
    name: "supplier_stats",
    description:
      "Total spend, receipt count, last-seen date, current category for a given supplier (case-insensitive substring match).",
    input_schema: {
      type: "object",
      properties: {
        supplier: { type: "string", description: "Supplier name to match" },
      },
      required: ["supplier"],
    },
  },
  {
    name: "spend_by_category",
    description: "Sum approved expense totals by category over the last N days (default 90).",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", description: "Lookback window in days (default 90, max 365)" },
      },
    },
  },
  {
    name: "recent_activity",
    description: "List the N most recent receipts regardless of status (default 10, max 30).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many (default 10)" } },
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "search_receipts") {
    const supplier = typeof input.supplier === "string" ? input.supplier : null;
    const status = typeof input.status === "string" ? input.status : null;
    const limit = Math.min(50, Math.max(1, Number(input.limit ?? 20)));
    let q = db()
      .from("receipts")
      .select("id, supplier, supply_date, gross_total, currency, status, category_name")
      .order("supply_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (supplier) q = q.ilike("supplier", `%${supplier}%`);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return data ?? [];
  }

  if (name === "supplier_stats") {
    const supplier = String(input.supplier ?? "").trim();
    if (!supplier) return { error: "supplier required" };
    const { data, error } = await db()
      .from("receipts")
      .select("supplier, gross_total, supply_date, status, category_name, currency")
      .ilike("supplier", `%${supplier}%`)
      .neq("status", "rejected");
    if (error) return { error: error.message };
    const rows = data ?? [];
    if (rows.length === 0) return { matches: 0, message: `No receipts found for "${supplier}"` };
    const byCurrency: Record<string, number> = {};
    let last: string | null = null;
    let category: string | null = null;
    let canonicalSupplier = rows[0].supplier;
    for (const r of rows) {
      const cur = r.currency ?? "GBP";
      byCurrency[cur] = (byCurrency[cur] ?? 0) + (r.gross_total ?? 0);
      if (r.supply_date && (!last || r.supply_date > last)) last = r.supply_date;
      if (r.category_name && !category) category = r.category_name;
    }
    return {
      supplier: canonicalSupplier,
      receipt_count: rows.length,
      total_spend: byCurrency,
      last_seen: last,
      category,
    };
  }

  if (name === "spend_by_category") {
    const days = Math.min(365, Math.max(1, Number(input.days ?? 90)));
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await db()
      .from("receipts")
      .select("category_name, gross_total, currency")
      .eq("status", "approved")
      .gte("supply_date", cutoff);
    if (error) return { error: error.message };
    const groups: Record<string, { total: number; count: number }> = {};
    for (const r of data ?? []) {
      const key = r.category_name ?? "Uncategorised";
      if (!groups[key]) groups[key] = { total: 0, count: 0 };
      // Mixing currencies into a single total is rough; flag if non-GBP.
      groups[key].total += r.gross_total ?? 0;
      groups[key].count += 1;
    }
    return Object.entries(groups)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
  }

  if (name === "recent_activity") {
    const limit = Math.min(30, Math.max(1, Number(input.limit ?? 10)));
    const { data, error } = await db()
      .from("receipts")
      .select("id, supplier, supply_date, gross_total, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { error: error.message };
    return data ?? [];
  }

  return { error: `Unknown tool: ${name}` };
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "No messages." }, { status: 400 });
    }

    // Tool-use agent loop: keep calling Claude until it stops asking for tools.
    const anthropicMessages: Anthropic.Messages.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let finalText = "";
    let safetyCounter = 0;
    while (safetyCounter++ < 6) {
      const res = await client().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: anthropicMessages,
      });

      const textBlocks = res.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text");
      const toolUses = res.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );

      if (textBlocks.length) finalText = textBlocks.map((b) => b.text).join("\n");

      if (toolUses.length === 0 || res.stop_reason !== "tool_use") {
        break;
      }

      // Push the assistant turn (incl. tool_use blocks) back into messages.
      anthropicMessages.push({ role: "assistant", content: res.content });

      // Run each tool and feed results back.
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const t of toolUses) {
        const result = await runTool(t.name, (t.input ?? {}) as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: t.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
      anthropicMessages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ reply: finalText || "(no response)" });
  } catch (err) {
    return errorResponse(err, 500, "Chat failed.");
  }
}
