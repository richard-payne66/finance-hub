import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadDividends, saveDividends, taxYearOf, type Dividend } from "@/app/lib/dividends";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dividends = (await loadDividends()).sort((a, b) => (a.date < b.date ? 1 : -1));
    // tally current tax year
    const thisTy = taxYearOf(new Date().toISOString().slice(0, 10));
    const ytd = dividends.filter((d) => taxYearOf(d.date) === thisTy).reduce((s, d) => s + d.amount, 0);
    return NextResponse.json({ dividends, this_tax_year: thisTy, this_tax_year_total: Math.round(ytd * 100) / 100 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);
    const div: Dividend = {
      id: randomUUID(),
      date,
      amount: Math.round(amt * 100) / 100,
      note: typeof body.note === "string" ? body.note.slice(0, 200) : "",
      created_at: new Date().toISOString(),
    };
    const list = await loadDividends();
    list.push(div);
    await saveDividends(list);
    return NextResponse.json({ ok: true, dividend: div });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const list = await loadDividends();
    const next = list.filter((d) => d.id !== id);
    await saveDividends(next);
    return NextResponse.json({ ok: true, removed: list.length - next.length });
  } catch (err) {
    return errorResponse(err);
  }
}
