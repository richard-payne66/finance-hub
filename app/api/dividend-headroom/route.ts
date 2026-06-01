import { NextResponse } from "next/server";
import { getDividendHeadroom, type DividendHeadroom } from "@/app/lib/headroom";
import { errorResponse } from "@/app/lib/api-helpers";

// Computation lives in app/lib/headroom.ts so the butler chat's
// financial_position tool reads the exact same numbers. Re-export the type
// for existing importers (e.g. DividendCard).
export type { DividendHeadroom };

export async function GET() {
  try {
    return NextResponse.json<DividendHeadroom>(await getDividendHeadroom());
  } catch (err) {
    return errorResponse(err);
  }
}
