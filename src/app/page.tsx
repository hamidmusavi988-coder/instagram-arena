import LoopApp from "@/components/loop-app";
import { ensureSeed } from "@/lib/seed";
import { getFeed, getPeople, getBootstrap, getTrendingHashtags } from "@/lib/data";
import { getViewer } from "@/lib/auth";
import { sampleContentEnabled } from "@/lib/demo-content";
import type { Bootstrap } from "@/lib/types";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  await ensureSeed();
  const viewer = await getViewer();
  if (viewer) return <LoopApp initial={await getBootstrap(viewer)}/>;
  const [posts, people, trending] = await Promise.all([getFeed(undefined, { random: true }), getPeople(), getTrendingHashtags().catch(() => [])]);
  const samples = sampleContentEnabled();
  const initial: Bootstrap = {
    viewer: {
      id: "", username: samples ? "alex.morgan" : "guest", name: samples ? "Alex Morgan" : "Guest",
      avatar: samples ? "/images/alex.jpg" : "/icon.svg", bio: samples ? "Finding the good in the everyday. ☀️" : "",
      location: samples ? "Brooklyn, NY" : "", verified: false, demo: true, baseFollowers: 0,
    },
    posts, people, notifications: [], chats: [], trending, googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };
  return <LoopApp initial={initial}/>;
}
