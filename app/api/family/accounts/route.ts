import { NextRequest, NextResponse } from "next/server";
import { getAccounts, createAccount, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const accounts = await getAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ accounts: [], setupNeeded: true });
    return errorResponse(err);
  }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const account = await createAccount(body);
    return NextResponse.json({ account });
  } catch (err) { return errorResponse(err); }
}
