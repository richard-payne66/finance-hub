import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaudeReceiptData = {
  supplier: string | null;
  supply_date: string | null;
  currency: string | null;
  gross_total: number | null;
  net_total: number | null;
  vat_total: number | null;
  vat_rate: string | null;
  line_items: Array<{
    description: string;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    vat_rate?: string | null;
  }>;
  suggested_freeagent_category_url: string | null;
  suggested_freeagent_category_name: string | null;
  is_business_card: boolean | null;
  low_confidence_fields: string[];
  model_confidence: number;
  notes: string | null;
};

export type SupportedMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

// ── Schema ────────────────────────────────────────────────────────────────────

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    supplier: { type: ["string", "null"] },
    supply_date: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    gross_total: { type: ["number", "null"] },
    net_total: { type: ["number", "null"] },
    vat_total: { type: ["number", "null"] },
    vat_rate: { type: ["string", "null"] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          line_total: { type: ["number", "null"] },
          vat_rate: { type: ["string", "null"] },
        },
        required: ["description"],
        additionalProperties: false,
      },
    },
    suggested_freeagent_category_url: { type: ["string", "null"] },
    suggested_freeagent_category_name: { type: ["string", "null"] },
    is_business_card: { type: ["boolean", "null"] },
    low_confidence_fields: { type: "array", items: { type: "string" } },
    model_confidence: { type: "number" },
    notes: { type: ["string", "null"] },
  },
  required: [
    "supplier",
    "supply_date",
    "currency",
    "gross_total",
    "net_total",
    "vat_total",
    "vat_rate",
    "line_items",
    "suggested_freeagent_category_url",
    "suggested_freeagent_category_name",
    "is_business_card",
    "low_confidence_fields",
    "model_confidence",
    "notes",
  ],
  additionalProperties: false,
};

// ── Prompt ────────────────────────────────────────────────────────────────────

const PROMPT_TEMPLATE = `You are a UK accounting assistant. Extract structured data from this receipt or invoice.

Rules:
- Dates as YYYY-MM-DD
- Amounts as numbers, no currency symbols
- Currency as ISO 4217 (UK vendor + only $ shown → GBP; US vendor → USD)
- Return null for any obscured field, add field name to low_confidence_fields
- suggested_freeagent_category_url must be chosen from: {{categories_json}}
- vat_rate: "20%" standard UK, "0%" zero-rated, "Exempt", "Out of Scope" for non-UK, "Auto" if uncertain
- is_business_card: true if business card/account, false if personal/cash, null if unclear
- model_confidence: 0.0–1.0 overall confidence`;

// ── Client (lazy) ─────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function client() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function extractReceipt(
  fileBuffer: Buffer,
  mimeType: SupportedMimeType,
  categoriesJson: string
): Promise<ClaudeReceiptData> {
  const prompt = PROMPT_TEMPLATE.replace("{{categories_json}}", categoriesJson);

  // Image FIRST, then the text prompt — as specified in the brief.
  type ContentBlock =
    | {
        type: "document";
        source: { type: "base64"; media_type: "application/pdf"; data: string };
      }
    | {
        type: "image";
        source: {
          type: "base64";
          media_type: "image/jpeg" | "image/png" | "image/webp";
          data: string;
        };
      }
    | { type: "text"; text: string };

  const mediaBlock: ContentBlock =
    mimeType === "application/pdf"
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileBuffer.toString("base64"),
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
            data: fileBuffer.toString("base64"),
          },
        };

  const response = await client().beta.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    // output_config is the current (non-deprecated) structured-output parameter
    output_config: {
      format: {
        type: "json_schema",
        schema: RECEIPT_SCHEMA,
      },
    },
    messages: [
      {
        role: "user",
        content: [mediaBlock, { type: "text", text: prompt }],
      },
    ],
  } as MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content block");
  }

  return JSON.parse(textBlock.text) as ClaudeReceiptData;
}
