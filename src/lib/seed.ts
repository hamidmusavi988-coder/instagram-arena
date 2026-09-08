import { db } from "@/db";
import { users, posts, comments } from "@/db/schema";
import { sampleContentEnabled } from "@/lib/demo-content";

export const seedPeople = [
  { id: "olivia", username: "olivia.chen", name: "Olivia Chen", avatar: "/images/olivia.jpg", bio: "Collecting moments, not things. 🌊\nSomewhere with a view.", location: "San Francisco, CA", verified: true, baseFollowers: 12840 },
  { id: "emma", username: "emma.wilson", name: "Emma Wilson", avatar: "/images/emma.jpg", bio: "A little coffee, a little creativity. ☕\nMaking the everyday feel special.", location: "Brooklyn, NY", verified: false, baseFollowers: 4268 },
  { id: "noah", username: "noah.creates", name: "Noah Williams", avatar: "/images/noah.jpg", bio: "Designing things. Chasing light.\nLet's make something good.", location: "Los Angeles, CA", verified: true, baseFollowers: 8320 },
  { id: "mia", username: "mia.rose", name: "Mia Rose", avatar: "/images/mia.jpg", bio: "Life in little squares. 🌷\nArt, flowers & the in-between.", location: "Portland, OR", verified: false, baseFollowers: 3152 },
  { id: "jake", username: "jake.travels", name: "Jake Miller", avatar: "/images/jake.jpg", bio: "Taking the scenic route. 🏔️\nNext stop: everywhere.", location: "Denver, CO", verified: false, baseFollowers: 5692 },
  { id: "ava", username: "ava.studio", name: "Ava Thompson", avatar: "/images/ava.jpg", bio: "Slow living, thoughtful making.\nCeramics & everyday rituals.", location: "Austin, TX", verified: true, baseFollowers: 6104 },
  { id: "daniel", username: "daniel.kim", name: "Daniel Kim", avatar: "/images/daniel.jpg", bio: "Visual stories, one frame at a time. 📷", location: "Seattle, WA", verified: false, baseFollowers: 2134 },
  { id: "sarah", username: "sarah.james", name: "Sarah James", avatar: "/images/sarah.jpg", bio: "Finding beauty in the ordinary. ✨", location: "New York, NY", verified: false, baseFollowers: 1740 },
];
let seedPromise: Promise<void> | undefined;
export function ensureSeed() {
  if (!sampleContentEnabled()) return Promise.resolve();
  if (!seedPromise) seedPromise = seed().catch((e) => { seedPromise = undefined; throw e; });
  return seedPromise;
}
async function seed() {
  await db.insert(users).values(seedPeople).onConflictDoNothing();
  const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
  await db.insert(posts).values([
    { id: "coastal-daydream", authorId: "olivia", caption: "A little sun, a little sea, and nowhere else to be. 🍋\n#summerinframes #positano #madeofmoments", mediaUrl: "/images/coast-22703234.jpg", thumbnail: "/images/coast-22703234.jpg", mediaType: "image", location: "Positano, Italy", audio: "La dolce vita · Original audio", baseLikes: 1284, baseComments: 0, createdAt: ago(2) },
    { id: "slow-mornings", authorId: "emma", caption: "Romanticizing my morning, one matcha at a time. 🍵\n#slowmornings #littlethings #cafediaries", mediaUrl: "/images/matcha.jpg", thumbnail: "/images/matcha.jpg", location: "Sunday in Brooklyn", baseLikes: 862, createdAt: ago(4) },
    { id: "ocean-therapy", authorId: "jake", caption: "If you need me, I'll be right here. 🌊\n#oceantherapy #summerinframes #travel", mediaUrl: "https://videos.pexels.com/video-files/17086197/17086197-hd_720_1280_60fps.mp4", thumbnail: "/images/ocean.jpg", mediaType: "video", location: "The slow coast", audio: "Ocean sounds · Original audio", baseLikes: 2410, createdAt: ago(5) },
    { id: "made-by-hand", authorId: "ava", caption: "A reminder that good things take a little time. Fresh from the studio. 🤎\n#madeofmoments #ceramics #slowmornings", mediaUrl: "/images/pottery.jpg", thumbnail: "/images/pottery.jpg", location: "The little studio, Austin", baseLikes: 634, createdAt: ago(7) },
    { id: "city-light", authorId: "noah", caption: "The city has a way of making an ordinary Tuesday feel like a movie.\n#citystories #architecture #madeofmoments", mediaUrl: "/images/city.jpg", thumbnail: "/images/city.jpg", location: "New York, New York", baseLikes: 942, createdAt: ago(9) },
    { id: "flower-market", authorId: "mia", caption: "Flowers for absolutely no reason. The best reason. 🌸\n#littlethings #flowers #weekendmood", mediaUrl: "/images/flowers.jpg", thumbnail: "/images/flowers.jpg", location: "The Saturday market", baseLikes: 517, createdAt: ago(12) },
  ]).onConflictDoNothing();
  await db.insert(comments).values([
    { id: "seed-comment-1", postId: "coastal-daydream", userId: "emma", text: "This is what my daydreams look like 😍", createdAt: ago(1.5) },
    { id: "seed-comment-2", postId: "coastal-daydream", userId: "jake", text: "The coast never gets old. Adding this spot to my list!", createdAt: ago(1) },
    { id: "seed-comment-3", postId: "coastal-daydream", userId: "mia", text: "Every shade of summer 💛", createdAt: ago(0.5) },
    { id: "seed-comment-4", postId: "slow-mornings", userId: "ava", text: "The perfect start to the day 🍵", createdAt: ago(3) },
  ]).onConflictDoNothing();
}
