import type { Context } from "../context";

const WINDOW_MS = 60_000;
const AUTHENTICATED_LIMIT = 300;
const ANONYMOUS_LIMIT = 60;
const MAX_BUCKETS_BEFORE_SWEEP = 10_000;

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitIdentity {
  key: string;
  limit: number;
}

export interface ApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

const unlimitedResult: ApiRateLimitResult = {
  allowed: true,
  limit: Number.POSITIVE_INFINITY,
  remaining: Number.POSITIVE_INFINITY,
  resetAt: new Date(Number.MAX_SAFE_INTEGER),
  retryAfterSeconds: 0,
};

export interface ApiRateLimitStore {
  increment(identity: RateLimitIdentity, now: number): RateLimitBucket;
}

function getForwardedIp(headers: Headers) {
  const trustedHeaders = new Set(
    (process.env.TRUSTED_PROXY_IP_HEADERS ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const name of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for", "forwarded"]) {
    if (!trustedHeaders.has(name)) continue;
    const value = headers.get(name);
    if (!value) continue;
    if (name === "forwarded") {
      return value.match(/for=(?:"?)([^;,"]+)/i)?.[1]?.trim() || "unknown";
    }
    return value.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

export class InMemoryApiRateLimitStore implements ApiRateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  increment(identity: RateLimitIdentity, now: number): RateLimitBucket {
    if (this.buckets.size > MAX_BUCKETS_BEFORE_SWEEP) {
      for (const [key, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(key);
      }
    }

    const existing = this.buckets.get(identity.key);
    const bucket =
      existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + WINDOW_MS };

    bucket.count += 1;
    this.buckets.set(identity.key, bucket);

    return bucket;
  }
}

const defaultStore = new InMemoryApiRateLimitStore();

function getRateLimitIdentity(ctx: Context): RateLimitIdentity {
  const userId = ctx.session?.user.id;

  if (userId) {
    return {
      key: `user:${userId}`,
      limit: AUTHENTICATED_LIMIT,
    };
  }

  const ip = getForwardedIp(ctx.headers);
  const source = ctx.trpcSource || ctx.clientType || "unknown";

  return {
    key: `anonymous:${source}:${ip}`,
    limit: ANONYMOUS_LIMIT,
  };
}

function shouldBypassRateLimit(ctx: Context) {
  return ctx.trpcSource.startsWith("vitest");
}

/**
 * Lightweight tRPC API abuse guard.
 *
 * Production caveat: this is an in-memory, per-process limiter. It is safe for
 * local/dev and provides a best-effort guard in a single Node process, but it is
 * not durable across restarts and is not shared across scaled/serverless
 * instances. Replace the bucket store with Redis/Upstash (or an edge/WAF
 * provider) before relying on it as the sole production abuse control.
 */
export function checkApiRateLimit(
  ctx: Context,
  now = Date.now(),
  store: ApiRateLimitStore = defaultStore,
): ApiRateLimitResult {
  if (shouldBypassRateLimit(ctx)) {
    return unlimitedResult;
  }

  const identity = getRateLimitIdentity(ctx);
  const bucket = store.increment(identity, now);

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
  const remaining = Math.max(0, identity.limit - bucket.count);

  return {
    allowed: bucket.count <= identity.limit,
    limit: identity.limit,
    remaining,
    resetAt: new Date(bucket.resetAt),
    retryAfterSeconds,
  };
}
