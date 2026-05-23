// Monzo OAuth + API client.
// Quirk: after exchanging the code for tokens, the access token isn't
// "strongly authenticated" until the user taps the approval push in their
// Monzo app. /accounts will return 403 until they do — we surface that
// state to the UI so the user knows to check their phone.

import { db } from "@/app/lib/db";

const AUTH_URL   = "https://auth.monzo.com/";
const TOKEN_URL  = "https://api.monzo.com/oauth2/token";
const API_BASE   = "https://api.monzo.com";
const KV_KEY     = "monzo_tokens";

export type MonzoTokens = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_at: number;
};

function env() {
  const id     = process.env.MONZO_CLIENT_ID;
  const secret = process.env.MONZO_CLIENT_SECRET;
  const redir  = process.env.MONZO_REDIRECT_URI;
  if (!id || !secret || !redir) {
    throw new Error("Monzo env not configured (MONZO_CLIENT_ID/SECRET/REDIRECT_URI).");
  }
  return { id, secret, redir };
}

// ---------- OAuth ----------

export function authorizeUrl(state: string): string {
  const { id, redir } = env();
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redir);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string): Promise<MonzoTokens> {
  const { id, secret, redir } = env();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: id,
    client_secret: secret,
    redirect_uri: redir,
    code,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Monzo token exchange failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const tokens: MonzoTokens = {
    access_token:  j.access_token,
    refresh_token: j.refresh_token,
    user_id:       j.user_id,
    expires_at:    Date.now() + (j.expires_in ?? 21600) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function refresh(tokens: MonzoTokens): Promise<MonzoTokens> {
  const { id, secret } = env();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: id,
    client_secret: secret,
    refresh_token: tokens.refresh_token,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Monzo token refresh failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const refreshed: MonzoTokens = {
    access_token:  j.access_token,
    refresh_token: j.refresh_token ?? tokens.refresh_token,
    user_id:       j.user_id ?? tokens.user_id,
    expires_at:    Date.now() + (j.expires_in ?? 21600) * 1000,
  };
  await saveTokens(refreshed);
  return refreshed;
}

// ---------- Token storage ----------

async function saveTokens(t: MonzoTokens) {
  await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(t) });
}

export async function loadTokens(): Promise<MonzoTokens | null> {
  const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
  if (!data) return null;
  try { return JSON.parse(data.value) as MonzoTokens; } catch { return null; }
}

export async function clearTokens() {
  await db().from("kv").delete().eq("key", KV_KEY);
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) !== null;
}

// ---------- API calls ----------

async function getValidToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error("Monzo not connected.");
  if (tokens.expires_at - Date.now() < 60_000) {
    const refreshed = await refresh(tokens);
    return refreshed.access_token;
  }
  return tokens.access_token;
}

export type MonzoApiError = { code: "not_connected" | "sca_required" | "unknown"; message: string };

export async function api<T = unknown>(path: string): Promise<T> {
  const token = await getValidToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Finance Hub / Richard Payne LTD",
    },
  });
  if (res.status === 403) {
    const body = await res.text();
    // Monzo returns 403 with code "forbidden.insufficient_permissions" until SCA done
    if (/insufficient_permissions|sca|approval/i.test(body)) {
      const err: MonzoApiError = { code: "sca_required", message: "Approve Finance Hub in your Monzo app." };
      throw err;
    }
  }
  if (!res.ok) throw new Error(`Monzo API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
