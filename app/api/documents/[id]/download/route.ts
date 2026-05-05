import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";

const TTL = 3600; // 1 hour signed URL

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: doc, error } = await db()
    .from("documents")
    .select("file_url, filename")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: signed, error: signErr } = await db()
    .storage.from("documents")
    .createSignedUrl(doc.file_url, TTL, {
      download: doc.filename, // tells browser to download with original filename
    });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not generate download link." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "private, max-age=3500" },
  });
}
