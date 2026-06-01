import { NextResponse } from "next/server";
import { getDigest, type DigestData } from "@/app/lib/digest";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";

// Computation lives in app/lib/digest.ts so the /digest page can call it
// directly (self-fetching this route goes through auth middleware and 500s).
export type { DigestData };

export async function GET(req: Request) {
  try {
    const monthsBack = Math.max(0, parseInt(new URL(req.url).searchParams.get("monthsBack") ?? "0"));
    return NextResponse.json<DigestData>(await getDigest(monthsBack));
  } catch (err) {
    return errorResponse(err);
  }
}
