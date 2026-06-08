import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// Direct-to-Blob upload for family statements (PDFs + images). Bypasses the
// 4.5MB API body cap so multi-page bank/pension statements work. Mirrors the
// upload-video route's handleUpload flow.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
          "image/heic",
          "image/heif",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 50 * 1024 * 1024, // 50MB per statement
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
