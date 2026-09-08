// Set SEED_DEMO_CONTENT=false before the first request to a fresh production
// database to launch with real members only. Existing content is never deleted.
export function sampleContentEnabled() { return process.env.SEED_DEMO_CONTENT !== "false"; }
