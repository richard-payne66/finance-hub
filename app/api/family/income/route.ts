import { NextRequest, NextResponse } from "next/server";
import { getIncome, createIncome, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const income = await getIncome();
    return NextResponse.json({ income });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ income: [], setupNeeded: true });
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const item = await createIncome(body);
    return NextResponse.json({ income: item });
  } catch (err) { return errorResponse(err); }
}
