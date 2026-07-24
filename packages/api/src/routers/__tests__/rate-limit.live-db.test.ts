import { createHash, randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Context } from "../../context";
import {
  checkApiRateLimit,
  PostgresApiRateLimitStore,
  type RateLimitIdentity,
} from "../../lib/rate-limit";

const insertedHashes = new Set<string>();

function identity(label: string): RateLimitIdentity {
  const key = `live-db-rate-limit:${label}:${randomUUID()}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  insertedHashes.add(keyHash);
  return { key, limit: 100, type: "authenticated-user" };
}

function context(): Context {
  return {
    db,
    headers: new Headers(),
    session: null,
    clientType: "server",
    trpcSource: "vitest-live-db",
  } as Context;
}

async function durableWindowCount() {
  const result = await db.execute(sql<{ count: string }>`
    select count(*) as count from public.api_rate_limit_windows
  `);
  return Number(result.rows[0]?.count);
}

afterEach(async () => {
  await Promise.all(
    [...insertedHashes].map((keyHash) =>
      db.execute(sql`delete from public.api_rate_limit_windows where key_hash = ${keyHash}`),
    ),
  );
  insertedHashes.clear();
});

afterAll(async () => pool.end());

describe("Postgres API rate-limit store", () => {
  it("atomically increments one current-window key and persists only its hash", async () => {
    const value = identity("same-key");
    const now = Date.now();
    const store = new PostgresApiRateLimitStore(context(), { windowMs: 1_000 });

    const buckets = await Promise.all(
      Array.from({ length: 16 }, () => store.increment(value, now)),
    );

    expect(buckets.map((bucket) => bucket.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
    const persisted = await db.execute(sql<{ key_hash: string; count: number }>`
      select key_hash, count from public.api_rate_limit_windows
      where key_hash = ${createHash("sha256").update(value.key).digest("hex")}
    `);
    expect(persisted.rows).toEqual([
      { key_hash: createHash("sha256").update(value.key).digest("hex"), count: 16 },
    ]);
    expect(JSON.stringify(persisted.rows)).not.toContain(value.key);
  });

  it("admits distinct new keys only through the configured finite durable cap", async () => {
    const store = new PostgresApiRateLimitStore(context(), {
      windowMs: 1_000,
      maxDurableWindows: (await durableWindowCount()) + 2,
    });

    const results = await Promise.allSettled(
      [identity("cap-a"), identity("cap-b"), identity("cap-c")].map((value) =>
        store.increment(value, Date.now()),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("cleans expired windows before admitting a new window", async () => {
    const baseCount = await durableWindowCount();
    const store = new PostgresApiRateLimitStore(context(), {
      windowMs: 1_000,
      maxDurableWindows: baseCount + 1,
    });
    const expired = identity("expired");
    const current = identity("current");

    await store.increment(expired, Date.now() - 5_000);
    await expect(store.increment(current, Date.now())).resolves.toMatchObject({ count: 1 });

    const expiredHash = createHash("sha256").update(expired.key).digest("hex");
    const expiredRow = await db.execute(sql`
      select 1 from public.api_rate_limit_windows where key_hash = ${expiredHash}
    `);
    expect(expiredRow.rows).toHaveLength(0);
  });

  it("fails closed when its durable database authority is unavailable", async () => {
    const unavailableContext = {
      ...context(),
      db: undefined,
    } as Context;

    await expect(
      checkApiRateLimit(
        unavailableContext,
        Date.now(),
        new PostgresApiRateLimitStore(unavailableContext),
      ),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });
});
