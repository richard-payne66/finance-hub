// FreeAgent OAuth + API client.
// Tokens stored in Supabase `kv` table under key 'freeagent_tokens'.
// Auto-refreshes when access token is within 60s of expiry.

import { db } from "@/app/lib/db";

const TOKEN_URL    = "https://api.freeagent.com/v2/token_endpoint";
const APPROVE_URL  = "https://api.freeagent.com/v2/approve_app";
const API_BASE     = "https://api.freeagent.com/v2";
const KV_KEY       = "freeagent_tokens";

type TokenSet = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
};

function env() {
  const id     = process.env.FREEAGENT_CLIENT_ID;
  const secret = process.env.FREEAGENT_CLIENT_SECRET;
  const redir  = process.env.FREEAGENT_REDIRECT_URI;
  if (!id || !secret || !redir) {
    throw new Error("FreeAgent env not configured (FREEAGENT_CLIENT_ID/SECRET/REDIRECT_URI).");
  }
  return { id, secret, redir };
}

// ---------- OAuth ----------

export function authorizeUrl(state: string): string {
  const { id, redir } = env();
  const u = new URL(APPROVE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redir);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const { id, secret, redir } = env();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redir,
    client_id: id,
    client_secret: secret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`FA token exchange failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const tokens: TokenSet = {
    access_token:  j.access_token,
    refresh_token: j.refresh_token,
    expires_at:    Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function refresh(tokens: TokenSet): Promise<TokenSet> {
  const { id, secret } = env();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: id,
    client_secret: secret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`FA token refresh failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const refreshed: TokenSet = {
    access_token:  j.access_token,
    refresh_token: j.refresh_token ?? tokens.refresh_token,
    expires_at:    Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  await saveTokens(refreshed);
  return refreshed;
}

// Single-flight guard. FreeAgent ROTATES the refresh token on every use,
// so two concurrent refreshes race: the first rotates the token, the second
// presents an already-spent token and gets invalid_grant — which surfaces as
// a spurious 401. The dashboard fires several FA calls in parallel
// (e.g. dashboard-stats does Promise.all of ~6), so right after the hourly
// access token expires they would all try to refresh at once. Funnelling them
// through one in-flight promise means at most ONE refresh happens per process.
let _refreshInFlight: Promise<TokenSet> | null = null;

function refreshSingleFlight(tokens: TokenSet): Promise<TokenSet> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = refresh(tokens).finally(() => {
    _refreshInFlight = null;
  });
  return _refreshInFlight;
}

// ---------- Token storage ----------

async function saveTokens(t: TokenSet) {
  await db()
    .from("kv")
    .upsert({ key: KV_KEY, value: JSON.stringify(t) });
}

export async function loadTokens(): Promise<TokenSet | null> {
  const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
  if (!data) return null;
  try { return JSON.parse(data.value) as TokenSet; } catch { return null; }
}

export async function clearTokens() {
  await db().from("kv").delete().eq("key", KV_KEY);
}

export async function isConnected(): Promise<boolean> {
  return (await loadTokens()) !== null;
}

// ---------- API calls ----------

export async function getValidToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error("FreeAgent not connected.");
  if (tokens.expires_at - Date.now() < 60_000) {
    try {
      const refreshed = await refreshSingleFlight(tokens);
      return refreshed.access_token;
    } catch (err) {
      // Cross-instance race: another serverless instance may have refreshed
      // (and rotated the token) just before us, invalidating the refresh token
      // we hold. Re-read from storage once — if a newer, still-valid token is
      // now there, use it rather than failing the request.
      const latest = await loadTokens();
      if (
        latest &&
        latest.access_token !== tokens.access_token &&
        latest.expires_at - Date.now() > 60_000
      ) {
        return latest.access_token;
      }
      throw err;
    }
  }
  return tokens.access_token;
}

export async function api<T = unknown>(path: string): Promise<T> {
  const token = await getValidToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "Finance Hub / Richard Payne LTD",
    },
  });
  if (!res.ok) throw new Error(`FA API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Non-GET request — used to POST/PUT/DELETE against FA's API. Same
// auth + base URL handling as api() above, but lets us send JSON.
export async function apiSend<T = unknown>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const token = await getValidToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Finance Hub / Richard Payne LTD",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`FA ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 500)}`);
  }
  // FA returns 200 with an empty body for some operations (notably DELETE
  // and the occasional PUT). Reading text first and only JSON.parsing if
  // there's actually something to parse avoids "Unexpected end of JSON
  // input" on a successful empty response.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}
