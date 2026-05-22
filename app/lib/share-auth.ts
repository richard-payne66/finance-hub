// Shared helpers for validating share tokens + password cookies.

import { db } from "@/app/lib/db";
import { verifyPassword } from "@/app/api/share/route";

const KV_PREFIX = "share_token_";

export type TokenMeta = {
  label: string;
  created_at: string;
  expires_at: string;
  pw_hash?: string;
};

export async function loadToken(token: string): Promise<TokenMeta | null> {
  const { data } = await db()
    .from("kv")
    .select("value")
    .eq("key", `${KV_PREFIX}${token}`)
    .maybeSingle();
  if (!data) return null;
  try {
    const meta = JSON.parse(data.value) as TokenMeta;
    if (new Date(meta.expires_at) < new Date()) return null;
    return meta;
  } catch {
    return null;
  }
}

export function cookieName(token: string): string {
  return `share_auth_${token.slice(0, 16)}`;
}

// Returns true if the cookie value proves the user authenticated for this token.
export function isAuthCookieValid(meta: TokenMeta, cookieValue: string | undefined): boolean {
  if (!meta.pw_hash) return true; // no password set — always allowed
  if (!cookieValue) return false;
  return verifyPassword(cookieValue, meta.pw_hash);
}
