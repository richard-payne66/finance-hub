import { NextRequest, NextResponse } from "next/server";
import { getExpenses, createExpense, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const expenses = await getExpenses();
    return NextResponse.json({ expenses });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ expenses: [], setupNeeded: true });
    return errorResponse(err);
  }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const expense = await createExpense(body);
    return NextResponse.json({ expense });
  } catch (err) { return errorResponse(err); }
}
