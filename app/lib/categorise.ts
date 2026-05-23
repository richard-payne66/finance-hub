// AI categorisation of FreeAgent bank transactions, biased toward
// the most tax-efficient *legitimate* categorisation.
//
// Caching strategy: the system prompt + categories list + past examples
// are stable across all transactions in a batch run, so we put them
// in the cached portion of the request and let Claude prompt-caching
// amortise their token cost. The transaction-specific block is the
// only non-cached part.

import Anthropic from "@anthropic-ai/sdk";
import type { FaCategory } from "@/app/lib/fa-categories";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type CategorisationResult = {
  category_url: string | null;
  category_name: string | null;
  confidence: number;       // 0..1
  reasoning: string;
  tax_note: string | null;  // plain-English why this is tax-optimal
  is_personal_likely: boolean;
};

export type PastExample = {
  description: string;
  amount: number;
  category_name: string;
  category_url: string;
};

const SYSTEM_PROMPT = `You are a senior UK bookkeeper for a sole-director limited company doing film/animation production (SIC 59111). Your job: classify a single bank transaction into the most tax-efficient *legitimate* FreeAgent category.

TAX-EFFICIENCY PRINCIPLES (UK Corp Tax 2024/25):
1. Maximise allowable deductions. Always prefer a category marked allowable_for_tax=true over one that isn't, IF the transaction genuinely fits that category.
2. Annual Investment Allowance (AIA): Computer Equipment, Office Equipment, Plant and Machinery — these allow 100% first-year deduction up to £1M. Prefer these over "Other" when the item is durable kit.
3. Computer Equipment for: any computers, monitors, peripherals, storage devices, cameras, audio equipment, lighting, lenses, drones, hard drives, SSDs.
4. Software (annual subscriptions or perpetual licenses) for: SaaS subscriptions, Adobe, Frame.io, Notion, GitHub, hosting, plugins. Fully deductible in the year.
5. Subscriptions for: professional bodies, trade publications.
6. Subsistence for: meals during business *travel* only — NOT regular office meals.
7. Travel for: trains, flights, taxis, fuel for business trips. Mileage allowance preferred over actual fuel for own car.
8. Training and Courses for: online courses, conferences, books, workshops — relevant to current business activities.
9. Use of Home as Office for: flat-rate £6/week for sole directors working from home.
10. Reject Entertainment: client entertainment is NOT deductible (HMRC explicit rule). Staff entertainment up to £150/head/year is.

CAUTION:
- Watch for personal-looking spend on a business card. If a transaction looks personal (groceries, clothes, gifts to family, gym, Netflix), set is_personal_likely=true with low confidence rather than trying to force a category.
- If genuinely uncertain between two close categories, prefer the one with higher tax-reporting clarity AND higher confidence in deductibility.
- For income (money in), use Sales / Income categories.

CONFIDENCE:
- 0.95-1.00: clear, obvious match (Adobe → Software).
- 0.80-0.94: confident based on description.
- 0.50-0.79: best guess, plausible alternatives exist.
- <0.50: very uncertain — return your best guess but flag confidence honestly.

OUTPUT: return ONLY a JSON object matching the schema. No prose, no markdown.`;

const SCHEMA = {
  type: "object",
  required: ["category_url", "confidence", "reasoning", "is_personal_likely"],
  properties: {
    category_url: { type: ["string", "null"], description: "The exact url field from the categories list, or null if you cannot find a reasonable match." },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string", description: "One sentence explaining the choice." },
    tax_note: { type: ["string", "null"], description: "One short sentence on why this is tax-optimal, or null if generic." },
    is_personal_likely: { type: "boolean", description: "True if this transaction looks like personal spend on a business card." },
  },
} as const;

export async function classifyTransaction(input: {
  description: string;
  amount: number;       // negative = money out, positive = money in
  date: string;         // ISO
  categories: FaCategory[];
  pastExamples?: PastExample[];
}): Promise<CategorisationResult> {
  const { description, amount, date, categories, pastExamples = [] } = input;

  // Trim categories down to the fields Claude needs
  const catSummary = categories.map((c) => ({
    url: c.url,
    description: c.description,
    group: c.group_description,
    allowable_for_tax: c.allowable_for_tax,
    tax_reporting_name: c.tax_reporting_name,
  }));

  // Cached portion: schema + categories + examples (stable across batch run)
  const cachedContext = [
    `## AVAILABLE CATEGORIES (${categories.length})`,
    JSON.stringify(catSummary, null, 1),
    pastExamples.length > 0 ? `\n## PAST CATEGORISATIONS BY THIS USER (for pattern learning)` : "",
    pastExamples.length > 0 ? JSON.stringify(
      pastExamples.slice(0, 50).map((p) => ({
        desc: p.description,
        amount: p.amount,
        category: p.category_name,
      })),
      null, 1
    ) : "",
    `\n## OUTPUT SCHEMA`,
    JSON.stringify(SCHEMA, null, 1),
  ].filter(Boolean).join("\n");

  const directionLabel = amount < 0 ? "money OUT" : "money IN";

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text: cachedContext,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Transaction to classify:
- Description: ${description}
- Amount: £${Math.abs(amount).toFixed(2)} (${directionLabel})
- Date: ${date}

Return JSON only.`,
      },
    ],
  });

  // Parse response
  const text = res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      category_url: null,
      category_name: null,
      confidence: 0,
      reasoning: "Could not parse Claude response.",
      tax_note: null,
      is_personal_likely: false,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      category_url: string | null;
      confidence: number;
      reasoning: string;
      tax_note: string | null;
      is_personal_likely: boolean;
    };
    const cat = parsed.category_url
      ? categories.find((c) => c.url === parsed.category_url)
      : null;
    return {
      category_url: parsed.category_url,
      category_name: cat?.description ?? null,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      tax_note: parsed.tax_note,
      is_personal_likely: parsed.is_personal_likely,
    };
  } catch {
    return {
      category_url: null,
      category_name: null,
      confidence: 0,
      reasoning: "Could not parse JSON.",
      tax_note: null,
      is_personal_likely: false,
    };
  }
}
