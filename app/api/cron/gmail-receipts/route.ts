import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/gmail-receipts`, { method: "POST" });
  const json = await res.json();
  return NextResponse.json({ ran_at: new Date().toISOString(), result: json });
}
