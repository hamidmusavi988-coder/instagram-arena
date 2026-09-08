export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
export const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
export const MEDIA_CONTENT_TYPES = Object.keys(MEDIA_EXTENSIONS);
export function mediaType(contentType: string): "image" | "video" {
  return contentType.startsWith("video/") ? "video" : "image";
}
export function validMediaSignature(bytes: Uint8Array, contentType: string) {
  const same = (values: number[], offset = 0) => values.every((value, i) => bytes[offset + i] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  switch (contentType) {
    case "image/jpeg": return same([255, 216, 255]);
    case "image/png": return same([137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "video/mp4": return ascii(4, 8) === "ftyp";
    case "video/webm": return same([26, 69, 223, 163]);
    default: return false;
  }
}
