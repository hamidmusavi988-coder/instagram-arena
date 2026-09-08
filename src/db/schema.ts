import { pgTable, text, timestamp, boolean, integer, primaryKey, jsonb, index } from "drizzle-orm/pg-core";

export const users = pgTable("loop_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  avatar: text("avatar").notNull().default("/images/alex.jpg"),
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  verified: boolean("verified").notNull().default(false),
  demo: boolean("demo").notNull().default(false),
  baseFollowers: integer("base_followers").notNull().default(0),
  preferences: jsonb("preferences").$type<{ emailNotifications?: boolean; showActivity?: boolean }>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("loop_sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const posts = pgTable("loop_posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  caption: text("caption").notNull(),
  mediaUrl: text("media_url").notNull(),
  thumbnail: text("thumbnail"),
  mediaType: text("media_type").notNull().default("image"),
  location: text("location").notNull().default(""),
  audio: text("audio").notNull().default("Original audio"),
  baseLikes: integer("base_likes").notNull().default(0),
  baseComments: integer("base_comments").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("loop_posts_date_idx").on(t.createdAt)]);

export const likes = pgTable("loop_likes", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const saves = pgTable("loop_saves", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const follows = pgTable("loop_follows", {
  followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: text("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.followerId, t.followingId] })]);

export const comments = pgTable("loop_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversations = pgTable("loop_conversations", {
  id: text("id").primaryKey(),
  name: text("name"),
  isGroup: boolean("is_group").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const members = pgTable("loop_members", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().default(new Date(0)),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);

export const messages = pgTable("loop_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("loop_messages_conversation_idx").on(t.conversationId, t.createdAt)]);

export const notifications = pgTable("loop_notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  targetId: text("target_id"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = pgTable("loop_push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  subscription: jsonb("subscription").$type<{ endpoint: string; keys: { p256dh: string; auth: string } }>().notNull(),
});

export const appSettings = pgTable("loop_app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, string>>().notNull(),
});

// Both local and object-store uploads have an owner. A client-supplied URL
// alone never grants permission to publish or use someone else's upload.
export const uploads = pgTable("loop_uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pathname: text("pathname").notNull().unique(),
  url: text("url").unique(),
  storage: text("storage").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("loop_uploads_owner_date_idx").on(t.userId, t.createdAt)]);

