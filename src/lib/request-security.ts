import type { NextRequest } from "next/server";

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still need an authenticated session.
  try {
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
    return new URL(origin).host === host;
  } catch { return false; }
}
