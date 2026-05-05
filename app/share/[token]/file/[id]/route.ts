import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";

// Public download route — validates share token before serving file.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;

  // Validate token
  const { data: kv } = await db()
    .from("kv")
    .select("value")
    .eq("key", `share_token_${token}`)
    .maybeSingle();

  if (!kv) return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });

  try {
    const meta = JSON.parse(kv.value);
    if (new Date(meta.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link has expired." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid link." }, { status: 403 });
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
