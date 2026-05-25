import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";
import { apiSend as faApiSend, isConnected as faIsConnected } from "@/app/lib/freeagent";

// PATCH /api/receipts/[id]
// Body: any subset of editable fields. Whitelisted server-side so the
// caller can't accidentally (or maliciously) overwrite system columns
// like file_sha256, freeagent_url, etc.

const EDITABLE_FIELDS = new Set([
  "status",
  "supplier",
  "description",
  "supply_date",
  "currency",
  "gross_total",
  "net_total",
  "vat_total",
  "vat_rate",
  "payment_method",
  "category_url",
  "category_name",
  "is_business_card",
  "notes",
]);

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{20,40}$/i.test(id)) {
      return NextResponse.json({ error: "Bad receipt id." }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (EDITABLE_FIELDS.has(k)) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No editable fields supplied." }, { status: 400 });
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await db()
      .from("receipts")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      return errorResponse(error, 500, "Receipt update failed.");
    }
    return NextResponse.json({ receipt: data });
  } catch (err) {
    return errorResponse(err, 500, "Receipt update failed.");
  }
}

// DELETE /api/receipts/[id]
//
// Removes the receipt row from our DB. If it was already pushed to
// FreeAgent (freeagent_url is set), also DELETEs the corresponding FA
// expense — otherwise dupe cleanup just leaves orphans in FA.
//
// FA delete is best-effort: if the FA-side expense was already deleted
// or the URL is stale, we ignore the error and still remove from our
// DB. Add ?keep-fa=true if for some reason you want to keep the FA
// line and only remove our local row.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{20,40}$/i.test(id)) {
      return NextResponse.json({ error: "Bad receipt id." }, { status: 400 });
    }
    const keepFa = new URL(req.url).searchParams.get("keep-fa") === "true";

    // Look up the row first to find its freeagent_url
    const { data: row } = await db()
      .from("receipts")
      .select("id, freeagent_url")
      .eq("id", id)
      .maybeSingle();

    let faDeleted: boolean | null = null;
    let faError: string | null = null;

    if (!keepFa && row?.freeagent_url && (await faIsConnected().catch(() => false))) {
      try {
        await faApiSend(row.freeagent_url, "DELETE");
        faDeleted = true;
      } catch (err) {
        faDeleted = false;
        faError = err instanceof Error ? err.message.slice(0, 250) : String(err);
      }
    }

    const { error } = await db().from("receipts").delete().eq("id", id);
    if (error) return errorResponse(error, 500, "Receipt delete failed.");
    return NextResponse.json({ deleted: true, fa_deleted: faDeleted, fa_error: faError });
  } catch (err) {
    return errorResponse(err, 500, "Receipt delete failed.");
  }
}
