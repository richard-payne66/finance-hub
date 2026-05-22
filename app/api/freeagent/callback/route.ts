import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/app/lib/freeagent";

// Receives the OAuth code, exchanges for tokens, stores them, redirects home.
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?fa=error&reason=${encodeURIComponent(error)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?fa=error&reason=no_code", req.url));
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("fa_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/?fa=error&reason=bad_state", req.url));
  }

  try {
    await exchangeCode(code);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(`/?fa=error&reason=${encodeURIComponent(reason)}`, req.url)
    );
  }

  const res = NextResponse.redirect(new URL("/?fa=connected", req.url));
  res.cookies.delete("fa_oauth_state");
  return res;
}
