"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { House, Compass, Clapperboard, Send, Heart, Plus, Bookmark, Settings, Search, MoreHorizontal, UserRoundPlus, ChevronUp, CheckCircle2, Bell, X } from "lucide-react";
import type { Bootstrap, View, Post, User, Chat, NotificationItem } from "@/lib/types";
import { LoopContext, api, social, type ModalState } from "@/components/loop-context";
import { Avatar, IconButton, Logo } from "@/components/ui";
import { FeedView, RightRail } from "@/components/feed";
import { ExploreView, ProfileView, ReelsView, NotificationsView, SettingsView } from "@/components/views";
import { MessagesView } from "@/components/messages";
import { Dialogs } from "@/components/dialogs";
import { connectRealtime } from "@/lib/client-realtime";

const navigation = [
  { id: "home" as View, label: "Home", icon: House },
  { id: "explore" as View, label: "Explore", icon: Compass },
  { id: "reels" as View, label: "Reels", icon: Clapperboard },
  { id: "messages" as View, label: "Messages", icon: Send },
  { id: "notifications" as View, label: "Notifications", icon: Heart },
];
const headings: Record<View, [string, string]> = {
  home: ["Home", "Your people. Your moments. Your daily dose of inspiration."],
  explore: ["Explore", "A little curiosity can take you somewhere good."],
  reels: ["Reels", "Little moments. Worth watching."],
  messages: ["Messages", "Less distance. More connection."],
  notifications: ["Your activity", "All the love, in one little place."],
  saved: ["Saved moments", "The things you want to come back to."],
  profile: ["Profile", "A little corner of the internet, all your own."],
  settings: ["Settings", "Make yourself at home."],
};
export default function LoopApp({ initial }: { initial: Bootstrap }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("home");
  const [profileId, setProfileId] = useState("");
  const [focusChatId, setFocusChatId] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((message: string) => { setNotice(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setNotice(""), 4200); }, []);
  const refresh = useCallback(async () => { const next = await api<Bootstrap>("/api/social"); setData(next); setReady(true); }, []);
  const navigate = useCallback((next: View, id?: string) => {
    setView(next); setSearchOpen(false); setModal(null);
    if (next === "profile") setProfileId(id || "");
    if (next === "messages" && id) setFocusChatId(id);
    const params = new URLSearchParams();
    if (next !== "home") params.set("view", next);
    if (id) params.set(next === "messages" ? "chat" : "user", id);
    window.history.pushState({}, "", "/" + (params.size ? `?${params}` : ""));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const openProfile = useCallback((id: string) => navigate("profile", id), [navigate]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("view") as View;
      setView(requested && requested in headings ? requested : "home");
      setProfileId(params.get("user") || ""); setFocusChatId(params.get("chat") || "");
      if (params.get("q")) setQuery(params.get("q")!);
      if (params.get("auth")) setModal({ type: "auth", text: params.get("auth") === "google-unavailable" ? "Google sign-in needs this server's Google OAuth credentials. Email sign-in is ready to use." : "Google sign-in didn't finish. Please try again or continue with email." });
    };
    restore();
    refresh().catch((e) => toast(e.message));
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("popstate", restore); window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("keydown", shortcut); };
  }, [refresh, toast]);
  useEffect(() => {
    if (!searchOpen) return;
    const dismiss = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".search-wrap")) setSearchOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setSearchOpen(false); };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [searchOpen]);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const post = data.posts.find((p) => p.id === params.get("post"));
    if (post) setModal({ type: "post", post });
    // Open shared moments once the session has connected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (!ready || !data.viewer.id) return;
    const disconnect = connectRealtime((payload) => {
      window.dispatchEvent(new CustomEvent("loop:live", { detail: payload }));
      if (["message", "sync", "conversation", "resync"].includes(String(payload.type))) {
        api<{ chats: Chat[] }>("/api/social?resource=chats").then((result) => setData((current) => ({ ...current, chats: result.chats }))).catch(() => {});
      }
      if (payload.type === "notification" || payload.type === "resync") {
        api<{ notifications: NotificationItem[] }>("/api/social?resource=notifications").then((result) => setData((current) => ({ ...current, notifications: result.notifications }))).catch(() => {});
      }
    }, setConnected);
    return () => { disconnect(); setConnected(false); };
  }, [ready, data.viewer.id]);
  const toggleLike = async (post: Post) => {
    const active = !post.liked;
    setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? { ...p, liked: active, likes: p.likes + (active ? 1 : -1) } : p) }));
    try { await social("like", { id: post.id, active }); }
    catch (e) { setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? { ...p, liked: post.liked, likes: post.likes } : p) })); toast((e as Error).message); }
  };
  const toggleSave = async (post: Post) => {
    const active = !post.saved;
    setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? { ...p, saved: active } : p) }));
    try { await social("save", { id: post.id, active }); toast(active ? "Saved to your little collection." : "Removed from saved moments."); }
    catch (e) { setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? { ...p, saved: post.saved } : p) })); toast((e as Error).message); }
  };
  const toggleFollow = async (user: User) => {
    const current = data.people.find((p) => p.id === user.id)?.following ?? user.following ?? false;
    setData((d) => ({ ...d, people: d.people.map((p) => p.id === user.id ? { ...p, following: !current } : p) }));
    try { await social("follow", { id: user.id, active: !current }); }
    catch (e) { setData((d) => ({ ...d, people: d.people.map((p) => p.id === user.id ? { ...p, following: current } : p) })); toast((e as Error).message); }
  };
  const unread = data.chats.filter((c) => c.unread > 0).length;
  const alertCount = data.notifications.filter((n) => !n.read).length;
  const quickPeople = query.trim() ? data.people.filter((p) => `${p.name} ${p.username}`.toLowerCase().includes(query.toLowerCase())).slice(0, 4) : [];
  return <LoopContext.Provider value={{ data, setData, view, navigate, profileId, focusChatId, openProfile, query, setQuery, modal, setModal, toast, connected, ready, toggleLike, toggleSave, toggleFollow, refresh }}>
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-link" onClick={() => navigate("home")} aria-label="Loop home"><Logo/></button>
        <p className="brand-tagline">LIFE IS BETTER IN THE LOOP.</p>
        <nav className="main-nav" aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => { if (id === "explore") setQuery(""); navigate(id); }} aria-current={view === id ? "page" : undefined}><Icon size={22} strokeWidth={view === id ? 2.1 : 1.7}/><span>{label}</span>{id === "messages" && (unread > 0 || (!ready && data.people.some((person) => person.id === "emma"))) && <b className="nav-badge">{ready ? unread : 3}</b>}{id === "notifications" && alertCount > 0 && <i className="nav-dot"/>}{view === id && id !== "messages" && <i className="active-mark"/>}</button>)}</nav>
        <button className="create-button" onClick={() => setModal({ type: "create" })}><Plus size={21}/><span>Create a post</span></button>
        <div className="nav-divider"/><span className="section-label">YOUR SPACE</span>
        <nav className="space-nav" aria-label="Your space"><button className={`nav-item ${view === "saved" ? "active" : ""}`} onClick={() => navigate("saved")}><Bookmark size={21} strokeWidth={1.7}/><span>Saved</span></button><button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Settings size={21} strokeWidth={1.7}/><span>Settings</span></button></nav>
        <div className="sidebar-bottom"><button className="invite-link" onClick={() => setModal({ type: "share", title: "Good things are better together" })}><UserRoundPlus size={18}/><span>Invite your friends</span><span className="invite-plus">+</span></button><div className="sidebar-profile"><button className="sidebar-profile-main" onClick={() => openProfile(data.viewer.id)}><Avatar user={data.viewer} size={38}/><span><b>{data.viewer.name}</b><small>View your profile</small></span></button><IconButton label="Switch account" onClick={() => setModal({ type: "auth" })}><MoreHorizontal size={19}/></IconButton></div></div>
      </aside>
      <main className={`main-content view-${view}`}>
        <header className="app-header"><div className="page-heading"><h1>{headings[view][0]}{view === "home" && <span className="heading-dot">.</span>}</h1><p>{headings[view][1]}</p></div><div className="header-tools"><div className="search-wrap"><form className="search-box" onSubmit={(e) => { e.preventDefault(); navigate("explore"); setSearchOpen(false); }}><label htmlFor="loop-search" className="search-icon"><Search size={17}/></label><input id="loop-search" ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="Search Loop" aria-label="Search Loop"/><kbd>⌘ K</kbd>{query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setSearchOpen(false); }}><X size={14}/></button>}</form>{searchOpen && query.trim() && view !== "explore" && <div className="search-dropdown">{quickPeople.map((p) => <button key={p.id} onClick={() => openProfile(p.id)}><Avatar user={p} size={34}/><span><b>{p.name}</b><small>@{p.username}</small></span></button>)}<button className="search-all" onClick={() => navigate("explore")}><Search size={16}/>Explore “{query}”<span>↗</span></button></div>}</div><IconButton className="header-notifications" label="View notifications" onClick={() => navigate("notifications")}><Bell size={20}/>{alertCount > 0 && <i/>}</IconButton></div></header>
        {view === "home" || view === "saved" ? <div className="content-grid"><section className="feed-column"><FeedView saved={view === "saved"}/></section><RightRail/></div> : view === "explore" ? <ExploreView/> : view === "reels" ? <ReelsView/> : view === "messages" ? <MessagesView/> : view === "notifications" ? <NotificationsView/> : view === "profile" ? <ProfileView/> : <SettingsView/>}
      </main>
      {view !== "messages" && <button className="floating-messages" onClick={() => navigate("messages")}><div className="mini-avatar-stack">{["emma", "noah", "mia"].map((id) => { const person = data.people.find((p) => p.id === id); return person && <Avatar key={id} user={person} size={27}/>; })}</div><span>Messages</span>{unread > 0 && <b>{unread}</b>}<ChevronUp size={17}/><i className={connected ? "online-indicator" : "offline-indicator"}/></button>}
      <nav className="mobile-nav" aria-label="Mobile navigation"><IconButton label="Home" className={view === "home" ? "selected" : ""} onClick={() => navigate("home")}><House size={23}/></IconButton><IconButton label="Explore" className={view === "explore" ? "selected" : ""} onClick={() => navigate("explore")}><Compass size={23}/></IconButton><IconButton label="Create a post" className="mobile-create" onClick={() => setModal({ type: "create" })}><Plus size={23}/></IconButton><IconButton label="Reels" className={view === "reels" ? "selected" : ""} onClick={() => navigate("reels")}><Clapperboard size={23}/></IconButton><IconButton label="Messages" className={view === "messages" ? "selected" : ""} onClick={() => navigate("messages")}><Send size={23}/></IconButton><button className="mobile-profile" aria-label="Your profile" onClick={() => openProfile(data.viewer.id)}><Avatar user={data.viewer} size={27}/></button></nav>
      {notice && <div role="status" className="toast"><CheckCircle2 size={19}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={15}/></button></div>}
      <Dialogs/>
    </div>
  </LoopContext.Provider>;
}
