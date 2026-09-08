import { NextRequest } from "next/server";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const location = path.join(process.cwd(), ".data", "uploads", file);
    const info = await stat(location);
    const types: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };
    const headers: Record<string, string> = { "Content-Type": types[file.split(".").pop()!], "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" };
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (start >= info.size || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      headers["Content-Length"] = String(end - start + 1);
      return new Response(Readable.toWeb(createReadStream(location, { start, end })) as ReadableStream, { status: 206, headers });
    }
    headers["Content-Length"] = String(info.size);
    return new Response(Readable.toWeb(createReadStream(location)) as ReadableStream, { headers });
  } catch { return new Response("Not found", { status: 404 }); }
}
