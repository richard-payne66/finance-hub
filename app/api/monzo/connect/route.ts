import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorizeUrl } from "@/app/lib/monzo";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const url = authorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set({
    name: "monzo_oauth_state",
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600, // 1 hour — Monzo's web auth + SCA push can take a while
  });
  return res;
}
