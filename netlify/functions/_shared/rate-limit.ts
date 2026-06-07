interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key) || { hits: [] };
  bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);

  if (bucket.hits.length >= limit) {
    throw Object.assign(new Error("Rate limit reached. Try again later."), { statusCode: 429 });
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
}
