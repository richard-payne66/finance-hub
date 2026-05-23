import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorizeUrl } from "@/app/lib/freeagent";
import { persistState } from "@/app/lib/oauth-state";

// Kick off OAuth — redirect the user to FreeAgent's approval page.
export async function GET() {
  const state = randomBytes(16).toString("hex");
  await persistState(state, "freeagent");
  const url = authorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set({
    name: "fa_oauth_state",
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  return res;
}
