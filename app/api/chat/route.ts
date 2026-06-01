import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";
import { BUSINESS_FACTS, STRATEGY_BRIEF } from "@/app/lib/chat-knowledge";
import { getDividendHeadroom } from "@/app/lib/headroom";

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

You have tools to query receipts, run aggregates, and read Richard's live
money position. Use them whenever the answer needs live data.

DECISIONS ("Can I…?"): when Richard asks whether he can afford something, take
money out, or pay a dividend, ALWAYS call financial_position first, then answer
with a clear yes/no, the safe number, and one short sentence of why. "Safe to
take" = the safe_dividend figure (cash left after tax owed and a one-month
buffer). Never guess these numbers — read them from the tool. If what he wants
is below safe_dividend, the answer is yes; if above, say what IS safe instead.

EXTRACTION WHAT-IFS: for "what if I take £X as a dividend", "how much tax on a
£X dividend", or "dividend vs pension", call estimate_dividend_tax (it assumes
the £12,570 salary unless told otherwise). Give the net in hand and the tax in
plain English. For dividend-vs-pension: an employer pension contribution avoids
ALL dividend tax and cuts corporation tax, but it's locked until age 57 — so it
wins for SURPLUS he doesn't need now, while a dividend wins if he needs the cash
today. Never compute tax yourself; use the tool.

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
  {
    name: "financial_position",
    description:
      "Richard's live money position from FreeAgent: cash in the bank now, total tax owed (VAT + Corporation Tax + anything manual), a sensible one-month operating buffer, and the resulting amount he could SAFELY take out as a dividend right now (safe_dividend). Use this for ANY question about affording a purchase, taking money out, paying a dividend, or whether he's covered for tax.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "estimate_dividend_tax",
    description:
      "Estimate the PERSONAL tax on taking a dividend, at 2026/27 UK rates (top-slice; assumes the usual £12,570 salary unless other_income is given). Use for 'what if I take £X as a dividend', 'how much tax on a £X dividend', and dividend-vs-pension comparisons. Returns gross, tax, net in hand, effective rate, and whether it crosses the 35.75% higher-rate band. Always use this instead of doing the maths yourself.",
    input_schema: {
      type: "object",
      properties: {
        gross_dividend: { type: "number", description: "Gross dividend to take, in £" },
        other_income: { type: "number", description: "Other taxable income this year in £ (default 12570 = the usual salary)" },
      },
      required: ["gross_dividend"],
    },
  },
];

// UK 2026/27 dividend-tax estimate (dividends taxed as the top slice of
// income). Deterministic — the butler must call this, never compute tax in its
// head. Personal allowance £12,570 (tapered above £100k); dividend allowance
// £500 at 0%; rates 10.75% / 35.75% / 39.35%.
function estimateDividendTax(grossDividend: number, otherIncome = 12570) {
  const BASIC_TOP = 50270;
  const HIGHER_TOP = 125140;
  const ALLOWANCE = 500;
  const total = otherIncome + grossDividend;
  let pa = 12570;
  if (total > 100000) pa = Math.max(0, 12570 - Math.floor((total - 100000) / 2));
  const bands = [
    { top: pa, rate: 0 },
    { top: BASIC_TOP, rate: 0.1075 },
    { top: HIGHER_TOP, rate: 0.3575 },
    { top: Infinity, rate: 0.3935 },
  ];
  const hi = otherIncome + grossDividend;
  let allowanceLeft = ALLOWANCE;
  let tax = 0;
  let prev = 0;
  for (const b of bands) {
    const segLo = Math.max(otherIncome, prev);
    const segHi = Math.min(hi, b.top);
    if (segHi > segLo) {
      let amt = segHi - segLo;
      const free = Math.min(amt, allowanceLeft);
      allowanceLeft -= free;
      amt -= free;
      tax += amt * b.rate;
    }
    prev = b.top;
    if (prev >= hi) break;
  }
  const taxR = Math.round(tax);
  return {
    gross_dividend: Math.round(grossDividend),
    other_income: Math.round(otherIncome),
    tax: taxR,
    net_in_hand: Math.round(grossDividend - taxR),
    effective_rate_pct: grossDividend > 0 ? Math.round((taxR / grossDividend) * 1000) / 10 : 0,
    crosses_higher_rate: hi > BASIC_TOP,
    assumptions: `UK 2026/27. Assumes other income £${Math.round(otherIncome)}. £500 dividend allowance; rates 10.75% / 35.75% / 39.35%. Excludes the corporation tax already paid before profits can be distributed.`,
  };
}

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

  if (name === "financial_position") {
    try {
      return await getDividendHeadroom();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not read financial position" };
    }
  }

  if (name === "estimate_dividend_tax") {
    const gross = Number(input.gross_dividend);
    if (!Number.isFinite(gross) || gross < 0) return { error: "gross_dividend must be a positive number" };
    const other = Number.isFinite(Number(input.other_income)) ? Number(input.other_income) : 12570;
    return estimateDividendTax(gross, other);
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
