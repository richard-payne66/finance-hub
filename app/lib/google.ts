// Google OAuth (Gmail) — same pattern as freeagent.ts / monzo.ts.
// Scopes: gmail.modify (read + label manipulation, no send needed for v1).

import { db } from "@/app/lib/db";

const AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE  = "https://gmail.googleapis.com/gmail/v1";
const KV_KEY    = "google_tokens";
const SCOPES    = ["https://www.googleapis.com/auth/gmail.modify"];

export type GoogleTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

function env() {
  const id     = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redir  = process.env.GOOGLE_REDIRECT_URI;
  if (!id || !secret || !redir) {
    throw new Error("Google env not configured (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).");
  }
  return { id, secret, redir };
}

export function authorizeUrl(state: string): string {
  const { id, redir } = env();
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redir);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const { id, secret, redir } = env();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redir,
    client_id: id,
    client_secret: secret,
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`Google token exchange: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const tokens: GoogleTokens = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function refresh(tokens: GoogleTokens): Promise<GoogleTokens> {
  const { id, secret } = env();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: id,
    client_secret: secret,
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`Google refresh: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const refreshed: GoogleTokens = {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  await saveTokens(refreshed);
  return refreshed;
}

async function saveTokens(t: GoogleTokens) {
  await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(t) });
}

export async function loadTokens(): Promise<GoogleTokens | null> {
  const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
  if (!data) return null;
  try { return JSON.parse(data.value) as GoogleTokens; } catch { return null; }
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) !== null;
}

async function token(): Promise<string> {
  const t = await loadTokens();
  if (!t) throw new Error("Google not connected.");
  if (t.expires_at - Date.now() < 60_000) return (await refresh(t)).access_token;
  return t.access_token;
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const tok = await token();
  const r = await fetch(path.startsWith("http") ? path : `${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${tok}` },
  });
  if (!r.ok) throw new Error(`Google API ${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

// Helpers ------------------------------------------------------------

export type GmailMessage = { id: string; threadId: string; labelIds?: string[] };

export async function searchMessages(query: string, maxResults = 25): Promise<GmailMessage[]> {
  const r = await api<{ messages?: GmailMessage[] }>(`/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
  return r.messages ?? [];
}

export type GmailFullMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: GmailPart[];
    body?: { data?: string; size: number };
    mimeType: string;
  };
};

export type GmailPart = {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body: { attachmentId?: string; data?: string; size: number };
  parts?: GmailPart[];
};

export async function getMessage(id: string): Promise<GmailFullMessage> {
  return api<GmailFullMessage>(`/users/me/messages/${id}?format=full`);
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const r = await api<{ data: string }>(`/users/me/messages/${messageId}/attachments/${attachmentId}`);
  // Gmail returns base64url
  return Buffer.from(r.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function headerValue(msg: GmailFullMessage, name: string): string | null {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export function extractBodyText(msg: GmailFullMessage): string {
  const out: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.mimeType === "text/plain" && p.body.data) {
      out.push(Buffer.from(p.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    }
    p.parts?.forEach(walk);
  };
  if (msg.payload.parts) msg.payload.parts.forEach(walk);
  else if (msg.payload.body?.data) {
    out.push(Buffer.from(msg.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  }
  return out.join("\n").trim();
}
