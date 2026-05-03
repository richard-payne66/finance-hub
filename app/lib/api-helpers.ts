import { NextResponse } from "next/server";

export function errorResponse(
  err: unknown,
  status: number = 500,
  publicMessage: string = "Something went wrong on the server."
): NextResponse {
  console.error("API error:", err);
  return NextResponse.json({ error: publicMessage }, { status });
}
