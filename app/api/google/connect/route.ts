import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorizeUrl } from "@/app/lib/google";
import { persistState } from "@/app/lib/oauth-state";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  await persistState(state, "google");
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
