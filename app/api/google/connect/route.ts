import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorizeUrl } from "@/app/lib/google";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const url = authorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set({
    name: "google_oauth_state",
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  return res;
}
