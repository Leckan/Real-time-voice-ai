type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return {
      ok: false as const,
      retryAfterMs: Math.max(0, windowMs - (now - bucket.timestamps[0])),
    };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true as const, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
