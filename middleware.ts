import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that never require a session.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/health"];

// Paths that can bypass session auth if a valid x-api-key header is present.
const API_KEY_PATHS = ["/api/process-receipt"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Static assets — never auth-check ──────────────────────────────────────
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon-") ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  // ── Always-public paths ────────────────────────────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── API key bypass (for n8n / programmatic webhooks) ──────────────────────
  if (API_KEY_PATHS.some((p) => pathname.startsWith(p))) {
    const apiKey = request.headers.get("x-api-key");
    if (apiKey && apiKey === process.env.APP_API_KEY) {
      return NextResponse.next();
    }
  }

  // ── Session check via Supabase Auth ───────────────────────────────────────
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies onto both the request and the response so the
          // session is refreshed transparently on every request.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the session server-side — never trust the cookie alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on every route except Next.js internals.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
