"use client";
import { MAX_UPLOAD_BYTES, MEDIA_EXTENSIONS, mediaType } from "@/lib/media-validation";

type UploadResult = { url: string; mediaType: string };
async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The upload didn't finish. Please try again.");
  return result;
}
export async function uploadFile(file: File, onProgress?: (percentage: number) => void): Promise<UploadResult> {
  const extension = MEDIA_EXTENSIONS[file.type];
  if (!extension || !file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Choose a JPG, PNG, WebP, MP4, or WebM file under 60 MB.");
  onProgress?.(0);
  const config = await json<{ provider: "vercel-blob" | "local"; userId: string }>("/api/upload");
  if (config.provider === "vercel-blob") {
    const { upload } = await import("@vercel/blob/client");
    const pathname = `loop/${config.userId}/${crypto.randomUUID()}.${extension}`;
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: file.type,
      multipart: file.size > 5 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.min(99, Math.round(percentage))),
    });
    const verified = await json<UploadResult>("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blob.url }),
    });
    onProgress?.(100);
    return verified;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.timeout = 120000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error("Your connection dropped. Please try the upload again."));
    xhr.ontimeout = () => reject(new Error("The upload took too long. Please try again."));
    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve({ ...response, mediaType: mediaType(file.type) });
        else reject(new Error(response.error || "The upload didn't finish."));
      } catch { reject(new Error("The upload didn't finish. Please try again.")); }
    };
    const form = new FormData(); form.append("file", file); xhr.send(form);
  });
}
