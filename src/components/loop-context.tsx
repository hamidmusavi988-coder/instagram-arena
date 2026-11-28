"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Bootstrap, User, Post, View } from "@/lib/types";
export type ModalState = { type: "auth" | "create" | "story" | "post" | "share" | "edit-profile" | "people" | "info" | "feed-preferences" | "new-chat"; user?: User; post?: Post; people?: User[]; title?: string; text?: string; storyIndex?: number } | null;
type LoopContextValue = {
  data: Bootstrap; setData: Dispatch<SetStateAction<Bootstrap>>;
  view: View; navigate: (view: View, id?: string) => void;
  profileId: string; focusChatId: string; openProfile: (id: string) => void;
  query: string; setQuery: Dispatch<SetStateAction<string>>;
  modal: ModalState; setModal: Dispatch<SetStateAction<ModalState>>;
  toast: (message: string) => void; connected: boolean; ready: boolean;
  toggleLike: (post: Post) => Promise<void>; toggleSave: (post: Post) => Promise<void>;
  toggleFollow: (user: User) => Promise<void>; refresh: () => Promise<void>;
  mutedIds: string[]; toggleMute: (user: User) => void;
  hideCounts: boolean; setHideCounts: (value: boolean) => void;
};
export const LoopContext = createContext<LoopContextValue | null>(null);
export function useLoop() { const value = useContext(LoopContext); if (!value) throw new Error("Loop context missing"); return value; }
export async function api<T = Record<string, unknown>>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("Can't reach Loop right now. Check your connection and try again.");
  }
  // Error pages (deployments, proxies, 404s) may not be JSON at all.
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || (response.status >= 500 ? "Loop is having a moment. Please try again in a few seconds." : "Something went wrong. Please try again."));
  return data as T;
}
export function social<T = Record<string, unknown>>(action: string, values: Record<string, unknown> = {}) { return api<T>("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) }); }
export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser doesn't support push notifications. Try Chrome, Edge, or Safari on a supported device.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Allow notifications in your browser settings to stay in the loop.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("/api/social?resource=push-key");
  const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (c) => c.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  await social("subscribe", { subscription: subscription.toJSON() });
  return subscription;
}
