import { NextResponse } from "next/server";
import { isConnected as faConnected } from "@/app/lib/freeagent";
import { autoApproveGuesses } from "@/app/lib/auto-approve";
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 300;

// POST — confirm FreeAgent's confident/safe guesses; hold the judgement calls.
export async function POST() {
  try {
    if (!(await faConnected())) {
      return NextResponse.json({ error: "FreeAgent not connected." }, { status: 400 });
    }
    const result = await autoApproveGuesses();
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
