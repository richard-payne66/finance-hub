import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";

// Generates a fresh signed URL for a receipt's stored file and redirects to it.
// Using a server-side redirect means the client never holds a stale URL.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: receipt, error } = await db()
    .from("receipts")
    .select("receipt_image_url")
    .eq("id", id)
    .single();

  if (error || !receipt?.receipt_image_url) {
    return NextResponse.json({ error: "No image found for this receipt." }, { status: 404 });
  }

  const key = receipt.receipt_image_url;

  // Legacy rows may have had a full URL stored directly
  if (key.startsWith("http")) {
    return NextResponse.redirect(key);
  }

  const { data: signed, error: signErr } = await db()
    .storage.from("receipts")
    .createSignedUrl(key, 3600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not generate signed URL." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
