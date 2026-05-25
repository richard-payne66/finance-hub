import { NextResponse } from "next/server";

export function errorResponse(
  err: unknown,
  status: number = 500,
  publicMessage: string = "Something went wrong on the server."
): NextResponse {
  console.error("API error:", err);
  // Single-user app behind Vercel Deployment Protection — exposing the
  // underlying detail in responses is fine and makes browser-side debugging
  // dramatically faster than waiting on log access.
  const detail = err instanceof Error ? err.message : String(err);
  return NextResponse.json(
    { error: publicMessage, detail: detail.slice(0, 800) },
    { status }
  );
}
