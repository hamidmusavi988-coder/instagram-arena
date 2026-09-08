import { cookies } from "next/headers";
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions, follows, conversations, members, messages, notifications } from "@/db/schema";
import { ensureSeed } from "@/lib/seed";
import { sampleContentEnabled } from "@/lib/demo-content";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export async function getViewer() {
  const token = (await cookies()).get("loop_session")?.value;
  if (!token) return null;
  const [row] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.token, hashToken(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row?.user ?? null;
}
export async function createSession(userId: string) {
  const jar = await cookies();
  const old = jar.get("loop_session")?.value;
  if (old) await db.delete(sessions).where(eq(sessions.token, hashToken(old)));
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ token: hashToken(token), userId, expiresAt: new Date(Date.now() + 30 * 86400000) });
  jar.set("loop_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
}
export async function clearSession() {
  const jar = await cookies();
  const token = jar.get("loop_session")?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, hashToken(token)));
  jar.delete("loop_session");
}
export async function ensureViewer() {
  await ensureSeed();
  const current = await getViewer();
  if (current) return current;
  const id = randomUUID();
  const samples = sampleContentEnabled();
  const [viewer] = await db.insert(users).values({
    id, username: samples ? `alex.m_${id.slice(0, 6)}` : `guest_${id.slice(0, 12)}`,
    name: samples ? "Alex Morgan" : "Guest", avatar: samples ? "/images/alex.jpg" : "/icon.svg",
    bio: samples ? "Finding the good in the everyday. ☀️\nDesign, coffee & places I've never been." : "",
    location: samples ? "Brooklyn, NY" : "", demo: true,
  }).returning();
  if (samples) {
    await db.insert(follows).values(["olivia", "emma", "noah"].map((followingId) => ({ followerId: id, followingId })));
    const starters = [
      { person: "emma", text: "Hey! That coast is officially on my bucket list. 🌊", time: 8 },
      { person: "noah", text: "A little inspiration for your next creative day ✨", time: 32 },
      { person: "mia", text: "Welcome to your little corner of Loop! 👋", time: 60 },
    ];
    for (const starter of starters) {
      const conversationId = randomUUID();
      await db.insert(conversations).values({ id: conversationId });
      await db.insert(members).values([{ conversationId, userId: id }, { conversationId, userId: starter.person }]);
      await db.insert(messages).values({ id: randomUUID(), conversationId, senderId: starter.person, text: starter.text, createdAt: new Date(Date.now() - starter.time * 60000) });
    }
  }
  await db.insert(notifications).values({ id: randomUUID(), userId: id, actorId: samples ? "emma" : null, kind: "welcome", text: "Welcome to Loop! Your people and your next favorite moment are right here." });
  await createSession(id);
  return viewer;
}
