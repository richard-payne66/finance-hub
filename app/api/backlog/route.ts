import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

export type BacklogItem = {
  id: string;
  text: string;
  done: boolean;
  added_at: string;
};

const KV_KEY = "site_backlog";

async function readItems(): Promise<BacklogItem[]> {
  const { data } = await db()
    .from("kv")
    .select("value")
    .eq("key", KV_KEY)
    .maybeSingle();
  if (!data?.value) return [];
  try {
    return JSON.parse(data.value) as BacklogItem[];
  } catch {
    return [];
  }
}

async function writeItems(items: BacklogItem[]): Promise<void> {
  await db()
    .from("kv")
    .upsert({ key: KV_KEY, value: JSON.stringify(items) }, { onConflict: "key" });
}

export async function GET() {
  try {
    return NextResponse.json(await readItems());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const items = await readItems();
    const next: BacklogItem = {
      id: randomUUID(),
      text: text.trim(),
      done: false,
      added_at: new Date().toISOString(),
    };
    await writeItems([next, ...items]);
    return NextResponse.json(next, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const items = await readItems();
    const updated = items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
    await writeItems(updated);
    return NextResponse.json(updated.find((i) => i.id === id) ?? null);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const items = await readItems();
    await writeItems(items.filter((i) => i.id !== id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
