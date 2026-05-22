import { NextRequest, NextResponse } from "next/server";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

const KV_PREFIX = "share_token_";
const TTL_DAYS = 30;

export type ShareToken = {
  token: string;
  label: string;
  created_at: string;
  expires_at: string;
  protected: boolean;
};

// --- password hashing helpers (scrypt, built-in) ---

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- token storage shape ---

type StoredToken = {
  label: string;
  created_at: string;
  expires_at: string;
  pw_hash?: string; // scrypt salt:hash; absent = no password
};

// GET — list active share tokens
export async function GET() {
  try {
    const { data } = await db()
      .from("kv")
      .select("key, value")
      .like("key", `${KV_PREFIX}%`);

    const tokens: ShareToken[] = (data ?? [])
      .map((row): ShareToken | null => {
        try {
          const v = JSON.parse(row.value) as StoredToken;
          return {
            token: row.key.replace(KV_PREFIX, ""),
            label: v.label,
            created_at: v.created_at,
            expires_at: v.expires_at,
            protected: !!v.pw_hash,
          };
        } catch {
          return null;
        }
      })
      .filter((t): t is ShareToken => t !== null && new Date(t.expires_at) > new Date());

    return NextResponse.json(tokens);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — create a new share token (optional password)
export async function POST(req: NextRequest) {
  try {
    const { label = "Accountant", password } = await req.json().catch(() => ({}));
    const token = randomBytes(24).toString("hex");
    const now = new Date();
    const expires = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);

    const value: StoredToken = {
      label,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };
    if (password && typeof password === "string" && password.length > 0) {
      value.pw_hash = hashPassword(password);
    }

    await db().from("kv").insert({
      key: `${KV_PREFIX}${token}`,
      value: JSON.stringify(value),
    });

    return NextResponse.json(
      { token, expires_at: expires.toISOString(), protected: !!value.pw_hash },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE — revoke a token
export async function DELETE(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    await db().from("kv").delete().eq("key", `${KV_PREFIX}${token}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
