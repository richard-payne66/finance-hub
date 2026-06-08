import { NextRequest, NextResponse } from "next/server";
import { getDocuments, createDocument, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const documents = await getDocuments();
    return NextResponse.json({ documents });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ documents: [], setupNeeded: true });
    return errorResponse(err);
  }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const document = await createDocument(body);
    return NextResponse.json({ document });
  } catch (err) { return errorResponse(err); }
}
