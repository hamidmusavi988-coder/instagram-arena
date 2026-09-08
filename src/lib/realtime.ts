import { EventEmitter } from "node:events";
import { after } from "next/server";
import { getPusher, userChannel } from "@/lib/pusher";

const globalEvents = globalThis as typeof globalThis & { loopEvents?: EventEmitter };
export const events = globalEvents.loopEvents ??= new EventEmitter().setMaxListeners(1000);
export function publish(userId: string, payload: Record<string, unknown>) {
  // Immediate delivery on a persistent Node server or within one warm instance.
  events.emit(`user:${userId}`, payload);
  const pusher = getPusher();
  if (!pusher) return;
  // The provider receives only a change notification, never the message text.
  // Clients fetch the actual content from our membership-checked database API.
  const notification = payload.type === "message"
    ? { type: "sync", conversationIds: [payload.conversationId] }
    : payload;
  after(async () => {
    try { await pusher.trigger(userChannel(userId), "loop-update", notification); }
    catch (error) { console.error("Live delivery failed; database reconciliation remains available:", (error as Error).message); }
  });
}
