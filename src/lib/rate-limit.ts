// Lightweight in-memory sliding-window rate limiter.
// Per-instance only (serverless instances each keep their own window), which
// is enough to blunt bursts, comment/message spam and credential-style abuse
// without an external store. Buckets are pruned lazily on access.

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      // Shed the oldest state rather than growing without bound.
      const oldest = buckets.keys().next().value;
      if (oldest) buckets.delete(oldest);
    }
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.hits[0] + windowMs - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  bucket.hits.push(now);
  return { ok: true, retryAfterSeconds: 0 };
}
