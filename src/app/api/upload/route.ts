import { NextRequest } from "next/server";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { getViewer } from "@/lib/auth";
import { sameOrigin } from "@/lib/request-security";
import { checkUploadQuota, completeBlobUpload, storageProvider, UploadError, validateBlobPath } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, MEDIA_EXTENSIONS, mediaType, validMediaSignature } from "@/lib/media-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new UploadError("Please connect your account first.", 401);
    const provider = storageProvider();
    if (provider === "unconfigured") throw new UploadError("Uploads need a connected Vercel Blob store. See DEPLOY_VERCEL.md.", 503);
    if (provider === "vercel-blob" && viewer.demo) throw new UploadError("Create an account or sign in before uploading to cloud storage.", 403);
    return Response.json({ provider, userId: viewer.id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      if (storageProvider() !== "vercel-blob") throw new UploadError("Connect a public Vercel Blob store and set BLOB_READ_WRITE_TOKEN first.", 503);
      const body = await request.json() as HandleUploadBody;
      const response = await handleUpload({
        body,
        request,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        onBeforeGenerateToken: async (pathname) => {
          if (!sameOrigin(request)) throw new UploadError("Invalid request origin.", 403);
          const viewer = await getViewer();
          if (!viewer || viewer.demo) throw new UploadError("Create an account or sign in before uploading.", 401);
          const { id, contentType } = validateBlobPath(pathname, viewer.id);
          await checkUploadQuota(viewer.id);
          await db.insert(uploads).values({ id, userId: viewer.id, pathname, storage: "vercel-blob", contentType }).onConflictDoNothing();
          return {
            allowedContentTypes: [contentType],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: false, // Path already contains a cryptographically random UUID.
            allowOverwrite: false,
            validUntil: Date.now() + 10 * 60000,
            tokenPayload: JSON.stringify({ userId: viewer.id }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          // This is a signed server-to-server callback, not a browser session.
          // handleUpload verifies the provider signature before invoking us.
          const identity = JSON.parse(tokenPayload || "{}");
          if (typeof identity.userId !== "string") throw new UploadError("Invalid upload owner.", 403);
          await completeBlobUpload(blob.url, identity.userId);
        },
      });
      return Response.json(response, { headers: { "Cache-Control": "no-store" } });
    }

    // Local filesystem storage is for the sandbox or a persistent Node server,
    // never a Vercel Function's read-only/ephemeral filesystem.
    if (storageProvider() !== "local") throw new UploadError("Use the direct-to-Blob uploader for this deployment.", 400);
    if (!sameOrigin(request)) throw new UploadError("Invalid request origin.", 403);
    const viewer = await getViewer();
    if (!viewer) throw new UploadError("Please connect your account first.", 401);
    if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 1024 * 1024) throw new UploadError("Keep uploads under 60 MB.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_UPLOAD_BYTES) throw new UploadError("Choose a photo or video under 60 MB.");
    const ext = MEDIA_EXTENSIONS[file.type];
    if (!ext) throw new UploadError("Use a JPG, PNG, WebP, MP4, or WebM file.");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validMediaSignature(buffer, file.type)) throw new UploadError("That file doesn't appear to be a supported photo or video.");
    await checkUploadQuota(viewer.id);
    const dir = path.join(process.cwd(), ".data", "uploads");
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const filename = `${id}.${ext}`;
    const url = `/api/media/${filename}`;
    await writeFile(path.join(dir, filename), buffer);
    try {
      await db.insert(uploads).values({ id, userId: viewer.id, pathname: filename, url, storage: "local", contentType: file.type, size: file.size, verified: true });
    } catch (error) { await rm(path.join(dir, filename), { force: true }); throw error; }
    return Response.json({ url, mediaType: mediaType(file.type) });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Upload:", error);
  return Response.json({ error: "The upload didn't finish. Please try again." }, { status: 500 });
}
