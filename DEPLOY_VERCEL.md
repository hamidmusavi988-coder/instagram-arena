# Deploy Loop on Vercel

## Is this a demo or a real backend?

**It is a working fullstack MVP, not just a frontend mockup.** Next.js API routes implement authentication, posts, likes, comments, follows, profiles, uploads, conversations, and notifications. Drizzle saves application data in PostgreSQL. Two independent accounts can exchange real server-persisted messages.

The starter creators, posts, example follower/like counts, and initial conversations are **sample content**. Those sample profiles are not live users and do not automatically reply. The sandbox runs a real local server/database; it is not your permanent production hosting.

Vercel hosts the Next.js site **and its API/backend as managed functions**. You do not need a separate Express server. You still need a hosted database, persistent object storage, and preferably a managed realtime service.

## Recommended stack

| Component | Service | Why |
| --- | --- | --- |
| Website and API/backend | Vercel, Next.js, Node.js 22, Fluid compute | Runs the existing app and API routes |
| Persistent data | Neon PostgreSQL | The sandbox's localhost database is not reachable from Vercel |
| Photos, avatars, videos | **Public Vercel Blob store** | Vercel functions do not have a persistent upload disk |
| Live chat updates | **Pusher Channels** | Delivers updates between different Vercel instances without keeping a function running |
| Google sign-in | Google OAuth web client | Optional; email/password works without it |

Vercel Blob and Pusher integrations are implemented, but they must be connected to your own accounts. The local preview still uses local media storage and SSE when external credentials are absent. Configuration is not proof that an external credential works: verify uploads and chat on your actual deployment.

## 1. Export the code to GitHub

1. Export/download this project from the builder and open the project folder on your computer.
2. Create a private GitHub repository and push the source, `public/`, `package.json`, `package-lock.json`, `drizzle.config.ts`, and `vercel.json`.
3. Do **not** commit `.env`, `.env.local`, `.data/`, `.next/`, `node_modules/`, or test `artifacts/`. Ignore files are included. If credentials were already committed, remove them from Git history and rotate them; an ignore file does not revoke leaked credentials.
4. Use Node.js 22 locally and run `npm ci` in the project root.

The sample images in `public/` are application assets and should be committed. The sandbox's uploaded user files and database are **not automatically migrated** by pushing source code.

## 2. Create a hosted PostgreSQL database

1. Create a new Neon project at https://neon.com, or add Neon through Vercel Marketplace/Storage.
2. Choose a region close to your Vercel functions. This project's `vercel.json` defaults to **Washington, D.C. (`iad1`)**; US East / Northern Virginia is a suitable database location. If your users are elsewhere, change the function region and use a nearby database.
3. Copy both Neon connection strings, preserving the provider's TLS options:
   - Pooled connection string → `DATABASE_URL`.
   - Direct/unpooled connection string → `DATABASE_URL_UNPOOLED` (used by Drizzle setup).
4. Do not use `localhost`, `127.0.0.1`, or the sandbox's `postgres:postgres` connection string on Vercel.

## 3. Import the project into Vercel

1. In Vercel, select **Add New → Project → Import Git Repository**.
2. Keep the framework preset as **Next.js**, root directory as the project root, and the default output-directory setting. Do not set static export, `dist`, or `out`.
3. In project settings, select **Node.js 22** and ensure **Fluid compute** is enabled.
4. Add `DATABASE_URL` and `DATABASE_URL_UNPOOLED` under **Settings → Environment Variables** for Production.
5. If the initial import starts building before Blob has been connected, the preflight check will deliberately fail with a storage-configuration message. Finish the following steps and redeploy; this is preferable to publishing a site whose uploads silently disappear.

The included `vercel.json` runs the deployment preflight and then `npm run build`. **Schema changes are not run automatically during builds.** This prevents parallel preview builds from unexpectedly modifying a production database.

## 4. Connect persistent uploads

