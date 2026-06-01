import { NextRequest, NextResponse } from "next/server";
import { reconcileQueue } from "@/app/lib/queue-reconcile";

// Vercel cron route. Vercel sets the Authorization: Bearer $CRON_SECRET
// header for cron-triggered invocations when one is configured. If you
// haven't set CRON_SECRET this route is still callable but unauthenticated
// — fine for a single-user app.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Call our own auto-categorise POST endpoint to pull + classify new txns
  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/auto-categorise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 100 }),
  });
  const json = await res.json();

  // Then reconcile the queue: drop anything already handled in FA and
  // auto-book any queued items that now match a learned rule.
  const reconcile = await reconcileQueue({ max: 200 }).catch((e) => ({
    error: e instanceof Error ? e.message : String(e),
  }));

  return NextResponse.json({ ran_at: new Date().toISOString(), result: json, reconcile });
}
