import { createHash } from "node:crypto";
import { apiRateLimitWindows } from "@repo/db";
import { and, asc, count, eq, lte, or, sql } from "drizzle-orm";

import type { Context } from "../context";
import { type DrizzleQueryExecutor, getRequiredDb } from "../db";

const WINDOW_MS = 60_000;
const AUTHENTICATED_LIMIT = 300;
const TRUSTED_NETWORK_ANONYMOUS_LIMIT = 60;
// This is deliberately a finite global circuit breaker, not a per-client
// bucket: the current Fetch adapter supplies no trustworthy remote address.
// 10,000 requests per minute leaves substantial room for normal anonymous
// traffic while still bounding an outage/amplification event.
export const ANONYMOUS_GLOBAL_CIRCUIT_BREAKER_LIMIT = 10_000;
const MAX_BUCKETS_BEFORE_SWEEP = 10_000;
const MAX_DURABLE_WINDOWS = 100_000;
const EXPIRED_WINDOW_CLEANUP_BATCH_SIZE = 100;

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitIdentity {
  key: string;
  limit: number;
  type: "authenticated-user" | "trusted-network" | "global-anonymous-circuit-breaker";
}

export interface ApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface ApiRateLimitStore {
  increment(identity: RateLimitIdentity, now: number): RateLimitBucket | Promise<RateLimitBucket>;
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

function getRateLimitIdentity(ctx: Context): RateLimitIdentity {
  const userId = ctx.session?.user.id;

  if (userId) {
    return {
      key: `user:${userId}`,
      limit: AUTHENTICATED_LIMIT,
      type: "authenticated-user",
    };
  }

  if (ctx.trustedNetworkIdentity) {
    return {
      key: `network:${ctx.trustedNetworkIdentity}`,
      limit: TRUSTED_NETWORK_ANONYMOUS_LIMIT,
      type: "trusted-network",
    };
  }

  return {
    key: "anonymous:global-circuit-breaker",
    limit: ANONYMOUS_GLOBAL_CIRCUIT_BREAKER_LIMIT,
    type: "global-anonymous-circuit-breaker",
  };
}

const testStore = new InMemoryApiRateLimitStore();

/**
 * Durable tRPC API abuse guard. The Postgres counter is the authoritative
 * cross-instance decision; in-memory stores exist only for isolated tests.
 */
function persistedRateLimitKey(identity: RateLimitIdentity) {
  return createHash("sha256").update(identity.key).digest("hex");
}

export interface PostgresApiRateLimitStoreOptions {
  windowMs?: number;
  maxDurableWindows?: number;
  expiredWindowCleanupBatchSize?: number;
}

function validPositiveInteger(value: number | undefined, fallback: number) {
  return value === undefined
    ? fallback
    : Number.isSafeInteger(value) && value > 0
      ? value
      : fallback;
}

export class PostgresApiRateLimitStore implements ApiRateLimitStore {
  private readonly windowMs: number;
  private readonly maxDurableWindows: number;
  private readonly expiredWindowCleanupBatchSize: number;

  constructor(
    private readonly ctx: Context,
    options: PostgresApiRateLimitStoreOptions = {},
  ) {
    this.windowMs = validPositiveInteger(options.windowMs, WINDOW_MS);
    this.maxDurableWindows = validPositiveInteger(options.maxDurableWindows, MAX_DURABLE_WINDOWS);
    this.expiredWindowCleanupBatchSize = validPositiveInteger(
      options.expiredWindowCleanupBatchSize,
      EXPIRED_WINDOW_CLEANUP_BATCH_SIZE,
    );
  }

  async increment(identity: RateLimitIdentity, now: number): Promise<RateLimitBucket> {
    const db = getRequiredDb(this.ctx);
    const windowStartedAt = new Date(Math.floor(now / this.windowMs) * this.windowMs);
    const resetAt = windowStartedAt.getTime() + this.windowMs;
    const keyHash = persistedRateLimitKey(identity);
    const incrementExisting = async (executor: DrizzleQueryExecutor) => {
      const [updated] = await executor
        .update(apiRateLimitWindows)
        .set({ count: sql`${apiRateLimitWindows.count} + 1` })
        .where(
          and(
            eq(apiRateLimitWindows.key_hash, keyHash),
            eq(apiRateLimitWindows.window_started_at, windowStartedAt),
          ),
        )
        .returning({ count: apiRateLimitWindows.count });
      return updated && Number.isSafeInteger(updated.count) && updated.count > 0
        ? updated.count
        : undefined;
    };

    const fastCount = await incrementExisting(db);
    if (fastCount) return { count: fastCount, resetAt };

    return db.transaction(async (tx) => {
      // This statement must be separate: following READ COMMITTED statements
      // see admissions committed by earlier lock holders.
      await tx.execute(sql`select pg_advisory_xact_lock(847219)`);
      const expired = await tx
        .select({
          keyHash: apiRateLimitWindows.key_hash,
          windowStartedAt: apiRateLimitWindows.window_started_at,
        })
        .from(apiRateLimitWindows)
        .where(lte(apiRateLimitWindows.expires_at, new Date()))
        .orderBy(asc(apiRateLimitWindows.expires_at))
        .limit(this.expiredWindowCleanupBatchSize);
      if (expired.length > 0) {
        await tx
          .delete(apiRateLimitWindows)
          .where(
            or(
              ...expired.map((window) =>
                and(
                  eq(apiRateLimitWindows.key_hash, window.keyHash),
                  eq(apiRateLimitWindows.window_started_at, window.windowStartedAt),
                ),
              ),
            ),
          );
      }

      const existingCount = await incrementExisting(tx);
      if (existingCount) return { count: existingCount, resetAt };

      const [capacity] = await tx.select({ count: count() }).from(apiRateLimitWindows);
      if ((capacity?.count ?? 0) >= this.maxDurableWindows) {
        throw new Error("Rate-limit durable window capacity reached");
      }

      const [inserted] = await tx
        .insert(apiRateLimitWindows)
        .values({
          key_hash: keyHash,
          window_started_at: windowStartedAt,
          count: 1,
          expires_at: new Date(resetAt),
        })
        .returning({ count: apiRateLimitWindows.count });
      const insertedCount = inserted?.count;
      if (
        typeof insertedCount !== "number" ||
        !Number.isSafeInteger(insertedCount) ||
        insertedCount < 1
      ) {
        throw new Error("Rate-limit counter did not return a valid count");
      }
      return { count: insertedCount, resetAt };
    });
  }
}

export async function checkApiRateLimit(
  ctx: Context,
  now = Date.now(),
  store: ApiRateLimitStore = process.env.NODE_ENV === "test"
    ? testStore
    : new PostgresApiRateLimitStore(ctx),
): Promise<ApiRateLimitResult> {
  const identity = getRateLimitIdentity(ctx);
  try {
    const bucket = await store.increment(identity, now);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
    const remaining = Math.max(0, identity.limit - bucket.count);

    return {
      allowed: bucket.count <= identity.limit,
      limit: identity.limit,
      remaining,
      resetAt: new Date(bucket.resetAt),
      retryAfterSeconds,
    };
  } catch {
    // At an abuse boundary, an unavailable durable authority fails closed.
    return {
      allowed: false,
      limit: identity.limit,
      remaining: 0,
      resetAt: new Date(now + WINDOW_MS),
      retryAfterSeconds: Math.ceil(WINDOW_MS / 1_000),
    };
  }
}
