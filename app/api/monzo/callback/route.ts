import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/app/lib/monzo";

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?monzo=error&reason=${encodeURIComponent(error)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?monzo=error&reason=no_code", req.url));
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("monzo_oauth_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/?monzo=error&reason=bad_state", req.url));
  }

  try {
    await exchangeCode(code);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(new URL(`/?monzo=error&reason=${encodeURIComponent(reason)}`, req.url));
  }

  // Note: at this point token is exchanged but NOT yet "strongly authenticated".
  // The user needs to tap the approval push in their Monzo app before any
  // /accounts or /pots call will succeed. The pots endpoint surfaces a
  // 'sca_required' state that the UI translates into "check your phone".
  const res = NextResponse.redirect(new URL("/?monzo=connected", req.url));
  res.cookies.delete("monzo_oauth_state");
  return res;
}
