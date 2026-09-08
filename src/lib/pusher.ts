import Pusher from "pusher";

let client: Pusher | null = null;
export function pusherConfigured() {
  return Boolean(process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER);
}
export function userChannel(userId: string) { return `private-loop-user-${userId}`; }
export function getPusher() {
  if (!pusherConfigured()) return null;
  if (!client) client = new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true,
    timeout: 5000,
  });
  return client;
}
