import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";

export async function GET() {
  const { data } = await db()
    .from("documents")
    .select("*")
    .order("uploaded_at", { ascending: false });

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "private, max-age=0" },
  });
}
