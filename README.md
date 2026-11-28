# Loop

An Instagram-inspired social web app built with Next.js App Router, PostgreSQL, and Drizzle ORM.

**This is a real fullstack MVP with sample starter content—not just a frontend demo.** Accounts, social interactions, uploads, and messages are saved on a server. Starter creators and conversations are curated examples, not online users or automatic replies.

## Deploy on Vercel

Follow **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)** for the complete step-by-step guide.

Recommended: **Vercel + Neon PostgreSQL + public Vercel Blob + Pusher Channels**. All integrations are implemented; your own service credentials are needed to activate the hosted providers. The local preview works without Blob/Pusher credentials using persistent local uploads and SSE.

- `vercel.json` selects Next.js, runs a configuration preflight, and uses the `iad1` function region.
- `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` or `DATABASE_URL`, not a hardcoded localhost URL.
- `.env.example` documents server-side environment variables without secrets.
- `.gitignore` and `.vercelignore` exclude local credentials, uploads, and build artifacts.

## Included

- Responsive photo/video feed, carousel posts, story previews, discovery, profiles, and vertical Reels.
- Persisted likes, comments, follows, saved collections, profile edits, and activity notifications.
- Email/password authentication with salted scrypt hashes and database-backed HttpOnly sessions.
- Google OAuth authorization-code flow with state verification and PKCE (credentials required).
- Direct/group messaging with optimistic rendering, member-checked history, reconnect recovery, optional private Pusher channels, and an SSE/database reconciliation fallback.
- JPG/PNG/WebP and MP4/WebM uploads up to 60 MB, type/signature validation, and upload ownership enforcement.
- Direct-to-Blob browser uploads on Vercel, bypassing the function request-body limit; byte-range delivery for local videos.
- Browser push through a service worker and persisted VAPID keys.

## Environment and setup

`DATABASE_URL` is required. Keep its provider-supplied TLS options. Use a hosted pooled URL on Vercel. `DATABASE_URL_UNPOOLED` is recommended for Drizzle schema setup against the same database.

Cloud uploads require `BLOB_READ_WRITE_TOKEN` from a **public** Blob store. Cloud uploading and all social writes on Vercel require a registered account. Local guest interactions remain available in the preview.

For managed live delivery, set all of `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, and `PUSHER_CLUSTER`. Only the public key/cluster and the current user's authorized private channel are returned to browsers. Message text remains in PostgreSQL, not in provider event payloads.

For Google, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL`, and register `${APP_URL}/api/auth/google/callback` in Google Cloud. Email sign-in works without Google.

Set `SEED_DEMO_CONTENT=false` before first use of a **fresh** production database to launch without sample users/posts or initial conversations. It does not delete previously seeded data.

