import { NextRequest, after } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, posts, likes, saves, comments, follows, conversations, members, messages, notifications, pushSubscriptions } from "@/db/schema";
import { ensureViewer, getViewer } from "@/lib/auth";
import { getBootstrap, getFeed, getPeople, getProfile, getChats, getMessages, getNotifications, getTrendingHashtags, getInsights, recordView, publicUser } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime";
import { getVapidKeys, pushToUser } from "@/lib/push";
import { ownedUpload, UploadError } from "@/lib/storage";

export const dynamic = "force-dynamic";
const error = (message: string, status = 400) => Response.json({ error: message }, { status });
const text = (value: unknown, max = 2200) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: NextRequest) {
  try {
    const viewer = await ensureViewer();
    const p = request.nextUrl.searchParams;
    switch (p.get("resource") || "bootstrap") {
      case "bootstrap": return Response.json(await getBootstrap(viewer));
      case "feed": return Response.json({ posts: await getFeed(viewer.id, { saved: p.get("saved") === "true", following: p.get("following") === "true", query: p.get("q") || undefined, before: p.get("before") || undefined, limit: p.get("limit") ? Number(p.get("limit")) : undefined, random: !(p.get("saved") === "true" || p.get("following") === "true" || p.get("q")) }) });
      case "trending": return Response.json({ trending: await getTrendingHashtags() });
      case "insights": return Response.json({ insights: await getInsights(viewer.id) });
      case "search": {
        const q = (p.get("q") || "").slice(0, 100).replace(/^#/, "");
        const [people, feed] = await Promise.all([getPeople(viewer.id, q), getFeed(viewer.id, { query: q })]);
        return Response.json({ people, posts: feed });
      }
      case "profile": {
        const profile = await getProfile(p.get("id") || viewer.id, viewer.id);
        return profile ? Response.json(profile) : error("This profile could not be found.", 404);
      }
      case "chats": return Response.json({ chats: await getChats(viewer.id) });
      case "messages": {
        const result = await getMessages(viewer.id, p.get("id") || "");
        return result ? Response.json({ messages: result }) : error("Conversation not found.", 404);
      }
      case "notifications": return Response.json({ notifications: await getNotifications(viewer.id) });
      case "push-key": return Response.json({ publicKey: (await getVapidKeys()).publicKey });
      default: return error("Unknown resource.", 404);
    }
  } catch (e) {
    console.error("Loop API GET:", e);
    return error("Couldn't load this just now. Please try again.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try { originHost = new URL(origin).host; } catch { return error("Invalid request origin.", 403); }
      if (originHost !== (request.headers.get("x-forwarded-host") || request.headers.get("host"))) return error("Invalid request origin.", 403);
    }
    const viewer = await getViewer();
    if (!viewer) return error("Please refresh to connect your session.", 401);
    // Anti-abuse: a generous overall budget per account, plus a stricter
    // budget for creating content (posts, comments, messages).
    const general = rateLimit(`social:${viewer.id}`, 300, 5 * 60 * 1000);
    if (!general.ok) return error(`Too many actions. Please slow down and try again in ${general.retryAfterSeconds}s.`, 429);
    if (process.env.VERCEL && viewer.demo) return error("Create an account or sign in before posting, following, or sending messages.", 403);
    const body = await request.json();
    const id = text(body.id, 100);
    if (["post", "comment", "message"].includes(body.action)) {
      const creating = rateLimit(`create:${viewer.id}`, 60, 5 * 60 * 1000);
      if (!creating.ok) return error(`You're doing that a lot. Please slow down and try again in ${creating.retryAfterSeconds}s.`, 429);
    }
    switch (body.action) {
      case "like":
      case "save": {
        const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
        if (!post) return error("Post not found.", 404);
        if (body.action === "like") {
          if (body.active) {
            const added = await db.insert(likes).values({ userId: viewer.id, postId: id }).onConflictDoNothing().returning();
            if (added.length && post.authorId !== viewer.id) await notify(post.authorId, viewer.id, "like", "liked your moment.", id);
          } else await db.delete(likes).where(and(eq(likes.userId, viewer.id), eq(likes.postId, id)));
        } else {
          if (body.active) await db.insert(saves).values({ userId: viewer.id, postId: id }).onConflictDoNothing();
          else await db.delete(saves).where(and(eq(saves.userId, viewer.id), eq(saves.postId, id)));
        }
        return Response.json({ ok: true });
      }
      case "follow": {
        if (id === viewer.id) return error("You can't follow yourself.");
        const [person] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
        if (!person) return error("Profile not found.", 404);
        if (body.active) {
          const added = await db.insert(follows).values({ followerId: viewer.id, followingId: id }).onConflictDoNothing().returning();
          if (added.length) await notify(id, viewer.id, "follow", "started following you.", viewer.id);
        } else await db.delete(follows).where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, id)));
        return Response.json({ ok: true });
      }
      case "comment": {
        const value = text(body.text, 1000);
        if (!value) return error("Write a little something first.");
        const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
        if (!post) return error("Post not found.", 404);
        const [comment] = await db.insert(comments).values({ id: randomUUID(), postId: id, userId: viewer.id, text: value }).returning();
        if (post.authorId !== viewer.id) await notify(post.authorId, viewer.id, "comment", `commented: ${value.slice(0, 100)}`, id);
        return Response.json({ comment: { ...comment, createdAt: comment.createdAt.toISOString(), user: publicUser(viewer) } });
      }
      case "post": {
        const caption = text(body.caption);
        const media = await ownedUpload(viewer.id, text(body.mediaUrl, 2048));
        const mediaUrl = media.url;
        const mediaType = media.mediaType;
        const postId = randomUUID();
        await db.insert(posts).values({ id: postId, authorId: viewer.id, caption, mediaUrl, thumbnail: mediaType === "image" ? mediaUrl : null, mediaType, location: text(body.location, 100) });
        const feed = await getFeed(viewer.id, { authorId: viewer.id });
        return Response.json({ post: feed.find((p) => p.id === postId) });
      }
      case "view-post": {
        // Fire-and-forget view counting; never fails the request.
        await recordView(id);
        return Response.json({ ok: true });
      }
      case "repost": {
        const [source] = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(posts.authorId, users.id)).where(eq(posts.id, id)).limit(1);
        if (!source) return error("Post not found.", 404);
        if (source.post.authorId === viewer.id) return error("You can't repost your own moment.");
        const postId = randomUUID();
        const caption = `${source.post.caption}\n\nReposted from @${source.author.username}`.slice(0, 2200);
        await db.insert(posts).values({ id: postId, authorId: viewer.id, caption, mediaUrl: source.post.mediaUrl, thumbnail: source.post.thumbnail, mediaType: source.post.mediaType, location: source.post.location });
        await notify(source.post.authorId, viewer.id, "follow", "reposted your moment", postId).catch(() => {});
        const feed = await getFeed(viewer.id, { authorId: viewer.id });
        return Response.json({ post: feed.find((p) => p.id === postId) });
      }
      case "delete-post": {
        await db.delete(posts).where(and(eq(posts.id, id), eq(posts.authorId, viewer.id)));
        return Response.json({ ok: true });
      }
      case "edit-post": {
        const caption = text(body.caption);
        const [updated] = await db.update(posts).set({ caption, location: text(body.location, 100) }).where(and(eq(posts.id, id), eq(posts.authorId, viewer.id))).returning();
        if (!updated) return error("Post not found.", 404);
        const feed = await getFeed(viewer.id, { authorId: viewer.id });
        return Response.json({ post: feed.find((p) => p.id === id) || null });
      }
      case "delete-comment": {
        const commentId = text(body.commentId, 100);
        const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
        if (!comment) return error("Comment not found.", 404);
        const [post] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, comment.postId)).limit(1);
        // The comment's author, or the post's author moderating their own post.
        if (comment.userId !== viewer.id && post?.authorId !== viewer.id) return error("You can only delete your own comments.", 403);
        await db.delete(comments).where(eq(comments.id, commentId));
        return Response.json({ ok: true, postId: comment.postId });
      }
      case "profile": {
        const name = text(body.name, 60);
        const username = text(body.username, 30).toLowerCase();
        if (!name || !/^[a-z0-9._]{3,30}$/.test(username)) return error("Use a name and a username with 3–30 letters, numbers, dots, or underscores.");
        const update: Partial<typeof users.$inferInsert> = { name, username, bio: text(body.bio, 300), location: text(body.location, 100) };
        if (typeof body.avatar === "string" && body.avatar !== viewer.avatar) {
          update.avatar = (await ownedUpload(viewer.id, body.avatar, true)).url;
        }
        const [updated] = await db.update(users).set(update).where(eq(users.id, viewer.id)).returning();
        return Response.json({ viewer: { ...publicUser(updated), preferences: updated.preferences } });
      }
      case "settings": {
        const preferences = { ...viewer.preferences };
        if (typeof body.showActivity === "boolean") preferences.showActivity = body.showActivity;
        if (typeof body.emailNotifications === "boolean") preferences.emailNotifications = body.emailNotifications;
        await db.update(users).set({ preferences }).where(eq(users.id, viewer.id));
        return Response.json({ ok: true, preferences });
      }
      case "create-chat": {
        const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).filter((x: unknown): x is string => typeof x === "string" && x !== viewer.id))].slice(0, 30) as string[];
        if (!ids.length) return error("Choose someone to chat with.");
        const selected = await db.select().from(users).where(inArray(users.id, ids));
        if (selected.length !== ids.length) return error("One of those profiles is no longer available.");
        const group = ids.length > 1 || Boolean(body.isGroup);
        if (!group) {
          const existing = (await getChats(viewer.id)).find((c) => !c.isGroup && c.members.length === 1 && c.members[0].id === ids[0]);
          if (existing) return Response.json({ chat: existing });
        }
        const conversationId = randomUUID();
        await db.transaction(async (tx) => {
          await tx.insert(conversations).values({ id: conversationId, isGroup: group, name: group ? text(body.name, 70) || "The inner circle" : null });
          await tx.insert(members).values([viewer.id, ...ids].map((userId) => ({ conversationId, userId })));
        });
        for (const userId of ids) publish(userId, { type: "conversation", conversationId });
        return Response.json({ chat: (await getChats(viewer.id)).find((c) => c.id === conversationId) });
      }
      case "message": {
        const value = text(body.text, 5000);
        if (!value) return error("Write a message first.");
        const membership = await db.select().from(members).where(eq(members.conversationId, id));
        if (!membership.some((m) => m.userId === viewer.id)) return error("Conversation not found.", 404);
        const [message] = await db.insert(messages).values({ id: randomUUID(), conversationId: id, senderId: viewer.id, text: value }).returning();
        const result = { ...message, createdAt: message.createdAt.toISOString(), sender: publicUser(viewer) };
        await db.update(members).set({ lastReadAt: new Date() }).where(and(eq(members.conversationId, id), eq(members.userId, viewer.id)));
        for (const member of membership) publish(member.userId, { type: "message", conversationId: id, message: result });
        after(async () => { await Promise.all(membership.filter((m) => m.userId !== viewer.id).map((m) => pushToUser(m.userId, viewer.name, value, `/?view=messages&chat=${id}`))); });
        return Response.json({ message: result });
      }
      case "read-notifications": {
        await db.update(notifications).set({ read: true }).where(eq(notifications.userId, viewer.id));
        return Response.json({ ok: true });
      }
      case "subscribe": {
        const sub = body.subscription;
        if (!sub || typeof sub.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth) return error("Invalid push subscription.");
        const endpoint = new URL(sub.endpoint);
        if (endpoint.protocol !== "https:" || !/(^|\.)(googleapis\.com|mozilla\.com|mozilla\.org|windows\.com|apple\.com|notify\.windows\.com)$/.test(endpoint.hostname)) return error("Unsupported push provider.");
        await db.insert(pushSubscriptions).values({ id: randomUUID(), userId: viewer.id, endpoint: sub.endpoint, subscription: sub }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: viewer.id, subscription: sub } });
        after(() => pushToUser(viewer.id, "You're in the loop ✨", "Notifications are on. We'll let you know when your people reach out."));
        return Response.json({ ok: true });
      }
      case "unsubscribe": {
        await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, viewer.id), eq(pushSubscriptions.endpoint, text(body.endpoint, 2000))));
        return Response.json({ ok: true });
      }
      default: return error("Unknown action.");
    }
  } catch (e) {
    if (e instanceof UploadError) return error(e.message, e.status);
    const code = (e as { cause?: { code?: string }; code?: string }).cause?.code || (e as { code?: string }).code;
    if (code === "23505") return error("That username is already taken. Try another.", 409);
    console.error("Loop API POST:", e);
    return error("That didn't go through. Please try again.", 500);
  }
}
async function notify(userId: string, actorId: string, kind: string, value: string, targetId: string) {
  await db.insert(notifications).values({ id: randomUUID(), userId, actorId, kind, text: value, targetId });
  publish(userId, { type: "notification" });
  after(() => pushToUser(userId, "A new moment on Loop", value));
}
