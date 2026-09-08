import { db } from "@/db";
import { sql } from "drizzle-orm";
import { storageProvider } from "@/lib/storage";
import { pusherConfigured } from "@/lib/pusher";
import { sampleContentEnabled } from "@/lib/demo-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const tables = ["loop_users", "loop_sessions", "loop_posts", "loop_likes", "loop_saves", "loop_follows", "loop_comments", "loop_conversations", "loop_members", "loop_messages", "loop_notifications", "loop_push_subscriptions", "loop_app_settings", "loop_uploads"];
    const checks = tables.map((name) => sql`to_regclass(${`public.${name}`}) is not null`);
    const result = await db.execute<{ ready: boolean }>(sql`select (${sql.join(checks, sql` and `)}) as ready`);
    const ready = result.rows[0]?.ready === true;
    const storage = storageProvider();
    const ok = ready && storage !== "unconfigured";
    return Response.json({
      ok,
      database: "connected",
      schema: ready ? "ready" : "missing-tables",
      storage,
      realtime: pusherConfigured() ? "pusher" : "sse",
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      sampleContentEnabled: sampleContentEnabled(),
      externalProviderConnections: "not-probed",
      ...(!ready ? { hint: "Apply the schema to this database using drizzle.config.ts." } : storage === "unconfigured" ? { hint: "Connect a public Vercel Blob store and set BLOB_READ_WRITE_TOKEN." } : {}),
    }, { status: ok ? 200 : 503, headers });
  } catch {
    return Response.json({ ok: false, database: "unavailable", hint: "Check the hosted database connection and server logs. No credentials are exposed by this endpoint." }, { status: 503, headers });
  }
}
