import { NextRequest, NextResponse } from "next/server";
import { getAccountantInbox, dismiss, clearDismissed } from "@/app/lib/accountant-actions";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET             → cached inbox (rebuilds if stale)
// POST            → force a fresh scan
// DELETE ?id=...  → dismiss one email's action items
// DELETE ?id=all  → clear all dismissals (un-hide everything)

export async function GET() {
  try {
    return NextResponse.json(await getAccountantInbox());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST() {
  try {
    return NextResponse.json(await getAccountantInbox({ force: true }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    if (id === "all") await clearDismissed();
    else await dismiss(id);
    return NextResponse.json(await getAccountantInbox());
  } catch (e) {
    return errorResponse(e);
  }
}
