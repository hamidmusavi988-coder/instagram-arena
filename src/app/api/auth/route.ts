import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clearSession, createSession, getViewer, hashPassword, verifyPassword } from "@/lib/auth";
import { publicUser } from "@/lib/data";
import { ensureSeed } from "@/lib/seed";

const attempts = new Map<string, { count: number; reset: number }>();
export async function POST(request: NextRequest) {
  const error = (message: string, status = 400) => Response.json({ error: message }, { status });
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== (request.headers.get("x-forwarded-host") || request.headers.get("host"))) return error("Invalid request origin.", 403);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
    const previous = attempts.get(ip);
    const limit = previous && previous.reset > Date.now() ? previous : { count: 0, reset: Date.now() + 900000 };
    limit.count++;
    attempts.set(ip, limit);
    if (limit.count > 20) return error("Too many attempts. Please try again in 15 minutes.", 429);
    const body = await request.json();
    if (body.action === "logout") { await clearSession(); return Response.json({ ok: true }); }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) return error("Enter a valid email and a password with 8–128 characters.");
    await ensureSeed();
    if (body.action === "login") {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) return error("That email and password don't match. Try again.", 401);
      await createSession(user.id);
      return Response.json({ viewer: publicUser(user) });
    }
    if (body.action !== "register") return error("Unknown action.");
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    if (!name || !/^[a-z0-9._]{3,30}$/.test(username)) return error("Choose a name and a username with 3–30 letters, numbers, dots, or underscores.");
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (exists) return error("An account already uses this email. Try signing in.", 409);
    const guest = await getViewer();
    const values = { email, username, name, passwordHash: hashPassword(password), demo: false };
    const [user] = guest?.demo
      ? await db.update(users).set(values).where(eq(users.id, guest.id)).returning()
      : await db.insert(users).values({ id: randomUUID(), ...values }).returning();
    await createSession(user.id);
    return Response.json({ viewer: publicUser(user) });
  } catch (e) {
    const code = (e as { cause?: { code?: string }; code?: string }).cause?.code || (e as { code?: string }).code;
    if (code === "23505") return error("That username or email is already in use.", 409);
    console.error("Auth error:", e);
    return error("Couldn't sign you in. Please try again.", 500);
  }
}
