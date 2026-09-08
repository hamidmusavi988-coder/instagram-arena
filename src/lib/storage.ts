import { and, count, eq, gt } from "drizzle-orm";
import { head, del } from "@vercel/blob";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { MAX_UPLOAD_BYTES, MEDIA_EXTENSIONS, mediaType, validMediaSignature } from "@/lib/media-validation";

export class UploadError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "UploadError"; }
}
export function storageProvider(): "vercel-blob" | "local" | "unconfigured" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  return process.env.VERCEL ? "unconfigured" : "local";
}
export async function checkUploadQuota(userId: string) {
  const [usage] = await db.select({ total: count() }).from(uploads).where(and(eq(uploads.userId, userId), gt(uploads.createdAt, new Date(Date.now() - 86400000))));
  if (usage.total >= 50) throw new UploadError("You've reached today's 50-upload limit. Please try again tomorrow.", 429);
}
export function validateBlobPath(pathname: string, userId: string) {
  const prefix = `loop/${userId}/`;
  if (!pathname.startsWith(prefix)) throw new UploadError("You can only upload to your own media folder.", 403);
  const match = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(jpg|png|webp|mp4|webm)$/.exec(pathname.slice(prefix.length));
  if (!match) throw new UploadError("Choose a supported photo or video file.");
  const contentType = Object.entries(MEDIA_EXTENSIONS).find(([, ext]) => ext === match[2])![0];
  return { id: match[1], contentType };
}
function publicBlobPath(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new UploadError("Invalid upload URL."); }
  if (url.protocol !== "https:" || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash) throw new UploadError("Use a file uploaded to this app's public Blob store.");
  return url.pathname.slice(1);
}
async function readSignature(url: string) {
  const response = await fetch(url, { headers: { Range: "bytes=0-11" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.body) throw new UploadError("The uploaded file isn't available yet. Please try again.", 503);
  const reader = response.body.getReader();
  const signature = new Uint8Array(12);
  let offset = 0;
  try {
    while (offset < signature.length) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const part = chunk.value.subarray(0, signature.length - offset);
      signature.set(part, offset); offset += part.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return signature.subarray(0, offset);
}
export async function completeBlobUpload(url: string, userId: string) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new UploadError("Persistent media storage is not configured.", 503);
  const pathname = publicBlobPath(url);
  validateBlobPath(pathname, userId);
  const [upload] = await db.select().from(uploads).where(and(eq(uploads.pathname, pathname), eq(uploads.userId, userId), eq(uploads.storage, "vercel-blob"))).limit(1);
  if (!upload) throw new UploadError("This upload doesn't belong to your account. Please upload it again.", 404);
  if (upload.verified && upload.url === url) return { url, mediaType: mediaType(upload.contentType) };

  // Query by pathname against OUR authenticated store, never trust the host or
  // Content-Type supplied by a browser. Fetch only a tiny signature afterwards.
  const blob = await head(pathname, { token, abortSignal: AbortSignal.timeout(12000) });
  if (blob.pathname !== pathname || blob.url !== url) throw new UploadError("This file is not in this app's media store.", 403);
  publicBlobPath(blob.url);
  const correctMetadata = blob.size > 0 && blob.size <= MAX_UPLOAD_BYTES && blob.contentType.split(";")[0] === upload.contentType;
  const signatureValid = correctMetadata && validMediaSignature(await readSignature(blob.url), upload.contentType);
  if (!signatureValid) {
    await del(blob.url, { token }).catch(() => {});
    throw new UploadError("That file isn't a supported photo or video under 60 MB. Please choose another file.");
  }
  await db.update(uploads).set({ url: blob.url, size: blob.size, verified: true }).where(eq(uploads.id, upload.id));
  return { url: blob.url, mediaType: mediaType(upload.contentType) };
}
export async function ownedUpload(userId: string, url: string, imageOnly = false) {
  const [upload] = await db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.url, url), eq(uploads.verified, true))).limit(1);
  if (!upload || (imageOnly && mediaType(upload.contentType) !== "image")) throw new UploadError(imageOnly ? "Upload a photo from your account first." : "Upload and finish verifying a photo or video from your account first.");
  return { url: upload.url!, mediaType: mediaType(upload.contentType) };
}
