import { NextRequest, NextResponse } from "next/server";
import { approveReceipt } from "@/app/lib/receipt-approve";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";

// POST /api/receipts/[id]/approve
// Used by the Approve button on /receipts and /receipts/[id]. Idempotent —
// if the receipt is already approved + pushed, we don't push again.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{20,40}$/i.test(id)) {
      return NextResponse.json({ error: "Bad receipt id." }, { status: 400 });
    }
    const result = await approveReceipt(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return errorResponse(err, 500, "Approve failed.");
  }
}
