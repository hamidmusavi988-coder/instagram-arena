"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Plus, ChevronRight, ChevronLeft, Smile, SlidersHorizontal, Sparkles, ArrowUpRight, TrendingUp, Volume2, VolumeX, Music2, Play, Pause, MapPin, Check, UsersRound } from "lucide-react";
import type { Post, Comment } from "@/lib/types";
import { useLoop, social, api } from "@/components/loop-context";
import { Avatar, Verified, IconButton, EmptyState, timeAgo, compact } from "@/components/ui";

export function Stories() {
  const { data, setModal } = useLoop();
  const list = useRef<HTMLDivElement>(null);
  const people = ["emma", "noah", "olivia", "mia", "jake", "ava"].map((id) => data.people.find((p) => p.id === id)).filter((p) => !!p);
  return <div className="stories-shell"><div className="stories" ref={list}><button className="story own-story" onClick={() => setModal({ type: "create", title: "Share your moment" })}><div className="story-ring"><Avatar user={data.viewer} size={58}/><span className="story-add"><Plus size={13} strokeWidth={3}/></span></div><span>Your story</span></button>{people.map((person, index) => <button key={person.id} className="story" onClick={() => setModal({ type: "story", user: person, storyIndex: index })}><div className="story-ring"><Avatar user={person} size={58}/></div><span>{person.username}</span></button>)}</div><button className="stories-next" aria-label="Next stories" onClick={() => { if (list.current && list.current.scrollWidth > list.current.clientWidth) list.current.scrollBy({ left: 170, behavior: "smooth" }); else setModal({ type: "story", user: people[people.length - 1] }); }}><ChevronRight size={16}/></button></div>;
}
export function FeedView({ saved = false }: { saved?: boolean }) {
  const { data, navigate, setModal, setData, toast } = useLoop();
  const [tab, setTab] = useState("for-you");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [preferences, setPreferences] = useState({ photos: true, videos: true });
  async function loadMore() {
    if (loadingMore || exhausted || !data.posts.length) return;
    setLoadingMore(true);
    try {
      const oldest = [...data.posts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      const result = await api<{ posts: Post[] }>(`/api/social?resource=feed&before=${encodeURIComponent(oldest.createdAt)}`);
      const fresh = result.posts.filter((p) => !data.posts.some((d) => d.id === p.id));
      if (!fresh.length) { setExhausted(true); toast("That is everything for now. You are all caught up."); }
      else setData((d) => ({ ...d, posts: [...d.posts, ...fresh.filter((p) => !d.posts.some((x) => x.id === p.id))] }));
    } catch (e) { toast((e as Error).message); } finally { setLoadingMore(false); }
  }
  useEffect(() => {
    const sync = () => { try { const p = localStorage.getItem("loop-feed-preferences"); if (p) setPreferences(JSON.parse(p)); } catch {} };
    sync(); window.addEventListener("loop:preferences", sync); return () => window.removeEventListener("loop:preferences", sync);
  }, []);
  const filtered = data.posts.filter((p) => (!saved || p.saved) && (saved || tab !== "following" || data.people.some((u) => u.id === p.author.id && u.following)) && (p.mediaType === "video" ? preferences.videos : preferences.photos));
  return <>{!saved && <Stories/>}<div className="feed-tabs">{saved ? <div className="saved-label"><Bookmark size={17}/><b>All saved moments</b><span>{filtered.length}</span></div> : <div className="feed-tab-buttons"><button className={tab === "for-you" ? "selected" : ""} onClick={() => setTab("for-you")}>For you<Sparkles size={14}/></button><button className={tab === "following" ? "selected" : ""} onClick={() => setTab("following")}>Following</button></div>}<button className="feed-preferences" onClick={() => setModal({ type: "feed-preferences" })}><SlidersHorizontal size={15}/><span>Feed preferences</span></button></div><div className="post-list">{filtered.map((p) => <PostCard key={p.id} post={p}/>)}{!filtered.length && <EmptyState icon={saved ? <Bookmark size={28}/> : <UsersRound size={28}/>} title={saved ? "Keep a little inspiration" : "Find your people"} text={saved ? "Tap the bookmark on any post to save it here. Your collection is just for you." : "Follow a few creators or adjust your feed preferences to see more moments here."} action={<button className="primary-button" onClick={() => navigate("explore")}>Explore something new <ArrowUpRight size={16}/></button>}/>}{!saved && !exhausted && filtered.length > 0 && <button className="secondary-button load-more-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading older moments…" : "Load older moments"}</button>}<div className="feed-end"><Sparkles size={20}/><span>You’re all caught up on these little moments.</span><small>There’s always something new to discover.</small><button onClick={() => navigate("explore")}>Explore more <ArrowUpRight size={13}/></button></div></div></>;
}
export function PostMedia({ post, reel = false }: { post: Post; reel?: boolean }) {
  const { toggleLike } = useLoop();
  const [slide, setSlide] = useState(0);
  // Videos always start muted: browsers block audible autoplay, and a feed
  // that suddenly plays sound is a nasty surprise. The volume button unmutes.
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const slides = post.id === "coastal-daydream" ? [post.mediaUrl, "/images/positano-sun.jpg", "/images/positano.jpg"] : [post.mediaUrl];
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && playing) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.45 });
    observer.observe(el); return () => observer.disconnect();
  }, [playing]);
  return <div className={`post-media ${reel ? "reel-media" : ""}`} onDoubleClick={() => { setBurst(true); window.setTimeout(() => setBurst(false), 650); if (!post.liked) toggleLike(post); }}>
    {burst && <span className="like-burst" aria-hidden="true"><Heart size={84} fill="currentColor"/></span>}
    {post.mediaType === "video" ? <><video ref={video} src={post.mediaUrl} poster={post.thumbnail || undefined} autoPlay={reel} loop muted={muted} playsInline preload="metadata" onError={() => setFailed(true)} aria-label={post.caption.split("\n")[0]}/><button className="media-play" aria-label={playing ? "Pause video" : "Play video"} onClick={() => { const next = !playing; setPlaying(next); if (next) video.current?.play().catch(() => {}); else video.current?.pause(); }}>{playing ? <Pause size={16}/> : <Play size={17}/>}</button><div className="media-audio"><Music2 size={13}/><span>{post.audio}</span></div><button className="media-volume" aria-label={muted ? "Unmute video" : "Mute video"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>{failed && <div className="video-error"><p>This video couldn't load.</p><button onClick={() => { setFailed(false); video.current?.load(); }}>Try again</button></div>}</> : <><img src={slides[slide]} alt={post.id === "coastal-daydream" ? "Pastel houses and colorful beach umbrellas along the turquoise Positano coast" : post.caption.split("\n")[0]} loading={post.id === "coastal-daydream" ? "eager" : "lazy"}/>{slides.length > 1 && <><span className="slide-count">{slide + 1} / {slides.length}</span>{slide > 0 && <button className="carousel-arrow carousel-prev" aria-label="Previous photo" onClick={() => setSlide(slide - 1)}><ChevronLeft size={20}/></button>}{slide < slides.length - 1 && <button className="carousel-arrow" aria-label="Next photo" onClick={() => setSlide(slide + 1)}><ChevronRight size={20}/></button>}<div className="carousel-dots">{slides.map((_, i) => <button key={i} aria-label={`View photo ${i + 1}`} className={slide === i ? "active" : ""} onClick={() => setSlide(i)}/>)}</div></>}</>}
  </div>;
}
export function PostCard({ post, expanded = false }: { post: Post; expanded?: boolean }) {
  const { data, setData, toggleLike, toggleSave, openProfile, setModal, toast } = useLoop();
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [showComments, setShowComments] = useState(expanded);
  const [menu, setMenu] = useState(false);
  const [reacting, setReacting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const emma = data.people.find((p) => p.id === "emma");
  async function addComment(e: FormEvent) {
    e.preventDefault(); if (!comment.trim() || posting) return;
    setPosting(true);
    try {
      const result = await social<{ comment: Comment }>("comment", { id: post.id, text: comment });
      setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? { ...p, comments: [...p.comments, result.comment], commentCount: p.commentCount + 1 } : p) }));
      setComment(""); setShowComments(true);
    } catch (e) { toast((e as Error).message); } finally { setPosting(false); }
  }
  return <article className="post-card"><header className="post-header"><div className="post-author"><Avatar user={post.author} size={39} onClick={() => openProfile(post.author.id)}/><div><div className="post-author-line"><button onClick={() => openProfile(post.author.id)}>{post.author.username}</button>{post.author.verified && <Verified/>}<span className="post-time">· {timeAgo(post.createdAt)}</span></div><span className="post-location">{post.location || "A little moment on Loop"}</span></div></div><div className="post-menu-wrap"><IconButton label="Post options" onClick={() => setMenu(!menu)}><MoreHorizontal size={21}/></IconButton>{menu && <><button className="popover-dismiss" aria-label="Close post options" onClick={() => setMenu(false)}/><div className="post-menu"><button onClick={() => { openProfile(post.author.id); setMenu(false); }}>View profile</button><button onClick={() => { setModal({ type: "share", post }); setMenu(false); }}>Share this moment</button><button onClick={() => { window.open(post.mediaUrl, "_blank", "noopener"); setMenu(false); }}>Open original {post.mediaType === "video" ? "video" : "photo"}</button><button onClick={() => { setModal({ type: "info", title: "About this moment", text: `Shared by ${post.author.name} from ${post.location || "their little corner of the world"}. Posted ${new Date(post.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. ${post.id.length < 30 ? "This is a curated sample post to help you explore Loop. Engagement counts include illustrative sample activity." : "An original moment from the Loop community."}` }); setMenu(false); }}>About this post</button>{post.author.id === data.viewer.id && <button onClick={async () => { const next = window.prompt("Edit your caption:", post.caption); if (next === null || next.trim() === post.caption) { setMenu(false); return; } try { const result = await social<{ post: Post | null }>("edit-post", { id: post.id, caption: next.trim(), location: post.location }); if (result.post) setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? result.post! : p) })); toast("Caption updated."); } catch (e) { toast((e as Error).message); } setMenu(false); }}>Edit caption</button>}{post.author.id === data.viewer.id && <button className="danger-text" onClick={async () => { if (!window.confirm("Delete this moment? This can't be undone.")) return; try { await social("delete-post", { id: post.id }); setData((d) => ({ ...d, posts: d.posts.filter((p) => p.id !== post.id) })); setModal(null); toast("Moment deleted."); } catch (e) { toast((e as Error).message); } }}>Delete post</button>}</div></>}</div></header>
    <PostMedia post={post}/>
    <div className="post-content"><div className="post-actions"><div><IconButton label={post.liked ? "Unlike post" : "Like post"} className={post.liked ? "is-liked" : ""} disabled={reacting} onClick={async () => { setReacting(true); await toggleLike(post); setReacting(false); }}><Heart size={23} fill={post.liked ? "currentColor" : "none"} strokeWidth={1.7}/></IconButton><IconButton label="Comment on post" onClick={() => { setShowComments(!showComments); if (!showComments) setTimeout(() => input.current?.focus(), 40); }}><MessageCircle size={23} strokeWidth={1.7}/></IconButton><IconButton label="Share post" onClick={() => setModal({ type: "share", post })}><Send size={23} strokeWidth={1.7}/></IconButton></div><IconButton label={post.saved ? "Unsave post" : "Save post"} className={post.saved ? "is-saved" : ""} onClick={() => toggleSave(post)}><Bookmark size={23} fill={post.saved ? "currentColor" : "none"} strokeWidth={1.7}/></IconButton></div>
      <div className="liked-by">{post.id.length < 30 && <div className="liked-avatars">{["emma", "noah", "mia"].map((id) => { const person = data.people.find((p) => p.id === id); return person && <Avatar key={id} user={person} size={19}/>; })}</div>}<span>{post.liked ? post.likes === 1 ? <b>You like this</b> : <>You and <b>{compact(post.likes - 1)} others</b> like this</> : emma && post.id.length < 30 && post.likes > 1 ? <>Liked by <button onClick={() => openProfile(emma.id)}>emma.wilson</button> and <b>{compact(post.likes - 1)} others</b></> : <b>{post.likes} {post.likes === 1 ? "like" : "likes"}</b>}</span></div>
      <div className="post-caption"><button className="caption-username" onClick={() => openProfile(post.author.id)}>{post.author.username}</button>{" "}{post.caption.split("\n")[0]}{post.caption.includes("\n") && <div className="hashtags">{post.caption.split("\n").slice(1).join(" ").split(" ").map((tag, i) => <Tag key={`${tag}-${i}`} tag={tag}/>)}</div>}</div>
      <button className="view-comments" onClick={() => setShowComments(!showComments)}>{showComments ? "Hide comments" : post.commentCount ? `View all ${post.commentCount} comments` : "Be the first to leave a little love"}</button>
      {showComments && <div className="comments-list">{post.comments.map((c) => <div className="comment" key={c.id}><Avatar user={c.user} size={27} onClick={() => openProfile(c.user.id)}/><div><p><button onClick={() => openProfile(c.user.id)}>{c.user.username}</button> {c.text}</p><small>{timeAgo(c.createdAt)} · <button onClick={() => { setComment(`@${c.user.username} `); input.current?.focus(); }}>Reply</button>{(c.user.id === data.viewer.id || post.author.id === data.viewer.id) && <> · <button onClick={async () => { try { await social("delete-comment", { commentId: c.id }); setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === post.id ? { ...p, comments: p.comments.filter((x) => x.id !== c.id), commentCount: Math.max(0, p.commentCount - 1) } : p) })); toast("Comment deleted."); } catch (e) { toast((e as Error).message); } }}>Delete</button></>}</small></div></div>)}{!post.comments.length && <p className="no-comments">A good conversation starts with you.</p>}</div>}
    </div><form className="comment-form" onSubmit={addComment}><IconButton label="Add a smile" onClick={() => { setComment((c) => c + " 😊"); input.current?.focus(); }}><Smile size={19} strokeWidth={1.6}/></IconButton><input ref={input} aria-label="Add a comment" placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}/><button className="post-comment-button" disabled={!comment.trim() || posting}>{posting ? "Posting…" : "Post"}</button></form>
  </article>;
}
function Tag({ tag }: { tag: string }) { const { setQuery, navigate } = useLoop(); return <button onClick={() => { setQuery(tag); navigate("explore"); }}>{tag}{" "}</button>; }
export function RightRail() {
  const { data, openProfile, setModal, navigate, toggleFollow, setQuery } = useLoop();
  const suggested = data.people.filter((p) => !["olivia", "emma", "noah"].includes(p.id)).slice(0, 4);
  const trendImages = ["/images/coast-22703234.jpg", "/images/matcha.jpg", "/images/pottery.jpg", "/images/ocean.jpg", "/images/flowers.jpg"];
  const liveTrends = (data.trending || []).slice(0, 5).map((t, i) => ({ tag: t.tag, count: `${t.count} ${t.count === 1 ? "moment" : "moments"} and counting`, image: trendImages[i % trendImages.length] }));
  const trends = liveTrends.length ? liveTrends : [{ tag: "#summerinframes", count: "Sun-soaked little moments", image: "/images/coast-22703234.jpg" }, { tag: "#slowmornings", count: "A softer start to the day", image: "/images/matcha.jpg" }, { tag: "#madeofmoments", count: "Finding joy in the everyday", image: "/images/pottery.jpg" }];
  return <aside className="right-rail"><div className="rail-profile"><Avatar user={data.viewer} size={48} onClick={() => openProfile(data.viewer.id)}/><button className="rail-profile-name" onClick={() => openProfile(data.viewer.id)}><b>{data.viewer.name}</b><span>@{data.viewer.demo && data.viewer.username.startsWith("alex.m_") ? "alex.morgan" : data.viewer.username}</span></button><button className="text-button" onClick={() => setModal({ type: "auth" })}>Switch</button></div>
    <section className="suggestions"><div className="rail-section-heading"><h2>Suggested for you</h2><button onClick={() => { setQuery(""); navigate("explore"); }}>See all</button></div><div className="suggestion-list">{suggested.map((person, i) => <div className="suggestion" key={person.id}><Avatar user={person} size={37} onClick={() => openProfile(person.id)}/><button className="suggestion-name" onClick={() => openProfile(person.id)}><b>{person.username}{person.verified && <Verified/>}</b><span>{["A little everyday inspiration", "For your next adventure", "Creativity, made by hand", "Stories through a lens"][i]}</span></button><button className={`follow-button ${person.following ? "following" : ""}`} onClick={() => toggleFollow(person)}>{person.following ? <><Check size={11}/>Following</> : "Follow"}</button></div>)}</div></section>
    <section className="trending"><div className="rail-section-heading"><h2>Trending right now</h2><TrendingUp size={17}/></div>{trends.map((trend, i) => <button className="trend" key={trend.tag} onClick={() => { setQuery(trend.tag); navigate("explore"); }}><img src={trend.image} alt=""/><span><b>{trend.tag}</b><small>{trend.count}</small></span><ArrowUpRight size={15}/>{i === 0 && <i className="trend-hot"/>}</button>)}</section>
    <div className="connect-card"><div className="connect-decoration"><div className="chat-doodle doodle-one"><span/><span/><span/></div><div className="chat-doodle doodle-two"><Heart size={16} fill="currentColor"/></div><Sparkles className="doodle-sparkle" size={16}/><i className="doodle-dot"/></div><span className="connect-eyebrow"><i/>REAL PEOPLE. REAL CONNECTIONS.</span><h3>Good chats.<br/>Great connections.</h3><p>Your people are only a hello away.</p><button onClick={() => navigate("messages")}>Let’s talk <ArrowUpRight size={17}/></button></div>
    <footer className="rail-footer"><div>{["About", "Guidelines", "Privacy", "Terms"].map((title) => <button key={title} onClick={() => setModal({ type: "info", title })}>{title}</button>)}</div><button onClick={() => setModal({ type: "info", title: "Made for your moments", text: "Loop is a place to share the little things, discover something inspiring, and feel a little closer to your people. Photography: Pexels and Unsplash. All starter profiles and posts are curated examples; your posts, follows, comments, and messages are saved to the real server." })}>© 2026 LOOP · MADE FOR YOUR MOMENTS</button></footer>
  </aside>;
}
