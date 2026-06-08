import { NextRequest, NextResponse } from "next/server";
import { listUpgrades, addUpgrade, updateUpgrade, removeUpgrade } from "@/app/lib/upgrades";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";

// Backed by the dedicated `upgrades` table.
// GET ?page=/x  → upgrades for that page (newest first); GET → all
// POST {page,text}        → add a pending upgrade
// PATCH {id,status,note}  → mark done/pending (+ optional note)
// DELETE ?id=x            → remove

export async function GET(req: NextRequest) {
  try {
    const page = new URL(req.url).searchParams.get("page") || undefined;
    return NextResponse.json(await listUpgrades(page));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const page = String(body.page ?? "").trim();
    const text = String(body.text ?? "").trim();
    if (!page || !text) return NextResponse.json({ error: "page and text required" }, { status: 400 });
    const u = await addUpgrade(page, text);
    return NextResponse.json(u, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const u = await updateUpgrade(id, { status: body.status, note: body.note });
    if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(u);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await removeUpgrade(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
