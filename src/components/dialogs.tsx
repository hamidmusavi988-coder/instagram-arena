"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, Heart, ImagePlus, Images, LoaderCircle, Mail, MapPin, Plus, Search, Send, ShieldCheck, Sparkles, Upload, UsersRound, Video, X, Camera } from "lucide-react";
import type { Post, User, Chat } from "@/lib/types";
import { useLoop, api, social } from "@/components/loop-context";
import { Avatar, Verified, Modal, IconButton, EmptyState, Logo } from "@/components/ui";
import { PostCard } from "@/components/feed";

type CloseProps = { close: () => void };
export function Dialogs() {
  const { modal, setModal, data } = useLoop();
  const close = useCallback(() => setModal(null), [setModal]);
  if (!modal) return null;
  if (modal.type === "auth") return <AuthDialog close={close}/>;
  if (modal.type === "create") return <CreateDialog close={close}/>;
  if (modal.type === "edit-profile") return <EditProfileDialog close={close}/>;
  if (modal.type === "share") return <ShareDialog close={close}/>;
  if (modal.type === "new-chat") return <NewChatDialog close={close}/>;
  if (modal.type === "story") return <StoryDialog close={close}/>;
  if (modal.type === "people") return <PeopleDialog close={close}/>;
  if (modal.type === "feed-preferences") return <PreferencesDialog close={close}/>;
  if (modal.type === "post" && modal.post) return <Modal title="A little moment" onClose={close} className="post-detail-backdrop"><PostCard post={data.posts.find((p) => p.id === modal.post?.id) || modal.post} expanded/></Modal>;
  if (modal.type === "info") return <InfoDialog close={close}/>;
  return null;
}
function AuthDialog({ close }: CloseProps) {
  const { data, modal, refresh, toast } = useLoop();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(modal?.text || "");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try { await api("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode === "login" ? "login" : "register", email, password, name, username }) }); await refresh(); close(); toast(mode === "login" ? "Welcome back. Your people missed you." : "Welcome to your little corner of Loop."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal onClose={close} className="auth-backdrop"><div className="auth-content"><Logo/><span className="auth-eyebrow">LIFE IS BETTER TOGETHER.</span><h2>{mode === "login" ? "Back in the loop." : "Find your people."}</h2><p>{mode === "login" ? "Your moments, your people. Right where you left them." : "A little inspiration. A lot of connection. All you."}</p><button className="google-button" onClick={() => { if (data.googleEnabled) window.location.href = "/api/auth/google"; else setError("Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server. You can create an account with email right now."); }}><span className="google-g">G</span>Continue with Google</button><div className="auth-divider"><span/>or continue with email<span/></div>{error && <div className="form-error" role="alert">{error}</div>}<form className="auth-form" onSubmit={submit}>{mode === "register" && <div className="form-two-cols"><label>Your name<input placeholder="Alex Morgan" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name"/></label><label>Username<input placeholder="alex.morgan" value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[a-zA-Z0-9._]{3,30}" maxLength={30} autoComplete="username"/></label></div>}<label>Email address<div className="input-with-icon"><Mail size={16}/><input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"/></div></label><label>Password<div className="input-with-icon password-input"><input type={showPassword ? "text" : "password"} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required autoComplete={mode === "login" ? "current-password" : "new-password"}/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label><button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : mode === "login" ? "Sign in to Loop" : "Create your account"}{!busy && <ArrowRight size={17}/>}</button></form><div className="auth-switch">{mode === "login" ? "New around here?" : "Already in the loop?"}<button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></div><div className="auth-privacy"><ShieldCheck size={13}/><span>Your password is securely hashed. Your moments are yours.</span></div></div></Modal>;
}
import { uploadFile } from "@/lib/client-upload";
function CreateDialog({ close }: CloseProps) {
  const { modal, data, setData, navigate, toast } = useLoop();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const choose = (next?: File) => { if (!next) return; if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(next.type)) { setError("Choose a JPG, PNG, WebP, MP4, or WebM file."); return; } if (next.size > 60 * 1024 * 1024) { setError("A little smaller, please. Uploads can be up to 60 MB."); return; } setError(""); setFile(next); };
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!file || busy) return; setBusy(true); setError("");
    try { const upload = await uploadFile(file, setProgress); const result = await social<{ post: Post }>("post", { mediaUrl: upload.url, mediaType: upload.mediaType, caption, location }); setData((d) => ({ ...d, posts: [result.post, ...d.posts] })); close(); navigate("home"); toast("Your moment is out in the world. ✨"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={modal?.title || "Create a post"} onClose={busy ? () => {} : close} wide={!!file} className="create-backdrop"><input className="visually-hidden" ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(e) => choose(e.target.files?.[0])}/>{!file ? <div className={`upload-dropzone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}><div className="upload-art"><Images size={51} strokeWidth={1.2}/><Video size={28} strokeWidth={1.5}/><Sparkles size={20}/></div><h2>A little piece of your world.</h2><p>Drag a photo or video here.<br/>The everyday is worth sharing.</p><button className="primary-button" onClick={() => input.current?.click()}><Plus size={17}/>Choose from your computer</button><small>JPG, PNG, WebP, MP4 or WebM · Up to 60 MB</small>{error && <div className="form-error" role="alert">{error}</div>}</div> : <form onSubmit={submit}><div className="create-editor"><div className="create-preview">{file.type.startsWith("video/") ? <video src={preview} controls playsInline/> : <img src={preview} alt="Your post preview"/>}<button type="button" onClick={() => input.current?.click()} disabled={busy}><Images size={15}/>Change {file.type.startsWith("video/") ? "video" : "photo"}</button></div><div className="create-details"><div className="create-author"><Avatar user={data.viewer} size={36}/><b>{data.viewer.name}</b></div><label className="caption-field"><span>Tell a little story</span><textarea placeholder="What’s the moment? Add a caption, a thought, a little something…" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={7}/></label><span className="character-count">{caption.length} / 2,200</span><label className="location-field"><MapPin size={17}/><input aria-label="Add a location" placeholder="Add a location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100}/></label><p className="create-hint"><Sparkles size={14}/>A hashtag can help your people find you.</p>{(data.trending || []).length > 0 && <div className="trending-chips"><span>Trending</span>{(data.trending || []).map((t) => <button type="button" key={t.tag} onClick={() => setCaption((c) => { const tag = t.tag.startsWith("#") ? t.tag : `#${t.tag}`; return c.toLowerCase().includes(tag.toLowerCase()) ? c : `${c}${c && !c.endsWith(" ") && !c.endsWith("\n") ? " " : ""}${tag} `; })}>{t.tag.startsWith("#") ? t.tag : `#${t.tag}`}</button>)}</div>}</div></div>{error && <div className="form-error create-error" role="alert">{error}</div>}<div className="create-footer"><span>{busy ? <><LoaderCircle className="spin" size={15}/>{progress < 100 ? `Uploading your moment… ${progress}%` : "Putting on the finishing touches…"}</> : <><ShieldCheck size={15}/>Shared with the Loop community</>}</span><button className="primary-button" disabled={busy}>{busy ? "Sharing…" : "Share your moment"}{!busy && <ArrowUpRight size={16}/>}</button></div>{busy && <div className="upload-progress"><span style={{ width: `${progress}%` }}/></div>}</form>}</Modal>;
}
function EditProfileDialog({ close }: CloseProps) {
  const { data, setData, toast } = useLoop();
  const [name, setName] = useState(data.viewer.name);
  const [username, setUsername] = useState(data.viewer.username);
  const [bio, setBio] = useState(data.viewer.bio);
  const [location, setLocation] = useState(data.viewer.location);
  const [avatar, setAvatar] = useState(data.viewer.avatar);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!photo) return; const url = URL.createObjectURL(photo); setAvatar(url); return () => URL.revokeObjectURL(url); }, [photo]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { let nextAvatar = data.viewer.avatar; if (photo) nextAvatar = (await uploadFile(photo)).url; const result = await social<{ viewer: User }>("profile", { name, username, bio, location, avatar: nextAvatar }); setData((d) => ({ ...d, viewer: result.viewer, posts: d.posts.map((p) => p.author.id === result.viewer.id ? { ...p, author: result.viewer } : p) })); close(); toast("A little more you. Profile updated."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Make it a little more you" onClose={close}><form className="edit-profile-form" onSubmit={submit}><div className="edit-profile-photo"><Avatar user={{ name, avatar }} size={74}/><div><h3>Your profile photo</h3><button type="button" className="text-button" onClick={() => input.current?.click()}><Camera size={14}/>Change photo</button></div><input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(f); }}/></div><div className="form-two-cols"><label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60}/></label><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[a-zA-Z0-9._]{3,30}" maxLength={30}/></label></div><label>A little about you<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} placeholder="Your people want to know you."/><small>{bio.length} / 300</small></label><label>Based in<input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} placeholder="Your corner of the world"/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16}/>Saving…</> : <>Save changes<Check size={16}/></>}</button></form></Modal>;
}
function ShareDialog({ close }: CloseProps) {
  const { modal, data, toast, setModal, view, profileId } = useLoop();
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(`${window.location.origin}/${modal?.post ? `?post=${modal.post.id}` : view === "profile" ? `?view=profile&user=${profileId || data.viewer.id}` : ""}`); }, [modal?.post, view, profileId, data.viewer.id]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); toast("Link copied. A good moment is better shared."); } catch { toast("Select and copy the link below to share it."); } };
  return <Modal title={modal?.title || (modal?.post ? "Pass a little good along" : "Better with your people")} onClose={close}><div className="share-content"><div className="share-symbol"><Send size={27}/></div><p>{modal?.post ? "Know someone who would love this moment?" : "Invite a friend into your little corner of Loop."}</p><div className="copy-link"><input aria-label="Share link" readOnly value={url} onFocus={(e) => e.target.select()}/><button onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copied" : "Copy"}</button></div>{data.chats.length > 0 && <><h3>Send to your people</h3><div className="share-people">{data.chats.slice(0, 4).map((chat) => <button key={chat.id} disabled={!!sending} onClick={async () => { setSending(chat.id); try { await social("message", { id: chat.id, text: `${modal?.post ? "Thought you'd love this little moment ✨" : "Life is better in the loop. Come join me! 👋"}\n${url}` }); close(); toast(`Shared with ${chat.name}.`); } catch (e) { toast((e as Error).message); } finally { setSending(""); } }}><Avatar user={{ name: chat.name, avatar: chat.avatar }} size={43}/><span>{chat.name.split(" ")[0]}</span>{sending === chat.id && <LoaderCircle size={13} className="spin"/>}</button>)}</div></>}<button className="share-new-chat" onClick={() => setModal({ type: "new-chat" })}><Plus size={16}/>Start a new conversation<ArrowUpRight size={15}/></button></div></Modal>;
}
function NewChatDialog({ close }: CloseProps) {
  const { modal, data, setData, navigate, toast } = useLoop();
  const [group, setGroup] = useState(modal?.title === "Create a group");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const people = data.people.filter((p) => `${p.name} ${p.username}`.toLowerCase().includes(query.toLowerCase()));
  async function create() {
    if (!selected.length) return; setBusy(true);
    try { const result = await social<{ chat: Chat }>("create-chat", { userIds: selected, isGroup: group, name }); setData((d) => ({ ...d, chats: [result.chat, ...d.chats.filter((c) => c.id !== result.chat.id)] })); close(); navigate("messages", result.chat.id); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={group ? "Make an inner circle" : "A hello starts here"} onClose={close}><div className="new-chat-content"><div className="new-chat-tabs"><button className={!group ? "selected" : ""} onClick={() => { setGroup(false); setSelected((s) => s.slice(0, 1)); }}><Send size={15}/>Direct message</button><button className={group ? "selected" : ""} onClick={() => setGroup(true)}><UsersRound size={17}/>Group chat</button></div>{group && <label className="group-name-field">Give your circle a name<input placeholder="The weekend people ✨" value={name} onChange={(e) => setName(e.target.value)} maxLength={70}/></label>}<div className="inbox-search"><Search size={16}/><input aria-label="Find people to message" placeholder="Find your people" value={query} onChange={(e) => setQuery(e.target.value)}/></div>{selected.length > 0 && <div className="selected-people">{selected.map((id) => <button key={id} onClick={() => setSelected((s) => s.filter((x) => x !== id))}>{data.people.find((p) => p.id === id)?.name.split(" ")[0]}<X size={12}/></button>)}</div>}<div className="new-chat-people">{people.map((person) => <button className={selected.includes(person.id) ? "selected" : ""} key={person.id} onClick={() => setSelected((s) => s.includes(person.id) ? s.filter((id) => id !== person.id) : group ? [...s, person.id].slice(0, 30) : [person.id])}><Avatar user={person} size={41}/><span><b>{person.name}{person.verified && <Verified/>}</b><small>@{person.username}</small></span><i>{selected.includes(person.id) && <Check size={13}/>}</i></button>)}{!people.length && <EmptyState icon={<Search size={23}/>} title="No people found" text="Try another name, or invite a friend to join Loop."/>}</div><div className="new-chat-footer"><span>{selected.length ? `${selected.length} ${selected.length === 1 ? "person" : "people"} selected` : "Choose your people"}</span><button className="primary-button" disabled={!selected.length || busy || (group && !name.trim())} onClick={create}>{busy ? <LoaderCircle className="spin" size={16}/> : group ? "Create group" : "Start conversation"}<ArrowRight size={16}/></button></div></div></Modal>;
}
function PeopleDialog({ close }: CloseProps) {
  const { modal, data, toggleFollow, openProfile } = useLoop();
  const people = modal?.people || [];
  return <Modal title={modal?.title || "Your people"} onClose={close}><div className="people-dialog-list">{people.map((person) => { const current = data.people.find((p) => p.id === person.id) || person; return <div key={person.id}><Avatar user={person} size={43} onClick={() => { close(); openProfile(person.id); }}/><button onClick={() => { close(); openProfile(person.id); }}><b>{person.name}{person.verified && <Verified/>}</b><span>@{person.demo && person.username.startsWith("alex.m_") ? "alex.morgan" : person.username}</span></button>{person.id !== data.viewer.id && <button className={current.following ? "secondary-button" : "soft-button"} onClick={() => toggleFollow(current)}>{current.following ? "Following" : "Follow"}</button>}</div>; })}{!people.length && <EmptyState icon={<UsersRound size={27}/>} title="Your circle starts here" text={modal?.title === "Followers" ? "New followers will show up here. Starter profiles include an illustrative audience count." : "The people you connect with will show up here."}/>}</div></Modal>;
}
function PreferencesDialog({ close }: CloseProps) {
  const { toast } = useLoop();
  const [preferences, setPreferences] = useState({ photos: true, videos: true });
  useEffect(() => { try { const stored = localStorage.getItem("loop-feed-preferences"); if (stored) setPreferences(JSON.parse(stored)); } catch {} }, []);
  return <Modal title="A feed that feels like you" onClose={close}><div className="preferences-content"><p>Choose what you’d like a little more of.</p>{[{ id: "photos" as const, title: "Photo moments", description: "Little snapshots, big inspiration.", icon: Images }, { id: "videos" as const, title: "Reels & videos", description: "The moments that move you.", icon: Video }].map(({ id, title, description, icon: Icon }) => <label className="preference-row" key={id}><Icon size={23}/><span><b>{title}</b><small>{description}</small></span><input type="checkbox" checked={preferences[id]} onChange={(e) => setPreferences((p) => ({ ...p, [id]: e.target.checked }))}/></label>)}<div className="preferences-note"><Sparkles size={17}/><p>Your Following feed only includes people you follow. Your For you feed brings the whole community together.</p></div><button className="primary-button" onClick={() => { localStorage.setItem("loop-feed-preferences", JSON.stringify(preferences)); window.dispatchEvent(new Event("loop:preferences")); close(); toast("Your feed, your way. Preferences saved."); }}>Save preferences<Check size={16}/></button></div></Modal>;
}
function StoryDialog({ close }: CloseProps) {
  const { modal, data, toggleLike, setData, navigate, toast } = useLoop();
  const people = ["emma", "noah", "olivia", "mia", "jake", "ava"].map((id) => data.people.find((p) => p.id === id)).filter((p) => !!p);
  const [index, setIndex] = useState(Math.max(0, people.findIndex((p) => p.id === modal?.user?.id)));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const person = people[index];
  const post = data.posts.find((p) => p.author.id === person?.id);
  useEffect(() => { setProgress(0); }, [index]);
  useEffect(() => { if (paused || busy) return; const timer = setInterval(() => setProgress((p) => Math.min(100, p + 1)), 85); return () => clearInterval(timer); }, [paused, busy, index]);
  useEffect(() => { if (progress >= 100) { if (index < people.length - 1) setIndex((i) => i + 1); else close(); } }, [progress, index, people.length, close]);
  if (!person) return null;
  async function send(e: FormEvent) {
    e.preventDefault(); if (!reply.trim()) return; setBusy(true);
    try { const { chat } = await social<{ chat: Chat }>("create-chat", { userIds: [person.id] }); await social("message", { id: chat.id, text: `Replied to your moment: ${reply.trim()}` }); setData((d) => ({ ...d, chats: [{ ...chat, lastMessage: reply.trim(), lastMessageAt: new Date().toISOString() }, ...d.chats.filter((c) => c.id !== chat.id)] })); close(); navigate("messages", chat.id); toast("Your reply has been sent."); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal onClose={close} className="story-backdrop"><div className="story-viewer" onPointerDown={() => setPaused(true)} onPointerUp={() => { if (!reply) setPaused(false); }}><div className="story-progress">{people.map((p, i) => <span key={p.id}><i style={{ width: `${i < index ? 100 : i === index ? progress : 0}%` }}/></span>)}</div><div className="story-person"><Avatar user={person} size={33}/><b>{person.username}</b>{person.verified && <Verified/>}<span>Today</span></div>{post?.mediaType === "video" ? <video className="story-photo" src={post.mediaUrl} poster={post.thumbnail || undefined} autoPlay muted loop playsInline/> : <img className="story-photo" src={post?.mediaUrl || "/images/flowers.jpg"} alt={`${person.name}'s moment`}/>}<div className="story-caption"><span>A LITTLE MOMENT FROM</span><h2>{post?.location || person.location}</h2><p>{post?.caption.split("\n")[0]}</p></div><button className="story-prev" aria-label="Previous story" disabled={!index} onClick={() => setIndex((i) => Math.max(0, i - 1))}><ChevronLeft size={25}/></button><button className="story-next" aria-label="Next story" onClick={() => { if (index === people.length - 1) close(); else setIndex((i) => i + 1); }}><ChevronRight size={25}/></button><form className="story-reply" onSubmit={send}><input placeholder={`Reply to ${person.name.split(" ")[0]}…`} aria-label="Reply to story" value={reply} onFocus={() => setPaused(true)} onChange={(e) => setReply(e.target.value)} maxLength={1000}/><button aria-label="Send story reply" disabled={!reply.trim() || busy}>{busy ? <LoaderCircle className="spin" size={21}/> : <Send size={21}/>}</button>{post && <button type="button" aria-label="Like story" onClick={() => toggleLike(post)}><Heart size={23} fill={post.liked ? "#f04f84" : "none"}/></button>}</form></div></Modal>;
}
function InfoDialog({ close }: CloseProps) {
  const { modal } = useLoop();
  const title = modal?.title || "A little about Loop";
  const documents: Record<string, { heading: string; text: string }[]> = {
    About: [{ heading: "Your world, a little closer.", text: "Loop is a place to share moments, find inspiration, and feel a little closer to your people. From your morning coffee to a once-in-a-lifetime view, there's room for it here." }, { heading: "A real place to connect.", text: "Posts, comments, follows, and conversations are saved to PostgreSQL. Messages appear instantly on your screen and are delivered through a live server connection. Starter profiles and moments are curated examples, not online users." }],
    Guidelines: [{ heading: "Be someone's good part of the day.", text: "Treat people with care. Harassment, hate speech, threats, exploitation, and non-consensual intimate content have no place on Loop." }, { heading: "Make it yours.", text: "Only upload content you created or have permission to share. Respect privacy, give credit, and don't impersonate other people. Never share someone's private details or messages without permission." }],
    Privacy: [{ heading: "Your account, thoughtfully handled.", text: "Loop stores your profile details, posts, interactions, and messages to provide the service. Passwords are salted and securely hashed. Session tokens are stored in HttpOnly cookies and expire after 30 days." }, { heading: "Your conversations.", text: "Messages can only be accessed by conversation members through the application. They are stored on the server and are not end-to-end encrypted. Saved posts are private to your account. Profiles and published posts are public." }, { heading: "You're in control.", text: "You can edit your profile, delete your own posts, remove saved moments, and disable browser push notifications in Settings. Browser push subscriptions are used only to deliver your Loop notifications." }],
    Terms: [{ heading: "A little mutual understanding.", text: "Use Loop responsibly and lawfully. You retain ownership of the content you share and permit Loop to store and display it so the service can work." }, { heading: "About this version.", text: "Loop v1 is an early application with curated sample content. Availability and delivery times can depend on your device, network, and server connection. No internet service can guarantee literal zero latency." }],
  };
  return <Modal title={title} onClose={close}><div className="info-document"><div className="info-icon"><Sparkles size={25}/></div>{modal?.text ? <p>{modal.text}</p> : (documents[title] || documents.About).map((section) => <section key={section.heading}><h3>{section.heading}</h3><p>{section.text}</p></section>)}<span className="info-signoff">A LITTLE KINDNESS GOES A LONG WAY. ♡</span></div></Modal>;
}
