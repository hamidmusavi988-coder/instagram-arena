import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, getViewer } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export async function GET(request: NextRequest) {
  const origin = (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const fail = () => NextResponse.redirect(new URL("/?auth=google-error", origin));
  try {
    const jar = await cookies();
    const state = jar.get("loop_oauth_state")?.value;
    const verifier = jar.get("loop_oauth_verifier")?.value;
    jar.delete("loop_oauth_state"); jar.delete("loop_oauth_verifier");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || !state || !verifier || state !== request.nextUrl.searchParams.get("state") || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return fail();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: "authorization_code", code_verifier: verifier }) });
    if (!tokenResponse.ok) return fail();
    const token = await tokenResponse.json();
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!response.ok) return fail();
    const info = await response.json();
    if (!info.email_verified || !info.sub || !info.email) return fail();
    await ensureSeed();
    const email = String(info.email).toLowerCase();
    let [user] = await db.select().from(users).where(or(eq(users.googleId, info.sub), eq(users.email, email))).limit(1);
    if (user) {
      [user] = await db.update(users).set({ googleId: info.sub }).where(eq(users.id, user.id)).returning();
    } else {
      const guest = await getViewer();
      const values = { email, googleId: String(info.sub), name: String(info.name || email.split("@")[0]).slice(0, 60), username: `${email.split("@")[0].replace(/[^a-z0-9._]/g, "").slice(0, 20)}.${randomUUID().slice(0, 6)}`, avatar: String(info.picture || "/images/alex.jpg"), demo: false };
      [user] = guest?.demo ? await db.update(users).set(values).where(eq(users.id, guest.id)).returning() : await db.insert(users).values({ id: randomUUID(), ...values }).returning();
    }
    await createSession(user.id);
    return NextResponse.redirect(new URL("/", origin));
  } catch (e) { console.error("Google sign-in:", e); return fail(); }
}
