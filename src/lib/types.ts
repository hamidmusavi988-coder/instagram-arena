export type User = {
  id: string; username: string; name: string; avatar: string; bio: string;
  location: string; verified: boolean; demo: boolean; baseFollowers: number;
  following?: boolean; followers?: number; followingCount?: number;
  preferences?: { emailNotifications?: boolean; showActivity?: boolean };
};
export type Comment = { id: string; text: string; createdAt: string; user: User };
export type Post = {
  id: string; caption: string; mediaUrl: string; thumbnail: string | null;
  mediaType: string; location: string; audio: string; createdAt: string;
  author: User; likes: number; commentCount: number; liked: boolean; saved: boolean; savesCount?: number;
  comments: Comment[];
};
export type NotificationItem = {
  id: string; kind: string; text: string; targetId: string | null; read: boolean;
  createdAt: string; actor: User | null;
};
export type Chat = {
  id: string; name: string; isGroup: boolean; avatar: string; members: User[];
  lastMessage: string; lastMessageAt: string; unread: number;
};
export type Message = { id: string; conversationId: string; senderId: string; text: string; createdAt: string; sender: User; pending?: boolean };
export type TrendingTag = { tag: string; count: number };
export type Bootstrap = { viewer: User; posts: Post[]; people: User[]; notifications: NotificationItem[]; chats: Chat[]; trending?: TrendingTag[]; googleEnabled: boolean };
export type View = "home" | "explore" | "reels" | "messages" | "notifications" | "saved" | "profile" | "settings";
