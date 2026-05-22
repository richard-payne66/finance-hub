import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/app/api/share/route";
import { loadToken, cookieName } from "@/app/lib/share-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { password } = await req.json().catch(() => ({}));

  const meta = await loadToken(token);
  if (!meta) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });
  }
  if (!meta.pw_hash) {
    return NextResponse.json({ ok: true }); // no password required
  }
  if (typeof password !== "string" || !verifyPassword(password, meta.pw_hash)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  // Set httpOnly cookie with the password — server re-validates on every request.
  // Expires when the share token expires.
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName(token),
    value: password,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/share/${token}`,
    expires: new Date(meta.expires_at),
  });
  return res;
}
