"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Search, SquarePen, Send, Smile, UsersRound, ChevronLeft, Info, CheckCheck, Plus, Zap, MessageCircle, LoaderCircle, X } from "lucide-react";
import type { Message, Chat } from "@/lib/types";
import { useLoop, api, social } from "@/components/loop-context";
import { Avatar, IconButton, EmptyState, timeAgo } from "@/components/ui";

export function MessagesView() {
  const { data, setData, focusChatId, setModal, connected, toast, openProfile, ready } = useLoop();
  const [selectedId, setSelectedId] = useState(focusChatId || data.chats[0]?.id || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("All messages");
  const [loading, setLoading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(!!focusChatId);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const currentId = useRef(selectedId);
  currentId.current = selectedId;
  const selected = data.chats.find((c) => c.id === selectedId);
  const chats = data.chats.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()) && (tab !== "Groups" || c.isGroup));
  const sample = selected?.members.every((m) => m.id.length < 10);
  useEffect(() => { if (focusChatId) { setSelectedId(focusChatId); setMobileOpen(true); } }, [focusChatId]);
  useEffect(() => { if (!selectedId && data.chats.length) setSelectedId(data.chats[0].id); }, [data.chats, selectedId]);
  const loadMessages = useCallback(async (id: string) => {
    const result = await api<{ messages: Message[] }>(`/api/social?resource=messages&id=${encodeURIComponent(id)}`);
    if (currentId.current !== id) return;
    setMessages((prev) => [...result.messages, ...prev.filter((m) => m.pending && !result.messages.some((r) => r.senderId === m.senderId && r.text === m.text))]);
    setData((d) => ({ ...d, chats: d.chats.map((c) => c.id === id ? { ...c, unread: 0 } : c) }));
  }, [setData]);
  useEffect(() => {
    if (!selectedId || !ready) return;
    setMessages([]); setLoading(true); setDraft("");
    loadMessages(selectedId).catch((e) => toast(e.message)).finally(() => setLoading(false));
  }, [selectedId, ready, loadMessages, toast]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "message" && detail.conversationId === currentId.current) {
        const incoming = detail.message as Message;
        setMessages((prev) => [...prev.filter((m) => m.id !== incoming.id && !(m.pending && m.senderId === incoming.senderId && m.text === incoming.text)), incoming]);
        loadMessages(currentId.current).catch(() => {});
      } else if (currentId.current && (detail.type === "resync" || (detail.type === "sync" && detail.conversationIds?.includes(currentId.current)))) loadMessages(currentId.current).catch(() => {});
    };
    window.addEventListener("loop:live", handler); return () => window.removeEventListener("loop:live", handler);
  }, [loadMessages]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, selectedId]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selectedId) return;
    const text = draft.trim();
    const id = `pending-${crypto.randomUUID()}`;
    const conversationId = selectedId;
    const optimistic: Message = { id, conversationId, senderId: data.viewer.id, text, createdAt: new Date().toISOString(), sender: data.viewer, pending: true };
    setMessages((prev) => [...prev, optimistic]); setDraft(""); setEmojiOpen(false); input.current?.focus();
    setData((d) => ({ ...d, chats: d.chats.map((c) => c.id === conversationId ? { ...c, lastMessage: text, lastMessageAt: optimistic.createdAt } : c).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)) }));
    try {
      const result = await social<{ message: Message }>("message", { id: conversationId, text });
      if (currentId.current === conversationId) setMessages((prev) => [...prev.filter((m) => m.id !== id && m.id !== result.message.id), result.message]);
    } catch (e) { if (currentId.current === conversationId) { setMessages((prev) => prev.filter((m) => m.id !== id)); setDraft(text); } toast((e as Error).message); }
  }
  return <div className={`messenger ${mobileOpen ? "mobile-chat-open" : ""}`}><aside className="conversation-sidebar"><div className="inbox-heading"><div><h2>Your inbox<span>{data.chats.length}</span></h2><p>A good place for a hello.</p></div><IconButton label="New conversation" onClick={() => setModal({ type: "new-chat" })}><SquarePen size={21}/></IconButton></div><div className="inbox-search"><Search size={16}/><input placeholder="Find a conversation" aria-label="Find a conversation" value={filter} onChange={(e) => setFilter(e.target.value)}/>{filter && <button aria-label="Clear conversation search" onClick={() => setFilter("")}><X size={14}/></button>}</div><div className="inbox-tabs">{["All messages", "Groups"].map((t) => <button key={t} className={tab === t ? "selected" : ""} onClick={() => setTab(t)}>{t}</button>)}</div><div className="conversation-list">{chats.map((chat) => <button className={`conversation ${selectedId === chat.id ? "selected" : ""}`} key={chat.id} onClick={() => { setSelectedId(chat.id); setMobileOpen(true); }}><div className="conversation-avatar"><Avatar user={{ name: chat.name, avatar: chat.avatar }} size={44}/>{chat.isGroup && <i><UsersRound size={11}/></i>}</div><span className="conversation-content"><span><b>{chat.name}</b><small>{timeAgo(chat.lastMessageAt)}</small></span><span className="conversation-preview"><small>{chat.lastMessage}</small>{chat.unread > 0 && <i>{chat.unread}</i>}</span></span></button>)}{!chats.length && <EmptyState icon={<MessageCircle size={23}/>} title={filter ? "No conversations found" : "Bring your people together"} text={filter ? "Try another name." : "Start a new conversation or create a group."} action={<button className="text-button" onClick={() => setModal({ type: "new-chat" })}>Start a chat <Plus size={14}/></button>}/>}</div><button className="new-group-button" onClick={() => setModal({ type: "new-chat", title: "Create a group" })}><UsersRound size={18}/>Make an inner circle<Plus size={16}/></button>{data.viewer.preferences?.showActivity !== false && <div className="inbox-connection"><i className={connected ? "online-indicator" : "offline-indicator"}/><span>{connected ? "Connected. In the moment." : "Reconnecting to your people…"}</span><Zap size={12}/></div>}</aside>
    <section className="chat-panel">{selected ? <><header className="chat-header"><IconButton className="chat-back" label="Back to inbox" onClick={() => setMobileOpen(false)}><ChevronLeft size={22}/></IconButton><Avatar user={{ name: selected.name, avatar: selected.avatar }} size={42} onClick={selected.isGroup ? undefined : () => openProfile(selected.members[0].id)}/><div><h2>{selected.name}</h2><span>{selected.isGroup ? `${selected.members.length + 1} people in your circle` : sample ? "A little inspiration · Sample conversation" : "Your private conversation"}</span></div><IconButton label="Conversation details" onClick={() => setModal({ type: "people", title: selected.isGroup ? selected.name : "In this conversation", people: [data.viewer, ...selected.members] })}><Info size={21}/></IconButton></header><div className="chat-messages"><div className="chat-intro"><Avatar user={{ name: selected.name, avatar: selected.avatar }} size={68}/><h3>{selected.name}</h3><p>{selected.isGroup ? "Your own little corner of the conversation." : "Good connections start with a simple hello."}</p><span><LockIcon/>Only people in this conversation can read these messages.</span></div>{loading ? <div className="chat-loading"><LoaderCircle className="spin" size={22}/></div> : <><div className="message-date">{messages[0] ? new Date(messages[0].createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "The start of something good"}</div>{messages.map((message, index) => { const mine = message.senderId === data.viewer.id; return <div className={`message-row ${mine ? "mine" : ""}`} key={message.id}>{!mine && <Avatar user={message.sender} size={29}/>}<div className="message-body">{selected.isGroup && !mine && <span className="message-sender">{message.sender.name}</span>}<div className={`message-bubble ${message.pending ? "pending" : ""}`}>{message.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : <span key={i}>{part}</span>)}</div><span className="message-meta">{new Date(message.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{mine && (message.pending ? <span>Sending…</span> : <><CheckCheck size={13}/><span>Sent</span></>)}</span></div></div>; })}</>}{sample && <p className="sample-chat-note">This starter conversation is a preview. Invite a friend or message a member for live replies.</p>}<div ref={bottom}/></div><div className="composer-area">{emojiOpen && <div className="emoji-picker">{["😊", "❤️", "✨", "😂", "👋", "🙌", "🔥", "🌷", "☕", "💛", "🌊", "😍"].map((emoji) => <button key={emoji} onClick={() => { setDraft((d) => d + emoji); input.current?.focus(); }}>{emoji}</button>)}</div>}<form className="message-composer" onSubmit={send}><IconButton label="Choose an emoji" onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={22}/></IconButton><input ref={input} placeholder="A little hello goes a long way…" aria-label="Write a message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000}/><button className="send-message" aria-label="Send message" disabled={!draft.trim() || !ready}><Send size={19}/></button></form><div className="composer-note"><Zap size={11}/><span>Instant on your screen. Delivered by a real server.</span></div></div></> : <div className="chat-empty"><div className="chat-empty-art"><Send size={40}/><HeartOutline/></div><h2>Your people are<br/>a hello away.</h2><p>Pick a conversation or start something new.<br/>There’s always something to talk about.</p><button className="primary-button" onClick={() => setModal({ type: "new-chat" })}><Plus size={17}/>Start a conversation</button></div>}</section></div>;
}
function LockIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>; }
function HeartOutline() { return <span className="chat-empty-heart">♡</span>; }