1. In the Vercel project, open **Storage → Create/Connect Store → Blob**.
2. Select **Public** access. This app's feed posts and profile photos are public; a private Blob store will not work with its direct image/video URLs.
3. Connect the store to the Production environment. Prefer a separate store for Preview/Development if needed.
4. Confirm that **`BLOB_READ_WRITE_TOKEN`** is present in the project's environment variables. This implementation uses `handleUpload`, whose client-token flow requires this read/write token even when Vercel also provides OIDC variables.

The browser sends media directly to Blob instead of through a Vercel function. This avoids the function's **4.5 MB request-body limit** and supports the app's **60 MB** upload limit. The server authorizes each upload, constrains its path/type/size, verifies metadata and file signatures, and records its owner in PostgreSQL. Only the owner can publish the uploaded media. Cloud uploads require a registered account, and upload attempts have a 50-per-account daily cap.

An authenticated completion endpoint independently verifies an upload even if a provider callback arrives late. For testing provider callbacks behind deployment protection, follow Vercel's callback/protection guidance or use an appropriate test deployment. Never disable protection on a production admin resource just to make a test pass.

## 5. Configure realtime messaging

1. Create a **Pusher Channels** app at https://dashboard.pusher.com (not a Beams app).
2. Choose a cluster near your users.
3. Add all four values from that same Channels app to Vercel:
   - `PUSHER_APP_ID`
   - `PUSHER_KEY`
   - `PUSHER_SECRET`
   - `PUSHER_CLUSTER`
4. Client-triggered events do not need to be enabled. The backend publishes authorized notifications.

No `NEXT_PUBLIC_` secret variables are needed. An authenticated configuration route sends only the public application key, cluster, and the current user's private channel name to the browser. The secret remains on the server. Users can subscribe only to their own private channel. Pusher receives change notifications, **not message text**; actual messages come from the membership-checked database API.

**Without Pusher:** the app still works through SSE plus two-second database polling. SSE rotates before Vercel's function deadline and reconnects, and the browser resynchronizes missed updates. Cross-instance delivery can take about two seconds or longer during reconnects. This fallback is useful for small tests, but it is not a zero-latency promise and can increase database/function usage. Use Pusher for the intended low-latency hosted setup.

## 6. Set the remaining environment variables

| Variable | Required? | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Hosted PostgreSQL pooled URL |
| `DATABASE_URL_UNPOOLED` | Recommended for setup | Direct URL to the **same database** |
| `BLOB_READ_WRITE_TOKEN` | Yes on Vercel | Token from the connected public Blob store |
| `APP_URL` | Required for Google; recommended otherwise | Stable HTTPS origin, e.g. `https://your-project.vercel.app`, no trailing slash |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` | Strongly recommended | Pusher Channels app credentials |
| `SEED_DEMO_CONTENT` | Recommended | `false` for a clean launch with real members only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Both values from a Google OAuth web client |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional | Leave **both** unset to generate and persist a key pair in PostgreSQL |
| `VAPID_SUBJECT` | Recommended if enabling push | A real contact, e.g. `mailto:you@your-domain.com` |

Use separate environment-specific databases, stores, and Pusher apps for Preview where practical. Do not point untrusted preview deployments at your production database. Vercel must redeploy after environment-variable changes.

### Launching without demo content

Set `SEED_DEMO_CONTENT=false` **before the first request to a fresh production database**. This skips sample users/posts, example follows, and starter conversations. The first visitor sees an empty feed and can create the first real account. Visitors get isolated guest sessions, but writes on Vercel require a registered account.

This flag deliberately does not erase existing data. If you already seeded a database, create a fresh production database or remove only the known sample records after reviewing/backing up the data. Do not run a blanket reset on a database that contains real users.

### Google sign-in

In Google Cloud / Google Auth Platform:

1. Configure the consent screen/audience and create an OAuth client of type **Web application**.
2. Set the authorized JavaScript origin to your stable HTTPS site origin.
3. Add this exact authorized redirect URI: **`https://your-project.vercel.app/api/auth/google/callback`** (replace the domain with yours).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and matching `APP_URL` in Vercel Production, then redeploy.
5. If Google's app is in testing mode, add your testers or publish the consent configuration as appropriate.

