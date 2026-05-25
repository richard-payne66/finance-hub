import { NextRequest, NextResponse } from "next/server";
import { getMigrationStatus, runPendingMigrations } from "@/app/lib/migrations";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET → current status of all numbered db/*.sql files
export async function GET() {
  try {
    return NextResponse.json(await getMigrationStatus());
  } catch (err) {
    return errorResponse(err, 500, "Could not load migration status.");
  }
}

// POST → run all pending migrations
export async function POST(_req: NextRequest) {
  try {
    const results = await runPendingMigrations();
    const failed = results.find((r) => !r.ok);
    if (failed) {
      return NextResponse.json(
        {
          results,
          error: `Migration ${failed.filename} failed.`,
          detail: failed.error,
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ results, ok: true });
  } catch (err) {
    return errorResponse(err, 500, "Migration run failed.");
  }
}
