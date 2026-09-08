import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, pushSubscriptions } from "@/db/schema";

export async function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const [stored] = await db.select().from(appSettings).where(eq(appSettings.key, "vapid")).limit(1);
  if (stored) return { publicKey: stored.value.publicKey, privateKey: stored.value.privateKey };
  const generated = webpush.generateVAPIDKeys();
  await db.insert(appSettings).values({ key: "vapid", value: { publicKey: generated.publicKey, privateKey: generated.privateKey } }).onConflictDoNothing();
  const [saved] = await db.select().from(appSettings).where(eq(appSettings.key, "vapid")).limit(1);
  return { publicKey: saved.value.publicKey, privateKey: saved.value.privateKey };
}
export async function pushToUser(userId: string, title: string, body: string, url = "/?view=notifications") {
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (!subscriptions.length) return;
  const keys = await getVapidKeys();
  await Promise.all(subscriptions.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title, body, url }), { vapidDetails: { subject: process.env.VAPID_SUBJECT || "mailto:hello@loop.social", ...keys }, timeout: 5000 });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
    }
  }));
}
