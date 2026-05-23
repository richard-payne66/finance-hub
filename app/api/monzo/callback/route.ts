import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/app/lib/monzo";
import { consumeState } from "@/app/lib/oauth-state";

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?monzo=error&reason=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?monzo=error&reason=no_code", req.url));
  }

  // Accept either source of state: cookie OR Supabase-persisted record.
  // Chrome's strict cookie policy can drop the cookie during the third-party
  // OAuth redirect chain, so we fall back to the server-side store.
  const cookieStore = await cookies();
  const cookieState = cookieStore.get("monzo_oauth_state")?.value;
  const cookieMatch = cookieState && cookieState === state;
  const kvMatch = await consumeState(state, "monzo");

  if (!cookieMatch && !kvMatch) {
    return NextResponse.redirect(new URL("/?monzo=error&reason=bad_state", req.url));
  }

  try {
    await exchangeCode(code);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(new URL(`/?monzo=error&reason=${encodeURIComponent(reason)}`, req.url));
  }

  const res = NextResponse.redirect(new URL("/?monzo=connected", req.url));
  res.cookies.delete("monzo_oauth_state");
  return res;
}