Push reads optional `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. If both keys are omitted, the server generates a pair once and persists it privately in PostgreSQL. Push requires HTTPS, a compatible browser, and permission.

After the environment is bootstrapped, run `npx drizzle-kit push --config=drizzle.config.ts` to apply the schema. Schema changes are intentionally not performed during every Vercel build. Back up existing production data and adopt reviewed versioned migrations for subsequent production changes.

## Local/persistent Node hosting

Without a Blob token and outside Vercel, uploads are written to `.data/uploads`. Use a persistent volume for that directory and a persistent PostgreSQL database. Never treat a serverless temporary directory as durable storage. On Vercel, missing Blob configuration produces an explicit error instead of silently using local disk.

The SSE fallback reconciles database changes every two seconds and rotates before Vercel's function deadline. The browser resynchronizes on reconnect/focus. Pusher is recommended on Vercel for low-latency cross-instance delivery and fewer long-running function invocations. No internet service can guarantee literal zero latency.

## Validation

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- `node scripts/deployment-check.mjs` checks Vercel configuration guards without contacting external services.
- `node scripts/visual-check.mjs` checks desktop/mobile/inbox rendering against a running local preview.
- `node --env-file=.env scripts/e2e.mjs` exercises accounts, social persistence, uploads, media ownership, ranges, conversation authorization, live two-account delivery, groups, and notifications. It removes its test accounts/content afterward. Its video fixture is `artifacts/test-video.mp4`.
- `node --env-file=.env scripts/mobile-check.mjs` checks mobile navigation, search, group creation, sharing, preferences, and upload previews.

The functional tests target the local/SSE storage setup with starter content enabled. Blob and Pusher must additionally be verified against your real provider accounts on a deployed HTTPS domain; local passes do not establish hosted-provider connectivity.

## Advanced additions

- **Anti-abuse rate limiting** (`src/lib/rate-limit.ts`): per-account sliding-window limits on the social API — a general action budget plus a stricter budget for creating posts, comments, and messages, returning `429` with a retry hint.
- **Real trending hashtags**: counted live from recent post captions (`getTrendingHashtags`), served at `?resource=trending`, included in the bootstrap payload, and shown in the right rail instead of a hardcoded list.
- **Cursor-paginated feed**: `?resource=feed&before=<ISO timestamp>&limit=<n>` returns older posts; the home feed has a "Load older moments" button that appends them without duplicates.
- **Post & comment moderation by owners**: authors can edit a post's caption (`edit-post`), and a comment can be deleted by its author or by the post's author (`delete-comment`), both wired into the post UI.
- **Search hardening**: LIKE wildcards (`%`, `_`, `\`) in user search text are escaped, so a query matches literally instead of matching everything.
- **Security response headers**: `next.config.ts` now sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, and HSTS on every route.

## Feature pack 2

- **Creator insights**: `?resource=insights` aggregates your posts, likes received, comments, saves, and follower counts; your own profile shows a private insights strip with a shortcut to your most-liked post.
- **Trending hashtag chips** in the Create dialog: one tap appends a live trending hashtag to your caption (no duplicates).
- **Recent searches** on Explore: your last six searches are kept on-device, shown as chips, and can be cleared.
- **Follower counts** on people cards in Explore, from real follow data plus each profile's base audience.
- **Open original** in every post's menu: opens the full-size photo or video in a new tab.
- **Heart red on black theme**: the whole app (and app icon) moved from the pink/white palette to heart red (#ff3040) on black.

## Instagram-style feature pack

- **View counts**: a post counts a view when it is mostly on screen for ~1 second (once per viewer session), shown under videos in the feed, at the top of the Reels rail, in Post insights, and as a total in profile Insights. Counts are stored in a `views` column — run `migrations/add-views.sql` once in your Postgres console to enable real counting; the app works before and after, counts simply stay 0 until the column exists.
- **Repost**: any post's ⋯ menu can repost it to your profile with credit to the original author, who gets a notification.
- **Mute accounts**: mute anyone from a post's ⋯ menu; their posts disappear from your feed and reels (stored on your device; manage the list in Settings → Privacy).
- **Hide like counts**: Settings → Privacy toggle hides other people's like counts for you, in the feed and on reels.
- **Download your data**: Settings → Privacy exports a JSON file with your profile, posts, and stats.
- Already present before this pack: story replies and story likes (in the story viewer), DMs with photos, follow/unfollow, saves, comments with mentions, hashtags, notifications, push notifications, and creator insights.

## Requested adjustments

- **Videos play unmuted by default**, as originally.
- **One tap pauses/plays** a video; a double tap still likes (with the heart burst) and never pauses.
- **Post insights**: your own posts have a "Post insights" entry in their ⋯ menu with likes, comments, and saves.
- **Interest-ranked feed**: the main feed is scored on the server by what each viewer actually engages with — hashtags from posts they liked or saved count most, posts from people they follow get a boost, popularity adds a little, and a small random jitter keeps it fresh. It is neither newest-first nor purely random. Profile, saved, following, and search lists stay in time order; "Load older moments" pulls another shuffle and de-duplicates.
- **Reels, full-screen**: reels now fill the screen edge-to-edge with the action rail (like, comment, share, save, each with its count) lined up vertically over the video on the right, and the author, a Follow button, caption, and location overlaid at the bottom-left over a soft gradient — the layout of mainstream reels apps.

## Polish pack

- **Videos start muted** everywhere (feed and Reels); browsers block audible autoplay and a feed should never surprise you with sound. The volume button still unmutes. *(Superseded by the requested adjustment above: videos are unmuted by default again.)*
- **Double-tap heart burst**: double-tapping any photo or video shows a big heart-red burst animation as it likes the post (respecting reduced-motion settings).
- **Clearer failures**: the API client now distinguishes "can't reach the server", a server error, and a normal error message instead of failing cryptically on non-JSON responses.
- **Search dropdown manners**: it closes on Escape and on any click outside it.
- **Reels keyboard navigation**: ArrowUp/ArrowDown (or j/k) move between reels.
- **Faster people & insights queries**: follower counts are aggregated in SQL, and insight like-counts use a single pass instead of repeated scans.

## Production scope

This is an MVP, not an Instagram-scale production system. Before a broad public launch add moderation, account recovery, email verification, distributed anti-abuse controls, monitoring, backup/retention policies, and load testing. Messages are not end-to-end encrypted; uploaded feed media is public. See the deployment guide for provider costs, limitations, and a post-deployment checklist.

Photography: Pexels and Unsplash. Core sample images are downloaded into `public/` so the initial feed does not rely on external image requests.
