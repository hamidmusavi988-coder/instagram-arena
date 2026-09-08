import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";

export async function GET(request: NextRequest) {
  const origin = (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, "");
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL("/?auth=google-unavailable", origin));
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 600, path: "/" };
  jar.set("loop_oauth_state", state, options);
  jar.set("loop_oauth_verifier", verifier, options);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/api/auth/google/callback`, response_type: "code", scope: "openid email profile", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "select_account" }).toString();
  return NextResponse.redirect(url);
}
