import { NextRequest, NextResponse } from "next/server";
import { autoApproveGuesses } from "@/app/lib/auto-approve";

// Nightly auto-approve of FreeAgent's confident bank-transaction guesses.
// Protected by CRON_SECRET (Vercel sends Authorization: Bearer $CRON_SECRET).
// /api/cron/* is exempted from the Supabase session gate in middleware so this
// can run unattended — the secret check here is the real guard.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await autoApproveGuesses();
    return NextResponse.json({ ran_at: new Date().toISOString(), result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
