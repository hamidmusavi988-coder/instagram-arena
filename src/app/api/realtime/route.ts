import { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { getPusher, pusherConfigured, userChannel } from "@/lib/pusher";
import { sameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const viewer = await getViewer();
    if (!viewer) return Response.json({ error: "Please sign in." }, { status: 401 });
    const config = pusherConfigured()
      ? { provider: "pusher", key: process.env.PUSHER_KEY, cluster: process.env.PUSHER_CLUSTER, channel: userChannel(viewer.id) }
      : { provider: "sse" };
    return Response.json(config, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Couldn't connect to live updates." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    const viewer = await getViewer();
    if (!viewer) return Response.json({ error: "Please sign in." }, { status: 401 });
    const form = await request.formData();
    const socketId = form.get("socket_id");
    const channel = form.get("channel_name");
    // Never accept a client-selected identity or another user's channel.
    if (typeof socketId !== "string" || !/^\d{1,30}\.\d{1,30}$/.test(socketId) || channel !== userChannel(viewer.id)) return Response.json({ error: "This channel is not available to your account." }, { status: 403 });
    const pusher = getPusher();
    if (!pusher) return Response.json({ error: "Managed realtime is not configured. SSE is available." }, { status: 503 });
    return Response.json(pusher.authorizeChannel(socketId, channel), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Couldn't authorize this live connection." }, { status: 400 }); }
}
