import { NextRequest } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { conversations, members, messages, notifications } from "@/db/schema";
import { getViewer } from "@/lib/auth";
import { events } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let polling = false;
      const lastEvent = Number(request.headers.get("last-event-id"));
      const start = Number.isFinite(lastEvent) && lastEvent > 0 ? Math.min(Date.now(), Math.max(lastEvent, Date.now() - 300000)) : Date.now();
      let cursor = new Date(start - 5000);
      const seen = new Set<string>();
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`id: ${Date.now()}\ndata: ${JSON.stringify(payload)}\n\n`)); }
        catch { cleanup(); }
      };
      const handler = (payload: Record<string, unknown>) => send(payload);
      events.on(`user:${viewer.id}`, handler);
      controller.enqueue(encoder.encode("retry: 1500\n\n"));
      send({ type: "connected" });
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 20000);
      const poll = setInterval(async () => {
        if (polling || closed) return;
        polling = true;
        try {
          const now = new Date();
          const [recent, alerts, newChats] = await Promise.all([
            db.select({ id: messages.id, conversationId: messages.conversationId }).from(messages).innerJoin(members, eq(messages.conversationId, members.conversationId)).where(and(eq(members.userId, viewer.id), gt(messages.createdAt, cursor))).orderBy(desc(messages.createdAt)).limit(50),
            db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, viewer.id), gt(notifications.createdAt, cursor))).limit(50),
            db.select({ id: conversations.id }).from(conversations).innerJoin(members, eq(conversations.id, members.conversationId)).where(and(eq(members.userId, viewer.id), gt(conversations.createdAt, cursor))).limit(50),
          ]);
          const freshMessages = recent.filter((message) => !seen.has(message.id));
          if (freshMessages.length) send({ type: "sync", conversationIds: [...new Set(freshMessages.map((message) => message.conversationId))] });
          if (alerts.some((notification) => !seen.has(notification.id))) send({ type: "notification" });
          if (newChats.some((chat) => !seen.has(chat.id))) send({ type: "conversation" });
          for (const item of [...recent, ...alerts, ...newChats]) seen.add(item.id);
          if (seen.size > 500) seen.clear();
          // Overlap the cursor to avoid losing commits on the polling boundary.
          cursor = new Date(now.getTime() - 5000);
        } catch (error) { console.error("Realtime sync:", (error as Error).message); }
        finally { polling = false; }
      }, 2000);
      // A Vercel invocation is finite. End cleanly before its timeout and let
      // EventSource reconnect. Managed Pusher mode doesn't open this stream.
      const rotation = setTimeout(() => { send({ type: "reconnect" }); cleanup(); }, process.env.VERCEL ? 50000 : 240000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat); clearInterval(poll); clearTimeout(rotation);
        events.off(`user:${viewer.id}`, handler);
        request.signal.removeEventListener("abort", cleanup);
        try { controller.close(); } catch {}
      };
      request.signal.addEventListener("abort", cleanup);
      if (request.signal.aborted) cleanup();
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
}