If you switch to a custom domain, update `APP_URL` and Google's allowed origin/redirect URI together. Use that same domain to start and finish sign-in so the OAuth state cookie is present. Preview environments need their own matching stable URL/settings; do not reuse Production's `APP_URL` on another hostname.

## 7. Initialize the database, then deploy

On your computer, in the exported project root:

1. Run `npm ci` if you have not already.
2. Run `npx vercel link` and select the Vercel project you imported.
3. Run `npx vercel env pull .env.local --environment=production` to download its configured environment variables into an ignored local file. Inspect them privately: both database URLs must refer to the intended **new** production database.
4. Run **`npx drizzle-kit push --config=drizzle.config.ts`** once to create the tables. It reads `DATABASE_URL_UNPOOLED` first, otherwise `DATABASE_URL`; it does not use the old hardcoded sandbox address. Review any prompts carefully. For a database containing existing data, take a backup and use reviewed versioned migrations for future schema updates.
5. In Vercel, open **Deployments → Redeploy**, or push a new commit. The included build command performs configuration checks and compiles Next.js.
6. Open your production domain and **`/api/health`**. The health endpoint should report `ok: true`, database/schema readiness, and the selected storage/realtime configuration. A configured provider is not automatically a verified external connection—perform the tests below.

Only the source is deployed. Existing sandbox accounts, messages, and files do not appear in Neon/Blob automatically. Start clean for this v1, or plan an explicit data/media migration if you need to retain them.

## 8. Verify the real deployment

- Create account A in one browser and account B in another/private window.
- Upload a photo and a video **larger than 4.5 MB**, publish them, reload, and check playback.
- Find and follow the other account; add a like/comment and verify the other account's notification.
- Send DMs both ways without refreshing. Make a group and confirm another member receives its messages.
- Leave and reopen the page, and check that message history persists.
- Verify Google sign-in on the configured domain if enabled.
- Turn on notifications in a supported browser over HTTPS, allow permission, and test receiving a message with the app in the background.
- Redeploy and confirm that uploaded media and database content still exist.

## Important limits before a public launch

- This is a functional MVP, **not a battle-tested Instagram-scale service**. Add moderation/reporting, account recovery/email verification, distributed abuse protection, backups, monitoring, and load testing before opening it broadly.
- Configure Vercel Firewall/rate limits for sign-in, guest bootstrap, messaging, and upload-token endpoints. The existing sign-in limiter is instance-local, not a distributed anti-abuse service.
- Media is public. Do not use this upload path for private documents or sensitive chat attachments. There is no antivirus/transcoding pipeline yet; MIME/signature checks are not a malware scanner.
- Messages are access-controlled but not end-to-end encrypted.
- Removing a post removes it from the feed, not necessarily every CDN cache or the underlying uploaded object. Monitor Blob usage and implement retention/orphan cleanup before scaling.
- Never promise literal “0 ping.” Optimistic sends feel immediate, but delivery depends on the network, regions, cold starts, database, and realtime provider.
- Vercel, Neon, Blob, and Pusher have separate quotas and potential charges. Video bandwidth and concurrent chat connections matter. Check current plan terms/pricing and set spend alerts; do not assume a public social app will stay free.

## Official references

- Vercel Blob client uploads: https://vercel.com/docs/vercel-blob/client-upload
- Vercel function limits: https://vercel.com/docs/functions/limitations
- Vercel database pooling: https://vercel.com/kb/guide/connection-pooling-with-functions
- Neon on Vercel: https://neon.com/docs/guides/vercel-connection-methods
- Pusher private channels: https://pusher.com/docs/channels/using_channels/private-channels/
