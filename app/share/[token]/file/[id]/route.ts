import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/app/lib/db";
import { loadToken, cookieName, isAuthCookieValid } from "@/app/lib/share-auth";

// Public download route — validates share token + password before serving file.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;

  const meta = await loadToken(token);
  if (!meta) return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });

  // Password gate
  if (meta.pw_hash) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(cookieName(token))?.value;
    if (!isAuthCookieValid(meta, cookieValue)) {
      return NextResponse.json({ error: "Password required." }, { status: 401 });
    }
  }

  // Fetch document
  const { data: doc, error } = await db()
    .from("documents")
    .select("file_url, filename")
    .eq("id", id)
    .single();

  if (error || !doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: signed, error: signErr } = await db()
    .storage.from("documents")
    .createSignedUrl(doc.file_url, 3600, { download: doc.filename });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not generate download link." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "private, max-age=3500" },
  });
}
