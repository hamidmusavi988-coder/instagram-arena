import { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { completeBlobUpload, UploadError } from "@/lib/storage";
import { sameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new UploadError("Invalid request origin.", 403);
    const viewer = await getViewer();
    if (!viewer || viewer.demo) throw new UploadError("Please sign in before completing an upload.", 401);
    const body = await request.json();
    if (typeof body.url !== "string" || body.url.length > 2048) throw new UploadError("Invalid upload URL.");
    // Client completion handles callbacks that arrive late or cannot reach a
    // protected preview. The server independently verifies metadata and bytes.
    const result = await completeBlobUpload(body.url, viewer.id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Upload verification:", error);
    return Response.json({ error: "Couldn't verify the uploaded file. Please try again." }, { status: 500 });
  }
}
