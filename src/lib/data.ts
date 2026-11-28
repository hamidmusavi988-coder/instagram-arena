import { and, asc, desc, eq, inArray, lt, or, ilike, sql } from "drizzle-orm";

// Escape LIKE/ILIKE wildcards in user-supplied search text so "%" or "_"
// in a query matches literally instead of matching everything.
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
import { db } from "@/db";
import { users, posts, likes, saves, comments, follows, notifications, conversations, members, messages } from "@/db/schema";
import type { User, Post, Chat, NotificationItem, Bootstrap, Message } from "@/lib/types";

type DbUser = typeof users.$inferSelect;
export function publicUser(u: DbUser): User {
  return { id: u.id, username: u.username, name: u.name, avatar: u.avatar, bio: u.bio, location: u.location, verified: u.verified, demo: u.demo, baseFollowers: u.baseFollowers };
}
export async function getPeople(viewerId?: string, query?: string) {
  const condition = query ? and(eq(users.demo, false), or(ilike(users.username, `%${escapeLike(query)}%`), ilike(users.name, `%${escapeLike(query)}%`))) : eq(users.demo, false);
  const rows = await db.select().from(users).where(condition).limit(60);
  const connections = viewerId ? await db.select().from(follows).where(eq(follows.followerId, viewerId)) : [];
  // Aggregate in SQL instead of pulling every follow row into memory.
  const allFollows = await db.select({ followingId: follows.followingId, n: sql<number>`count(*)::int` }).from(follows).groupBy(follows.followingId);
  const followerCounts = new Map(allFollows.map((f) => [f.followingId, f.n]));
  const order = ["olivia", "emma", "noah", "mia", "jake", "ava", "daniel", "sarah"];
  return rows.filter((u) => u.id !== viewerId).sort((a, b) => { const ai = order.indexOf(a.id); const bi = order.indexOf(b.id); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi); }).map((u) => ({ ...publicUser(u), following: connections.some((f) => f.followingId === u.id), followers: u.baseFollowers + (followerCounts.get(u.id) || 0) }));
}
export async function getFeed(viewerId?: string, options: { authorId?: string; query?: string; saved?: boolean; following?: boolean; before?: string; limit?: number; random?: boolean } = {}): Promise<Post[]> {
  const conditions = [];
  if (options.authorId) conditions.push(eq(posts.authorId, options.authorId));
  if (options.query) conditions.push(or(ilike(posts.caption, `%${escapeLike(options.query)}%`), ilike(posts.location, `%${escapeLike(options.query)}%`))!);
  // Cursor pagination: only posts older than the cursor timestamp. In ranked
  // mode the cursor does not apply — "load more" returns a fresh shuffle and
  // the client de-duplicates what it already shows.
  if (options.before && !options.random) { const cursor = new Date(options.before); if (!Number.isNaN(cursor.getTime())) conditions.push(lt(posts.createdAt, cursor)); }
  if (options.saved) {
    const selected = viewerId ? await db.select().from(saves).where(eq(saves.userId, viewerId)) : [];
    if (!selected.length) return [];
    conditions.push(inArray(posts.id, selected.map((s) => s.postId)));
  }
  if (options.following) {
    const selected = viewerId ? await db.select().from(follows).where(eq(follows.followerId, viewerId)) : [];
    if (!selected.length) return [];
    conditions.push(inArray(posts.authorId, selected.map((f) => f.followingId)));
  }
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 60);
  // Ranked mode (the main feed): score a candidate pool by the viewer's
  // interests instead of pure time or pure chance. Load-more calls (which
  // pass a cursor) fall back to a fresh random shuffle.
  const ranked = Boolean(options.random && viewerId && !options.before && !options.authorId && !options.query && !options.saved && !options.following);
  let rows = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(posts.authorId, users.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(ranked || options.random ? sql`random()` : desc(posts.createdAt)).limit(ranked ? 200 : limit);
  if (ranked && viewerId) {
    const [likedRows, savedRows, followRows] = await Promise.all([
      db.select().from(likes).where(eq(likes.userId, viewerId)),
      db.select().from(saves).where(eq(saves.userId, viewerId)),
      db.select().from(follows).where(eq(follows.followerId, viewerId)),
    ]);
    const interestPostIds = new Set([...likedRows.map((l) => l.postId), ...savedRows.map((s) => s.postId)]);
    const interestPosts = interestPostIds.size ? await db.select({ caption: posts.caption }).from(posts).where(inArray(posts.id, [...interestPostIds])) : [];
    const tagOf = (caption: string) => (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase());
    const interestTags = new Set(interestPosts.flatMap((p) => tagOf(p.caption)));
    const followedAuthors = new Set(followRows.map((f) => f.followingId));
    const score = (row: (typeof rows)[number]) => {
      let s = Math.random() * 2; // jitter, so the mix still feels fresh
      s += tagOf(row.post.caption).filter((t) => interestTags.has(t)).length * 2;
      if (followedAuthors.has(row.post.authorId)) s += 3;
      if (row.post.authorId === viewerId) s -= 1.5; // your own posts a little lower
      s += Math.min(2, Math.log10(row.post.baseLikes + row.post.baseComments + 1) / 2);
      return s;
    };
    rows = [...rows].sort((a, b) => score(b) - score(a)).slice(0, limit);
  }
  if (!rows.length) return [];
  const ids = rows.map((r) => r.post.id);
  const [allLikes, allSaves, allSaveRows, allComments] = await Promise.all([
    db.select().from(likes).where(inArray(likes.postId, ids)),
    viewerId ? db.select().from(saves).where(and(eq(saves.userId, viewerId), inArray(saves.postId, ids))) : Promise.resolve([]),
    db.select().from(saves).where(inArray(saves.postId, ids)),
    db.select({ comment: comments, user: users }).from(comments).innerJoin(users, eq(comments.userId, users.id)).where(inArray(comments.postId, ids)).orderBy(asc(comments.createdAt)).limit(1000),
  ]);
  const viewsMap = await getViewsMap(ids);
  return rows.map(({ post, author }) => {
    const postComments = allComments.filter((c) => c.comment.postId === post.id);
    const postLikes = allLikes.filter((l) => l.postId === post.id);
    return { ...post, createdAt: post.createdAt.toISOString(), author: publicUser(author), likes: post.baseLikes + postLikes.length, liked: postLikes.some((l) => l.userId === viewerId), saved: allSaves.some((s) => s.postId === post.id), savesCount: allSaveRows.filter((s) => s.postId === post.id).length, views: viewsMap.get(post.id) || 0, commentCount: post.baseComments + postComments.length, comments: postComments.map(({ comment, user }) => ({ ...comment, createdAt: comment.createdAt.toISOString(), user: publicUser(user) })) };
  });
}
export type TrendingTag = { tag: string; count: number };
// Real trending hashtags, counted from the most recent posts' captions
// instead of a hardcoded list.
export async function getTrendingHashtags(limit = 5): Promise<TrendingTag[]> {
  const rows = await db.select({ caption: posts.caption }).from(posts).orderBy(desc(posts.createdAt)).limit(300);
  const counts = new Map<string, number>();
  for (const { caption } of rows) {
    for (const match of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
      const tag = `#${match[1].toLowerCase()}`;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit);
}
export async function getNotifications(viewerId: string): Promise<NotificationItem[]> {
  const rows = await db.select({ notification: notifications, actor: users }).from(notifications).leftJoin(users, eq(notifications.actorId, users.id)).where(eq(notifications.userId, viewerId)).orderBy(desc(notifications.createdAt)).limit(50);
  return rows.map(({ notification, actor }) => ({ ...notification, createdAt: notification.createdAt.toISOString(), actor: actor ? publicUser(actor) : null }));
}
export async function getChats(viewerId: string): Promise<Chat[]> {
  const mine = await db.select({ member: members, chat: conversations }).from(members).innerJoin(conversations, eq(members.conversationId, conversations.id)).where(eq(members.userId, viewerId));
  if (!mine.length) return [];
  const ids = mine.map((r) => r.chat.id);
  const [people, recent] = await Promise.all([
    db.select({ member: members, user: users }).from(members).innerJoin(users, eq(members.userId, users.id)).where(inArray(members.conversationId, ids)),
    db.select().from(messages).where(inArray(messages.conversationId, ids)).orderBy(desc(messages.createdAt)).limit(500),
  ]);
  return mine.map(({ member, chat }) => {
    const group = people.filter((p) => p.member.conversationId === chat.id && p.user.id !== viewerId).map((p) => publicUser(p.user));
    const chatMessages = recent.filter((m) => m.conversationId === chat.id);
    return { id: chat.id, name: chat.name || group.map((p) => p.name).join(", "), isGroup: chat.isGroup, avatar: group[0]?.avatar || "/images/alex.jpg", members: group, lastMessage: chatMessages[0]?.text || "Say hello. A good conversation starts here.", lastMessageAt: (chatMessages[0]?.createdAt || chat.createdAt).toISOString(), unread: chatMessages.filter((m) => m.senderId !== viewerId && m.createdAt > member.lastReadAt).length };
  }).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}
export async function getMessages(viewerId: string, conversationId: string): Promise<Message[] | null> {
  const [membership] = await db.select().from(members).where(and(eq(members.userId, viewerId), eq(members.conversationId, conversationId))).limit(1);
  if (!membership) return null;
  const rows = await db.select({ message: messages, sender: users }).from(messages).innerJoin(users, eq(messages.senderId, users.id)).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt)).limit(200);
  await db.update(members).set({ lastReadAt: new Date() }).where(and(eq(members.userId, viewerId), eq(members.conversationId, conversationId)));
  return rows.reverse().map(({ message, sender }) => ({ ...message, createdAt: message.createdAt.toISOString(), sender: publicUser(sender) }));
}
export async function getProfile(id: string, viewerId: string) {
  const [user] = await db.select().from(users).where(or(eq(users.id, id), eq(users.username, id))).limit(1);
  if (!user) return null;
  const [followersList, followingList, profilePosts] = await Promise.all([
    db.select({ user: users }).from(follows).innerJoin(users, eq(follows.followerId, users.id)).where(eq(follows.followingId, user.id)),
    db.select({ user: users }).from(follows).innerJoin(users, eq(follows.followingId, users.id)).where(eq(follows.followerId, user.id)),
    getFeed(viewerId, { authorId: user.id }),
  ]);
  return { user: { ...publicUser(user), followers: user.baseFollowers + followersList.length, followingCount: followingList.length, following: followersList.some((f) => f.user.id === viewerId) }, posts: profilePosts, followers: followersList.map((f) => publicUser(f.user)), following: followingList.map((f) => publicUser(f.user)) };
}
// View counts live in a `views` column added by migrations/add-views.sql.
// All access is raw SQL inside try/catch, so the app runs identically before
// the migration is applied (counts read as 0) and after (real counts).
export async function getViewsMap(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  try {
    const result = await db.execute(sql`select id, views from loop_posts where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    const rows = (result as unknown as { rows: { id: string; views: number }[] }).rows || [];
    return new Map(rows.map((r) => [r.id, Number(r.views) || 0]));
  } catch { return new Map(); }
}
export async function recordView(postId: string): Promise<void> {
  try { await db.execute(sql`update loop_posts set views = coalesce(views, 0) + 1 where id = ${postId}`); } catch { /* column not migrated yet */ }
}
export type Insights = { posts: number; likes: number; comments: number; saves: number; views: number; followers: number; following: number; topPostId: string | null };
// Creator insights for your own profile, aggregated from data that already
// exists — no extra tracking, no schema change.
export async function getInsights(viewerId: string): Promise<Insights> {
  const mine = await db.select().from(posts).where(eq(posts.authorId, viewerId));
  const ids = mine.map((p) => p.id);
  const [likeRows, commentRows, saveRows, followerRows, followingRows] = await Promise.all([
    ids.length ? db.select().from(likes).where(inArray(likes.postId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(comments).where(inArray(comments.postId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(saves).where(inArray(saves.postId, ids)) : Promise.resolve([]),
    db.select().from(follows).where(eq(follows.followingId, viewerId)),
    db.select().from(follows).where(eq(follows.followerId, viewerId)),
  ]);
  const realLikes = new Map<string, number>();
  for (const l of likeRows) realLikes.set(l.postId, (realLikes.get(l.postId) || 0) + 1);
  const baseById = new Map(mine.map((p) => [p.id, p.baseLikes]));
  const likeCount = (postId: string) => (baseById.get(postId) || 0) + (realLikes.get(postId) || 0);
  const top = [...mine].sort((a, b) => likeCount(b.id) - likeCount(a.id))[0];
  const viewsMap = await getViewsMap(ids);
  return {
    posts: mine.length,
    likes: mine.reduce((sum, p) => sum + p.baseLikes, 0) + likeRows.length,
    comments: mine.reduce((sum, p) => sum + p.baseComments, 0) + commentRows.length,
    saves: saveRows.length,
    views: [...viewsMap.values()].reduce((a, b) => a + b, 0),
    followers: followerRows.length,
    following: followingRows.length,
    topPostId: top && likeCount(top.id) > 0 ? top.id : null,
  };
}
export async function getBootstrap(viewer: DbUser): Promise<Bootstrap> {
  const [feed, people, alerts, chats, trending] = await Promise.all([getFeed(viewer.id, { random: true }), getPeople(viewer.id), getNotifications(viewer.id), getChats(viewer.id), getTrendingHashtags().catch(() => [])]);
  return { viewer: { ...publicUser(viewer), preferences: viewer.preferences }, posts: feed, people, notifications: alerts, chats, trending, googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) };
}
