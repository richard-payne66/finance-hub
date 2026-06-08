// Scan Gmail for emails from the accountant and pull out "things Richard needs
// to do" with an AI pass. Surfaced on the dashboard so action items from the
// accountant don't get lost in the inbox.
//
// Sender is fixed to AccKent (the current accountant). Results are cached in KV
// so we don't re-run the AI on every page load; refreshed on demand or when stale.

import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { db } from "@/app/lib/db";
import {
  isConnected, searchMessages, getMessage, headerValue, extractBodyText,
} from "@/app/lib/google";

const ACCOUNTANT_FROM = "hello@acckent.com";
const SEARCH = `from:${ACCOUNTANT_FROM} newer_than:60d`;
const MAX_THREADS = 5;          // cap AI calls
const CACHE_KEY = "accountant_actions_cache";
const DISMISSED_KEY = "accountant_actions_dismissed";
const STALE_MS = 6 * 60 * 60 * 1000; // 6h

export type AccountantAction = { text: string; due: string | null; is_payment: boolean; amount: string | null };

export type AccountantEmail = {
  id: string;
  threadId: string;
  subject: string;
  date: string;        // ISO
  link: string;        // open thread in Gmail
  summary: string;     // one-line what it's about
  actions: AccountantAction[];
};

export type AccountantInbox = {
  connected: boolean;
  checked_at: string | null;
  emails: AccountantEmail[];     // newest first, dismissed ones removed
  open_action_count: number;
};

type Cache = { checked_at: string; emails: AccountantEmail[] };

// ── AI extraction ───────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          due: { type: ["string", "null"] },
          is_payment: { type: "boolean" },
          amount: { type: ["string", "null"] },
        },
        required: ["text", "due", "is_payment", "amount"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "actions"],
  additionalProperties: false,
};

const PROMPT = `You are helping Richard, a UK limited-company director, triage an email from his accountant.

Return:
- summary: one short line on what the email is about.
- actions: concrete things the accountant is asking RICHARD to do or decide. Only include items that need HIS action: pay something, confirm/approve, send a document, sign, answer a question, choose an option. Do NOT include things the accountant is doing themselves, status updates, or pleasantries. If nothing needs Richard, return an empty array.
- For each action:
  - "text": a short imperative (e.g. "Pay the May & June invoice", "Confirm Mettle as primary account").
  - "due": a deadline if one is stated (YYYY-MM-DD, or short text like "before 31 Jul"), otherwise null.
  - "is_payment": true ONLY if the action is Richard paying or transferring money — paying the accountant's invoice/fee, paying a tax bill, settling something. false for confirming, sending documents, signing, decisions, or clarifications.
  - "amount": the sum if the email states one (e.g. "£105", "£210"), otherwise null.

Email follows:
`;

/** Strip quoted reply history so we only analyse the latest message. */
function stripQuoted(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message/i.test(line.trim())) break;
    out.push(line);
  }
  return out.join("\n").trim().slice(0, 6000);
}

async function extract(body: string): Promise<{ summary: string; actions: AccountantAction[] }> {
  const response = await client().beta.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT + body }] }],
  } as MessageCreateParamsNonStreaming);
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return { summary: "", actions: [] };
  try {
    const parsed = JSON.parse(textBlock.text) as { summary: string; actions: AccountantAction[] };
    return { summary: parsed.summary ?? "", actions: parsed.actions ?? [] };
  } catch {
    return { summary: "", actions: [] };
  }
}

// ── KV helpers ───────────────────────────────────────────────────────────────

async function loadCache(): Promise<Cache | null> {
  const { data } = await db().from("kv").select("value").eq("key", CACHE_KEY).maybeSingle();
  if (!data) return null;
  try { return JSON.parse(data.value) as Cache; } catch { return null; }
}
async function saveCache(c: Cache) {
  await db().from("kv").upsert({ key: CACHE_KEY, value: JSON.stringify(c) });
}
async function loadDismissed(): Promise<string[]> {
  const { data } = await db().from("kv").select("value").eq("key", DISMISSED_KEY).maybeSingle();
  if (!data) return [];
  try { return JSON.parse(data.value) as string[]; } catch { return []; }
}
export async function dismiss(messageId: string) {
  const set = new Set(await loadDismissed());
  set.add(messageId);
  await db().from("kv").upsert({ key: DISMISSED_KEY, value: JSON.stringify([...set]) });
}
export async function clearDismissed() {
  await db().from("kv").upsert({ key: DISMISSED_KEY, value: JSON.stringify([]) });
}

// ── Build (the expensive bit) ─────────────────────────────────────────────────

async function build(): Promise<AccountantEmail[]> {
  const msgs = await searchMessages(SEARCH, 50);
  // Fetch the messages and sort by date OURSELVES — don't trust Gmail's return
  // order (it isn't strictly chronological for text queries). Cap the fetch so
  // a huge mailbox can't blow the function timeout.
  const fulls = [];
  for (const m of msgs.slice(0, 20)) {
    try { fulls.push(await getMessage(m.id)); } catch { /* skip unreadable */ }
  }
  fulls.sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));

  // newest message per thread
  const seen = new Set<string>();
  const latest = fulls.filter((f) => {
    if (seen.has(f.threadId)) return false;
    seen.add(f.threadId);
    return true;
  }).slice(0, MAX_THREADS);

  const emails: AccountantEmail[] = [];
  for (const full of latest) {
    try {
      const subject = headerValue(full, "Subject") ?? "(no subject)";
      const body = stripQuoted(extractBodyText(full));
      const date = new Date(Number(full.internalDate || "0")).toISOString();
      const { summary, actions } = body ? await extract(body) : { summary: "", actions: [] };
      // Richard only wants the card to flag things he has to PAY.
      const payActions = actions.filter((a) => a.is_payment);
      emails.push({
        id: full.id,
        threadId: full.threadId,
        subject,
        date,
        link: `https://mail.google.com/mail/u/0/#all/${full.threadId}`,
        summary,
        actions: payActions,
      });
    } catch { /* skip this email rather than fail the whole scan */ }
  }
  return emails;
}

// ── Public ─────────────────────────────────────────────────────────────────────

export async function getAccountantInbox(opts: { force?: boolean } = {}): Promise<AccountantInbox> {
  if (!(await isConnected())) {
    return { connected: false, checked_at: null, emails: [], open_action_count: 0 };
  }

  let cache = await loadCache();
  const stale = !cache || Date.now() - new Date(cache.checked_at).getTime() > STALE_MS;
  if (opts.force || stale) {
    const emails = await build();
    cache = { checked_at: new Date().toISOString(), emails };
    await saveCache(cache);
  }

  const dismissed = new Set(await loadDismissed());
  const emails = (cache?.emails ?? []).filter((e) => !dismissed.has(e.id));
  const open_action_count = emails.reduce((n, e) => n + e.actions.length, 0);
  return { connected: true, checked_at: cache?.checked_at ?? null, emails, open_action_count };
}
