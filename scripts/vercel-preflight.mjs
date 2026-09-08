// Runs only for Vercel builds. Never print credentials or create/change tables
// during a build; apply the schema explicitly before opening the deployment.
if (!process.env.VERCEL) {
  console.log('Loop: local/persistent-server build; Vercel checks skipped.');
  process.exit(0);
}
const errors = [];
let database;
try { database = new URL(process.env.DATABASE_URL || ''); } catch {}
if (!database || !['postgres:', 'postgresql:'].includes(database.protocol)) {
  errors.push('Set DATABASE_URL to your hosted PostgreSQL connection string.');
} else if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(database.hostname)) {
  errors.push('DATABASE_URL points to localhost. The sandbox database cannot be reached from Vercel; connect Neon or another hosted PostgreSQL database.');
}
if (!process.env.BLOB_READ_WRITE_TOKEN) errors.push('Connect a PUBLIC Vercel Blob store and add BLOB_READ_WRITE_TOKEN. Vercel cannot persist .data/uploads.');
const realtimeKeys = ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER'];
const hasRealtime = realtimeKeys.filter(key => Boolean(process.env[key]));
if (hasRealtime.length && hasRealtime.length !== realtimeKeys.length) errors.push('Pusher configuration is incomplete. Add PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER from the same Channels app.');
if (!hasRealtime.length) console.warn('Loop: Pusher is not configured. Messaging will use SSE + database polling; cross-instance updates can take about 2 seconds or longer on reconnect. Add Pusher for low-latency managed delivery.');
const googleKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const hasGoogle = googleKeys.filter(key => Boolean(process.env[key]));
if (hasGoogle.length === 1) errors.push('Google sign-in requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
if (hasGoogle.length && !process.env.APP_URL) errors.push('Set APP_URL to this environment’s stable HTTPS origin before enabling Google sign-in.');
if (process.env.APP_URL) {
  try {
    const url = new URL(process.env.APP_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
  } catch { errors.push('APP_URL must be an HTTPS origin, for example https://your-project.vercel.app (no path or query).'); }
}
if (process.env.SEED_DEMO_CONTENT !== 'false') console.warn('Loop: starter sample content is enabled. Set SEED_DEMO_CONTENT=false before first use of a fresh database for a real-members-only launch.');
if (errors.length) {
  for (const error of errors) console.error(`Loop deployment check: ${error}`);
  console.error('See DEPLOY_VERCEL.md for the complete setup.');
  process.exit(1);
}
console.log('Loop: hosted database and storage configuration present. External credentials and connectivity must be verified after deployment.');
