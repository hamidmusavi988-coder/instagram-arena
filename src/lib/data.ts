import { and, asc, desc, eq, inArray, or, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, posts, likes, saves, comments, follows, notifications, conversations, members, messages } from "@/db/schema";
import type { User, Post, Chat, NotificationItem, Bootstrap, Message } from "@/lib/types";

type DbUser = typeof users.$inferSelect;
export function publicUser(u: DbUser): User {
  return { id: u.id, username: u.username, name: u.name, avatar: u.avatar, bio: u.bio, location: u.location, verified: u.verified, demo: u.demo, baseFollowers: u.baseFollowers };
}
export async function getPeople(viewerId?: string, query?: string) {
  const condition = query ? and(eq(users.demo, false), or(ilike(users.username, `%${query}%`), ilike(users.name, `%${query}%`))) : eq(users.demo, false);
  const rows = await db.select().from(users).where(condition).limit(60);
  const connections = viewerId ? await db.select().from(follows).where(eq(follows.followerId, viewerId)) : [];
  const order = ["olivia", "emma", "noah", "mia", "jake", "ava", "daniel", "sarah"];
  return rows.filter((u) => u.id !== viewerId).sort((a, b) => { const ai = order.indexOf(a.id); const bi = order.indexOf(b.id); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi); }).map((u) => ({ ...publicUser(u), following: connections.some((f) => f.followingId === u.id) }));
}
export async function getFeed(viewerId?: string, options: { authorId?: string; query?: string; saved?: boolean; following?: boolean } = {}): Promise<Post[]> {
  const conditions = [];
  if (options.authorId) conditions.push(eq(posts.authorId, options.authorId));
  if (options.query) conditions.push(or(ilike(posts.caption, `%${options.query}%`), ilike(posts.location, `%${options.query}%`))!);
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
  const rows = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(posts.authorId, users.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(posts.createdAt)).limit(60);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.post.id);
  const [allLikes, allSaves, allComments] = await Promise.all([
    db.select().from(likes).where(inArray(likes.postId, ids)),
    viewerId ? db.select().from(saves).where(and(eq(saves.userId, viewerId), inArray(saves.postId, ids))) : Promise.resolve([]),
    db.select({ comment: comments, user: users }).from(comments).innerJoin(users, eq(comments.userId, users.id)).where(inArray(comments.postId, ids)).orderBy(asc(comments.createdAt)).limit(1000),
  ]);
  return rows.map(({ post, author }) => {
    const postComments = allComments.filter((c) => c.comment.postId === post.id);
    const postLikes = allLikes.filter((l) => l.postId === post.id);
    return { ...post, createdAt: post.createdAt.toISOString(), author: publicUser(author), likes: post.baseLikes + postLikes.length, liked: postLikes.some((l) => l.userId === viewerId), saved: allSaves.some((s) => s.postId === post.id), commentCount: post.baseComments + postComments.length, comments: postComments.map(({ comment, user }) => ({ ...comment, createdAt: comment.createdAt.toISOString(), user: publicUser(user) })) };
  });
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
export async function getBootstrap(viewer: DbUser): Promise<Bootstrap> {
  const [feed, people, alerts, chats] = await Promise.all([getFeed(viewer.id), getPeople(viewer.id), getNotifications(viewer.id), getChats(viewer.id)]);
  return { viewer: { ...publicUser(viewer), preferences: viewer.preferences }, posts: feed, people, notifications: alerts, chats, googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) };
}
