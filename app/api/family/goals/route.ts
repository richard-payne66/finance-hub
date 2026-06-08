import { NextRequest, NextResponse } from "next/server";
import { getGoals, createGoal, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const goals = await getGoals();
    return NextResponse.json({ goals });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ goals: [], setupNeeded: true });
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const goal = await createGoal(body);
    return NextResponse.json({ goal });
  } catch (err) { return errorResponse(err); }
}
