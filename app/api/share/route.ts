import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

const KV_PREFIX = "share_token_";
const TTL_DAYS = 30;

export type ShareToken = {
  token: string;
  label: string;
  created_at: string;
  expires_at: string;
};

// GET — list active share tokens
export async function GET() {
  try {
    const { data } = await db()
      .from("kv")
      .select("key, value")
      .like("key", `${KV_PREFIX}%`);

    const tokens: ShareToken[] = (data ?? [])
      .map((row) => {
        try {
          const v = JSON.parse(row.value);
          return { token: row.key.replace(KV_PREFIX, ""), ...v } as ShareToken;
        } catch { return null; }
      })
      .filter((t): t is ShareToken => t !== null && new Date(t.expires_at) > new Date());

    return NextResponse.json(tokens);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — create a new share token
export async function POST(req: NextRequest) {
  try {
    const { label = "Accountant" } = await req.json().catch(() => ({}));
    const token = randomBytes(24).toString("hex");
    const now = new Date();
    const expires = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);

    await db().from("kv").insert({
      key: `${KV_PREFIX}${token}`,
      value: JSON.stringify({
        label,
        created_at: now.toISOString(),
        expires_at: expires.toISOString(),
      }),
    });

    return NextResponse.json({ token, expires_at: expires.toISOString() }, { status: 201 });
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
