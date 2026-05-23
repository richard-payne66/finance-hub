// Server-side OAuth state store. Belt-and-braces approach: write to
// both Supabase kv AND a cookie. The callback accepts either match,
// so OAuth flows survive even when Chrome's cookie policy drops the
// state cookie during third-party redirects.
//
// State entries auto-expire after STATE_TTL_MS via a check at lookup
// time (cleaner than a background cleanup job for this volume).

import { db } from "@/app/lib/db";

const KV_PREFIX = "oauth_state_";
const STATE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type OAuthProvider = "monzo" | "freeagent" | "google";

type StateRecord = {
  provider: OAuthProvider;
  created_at: number;
};

export async function persistState(state: string, provider: OAuthProvider): Promise<void> {
  await db().from("kv").upsert({
    key: `${KV_PREFIX}${state}`,
    value: JSON.stringify({ provider, created_at: Date.now() } as StateRecord),
  });
}

export async function consumeState(state: string, provider: OAuthProvider): Promise<boolean> {
  const key = `${KV_PREFIX}${state}`;
  const { data } = await db().from("kv").select("value").eq("key", key).maybeSingle();
  if (!data) return false;
  try {
    const rec = JSON.parse(data.value) as StateRecord;
    if (rec.provider !== provider) return false;
    if (Date.now() - rec.created_at > STATE_TTL_MS) {
      await db().from("kv").delete().eq("key", key);
      return false;
    }
    // Single-use: delete after consume
    await db().from("kv").delete().eq("key", key);
    return true;
  } catch {
    return false;
  }
}
