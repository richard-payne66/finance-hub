import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/app/lib/google";
import { consumeState } from "@/app/lib/oauth-state";

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/?google=error&reason=${encodeURIComponent(error)}`, req.url));
  if (!code || !state) return NextResponse.redirect(new URL("/?google=error&reason=no_code", req.url));

  const cookieStore = await cookies();
  const cookieState = cookieStore.get("google_oauth_state")?.value;
  const cookieMatch = cookieState && cookieState === state;
  const kvMatch = await consumeState(state, "google");

  if (!cookieMatch && !kvMatch) {
    return NextResponse.redirect(new URL("/?google=error&reason=bad_state", req.url));
  }

  try {
    await exchangeCode(code);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(new URL(`/?google=error&reason=${encodeURIComponent(reason)}`, req.url));
  }

  const res = NextResponse.redirect(new URL("/?google=connected", req.url));
  res.cookies.delete("google_oauth_state");
  return res;
}
