import { describe, expect, it } from "vitest";
import { type Context, createApiContext } from "../context";
import {
  ANONYMOUS_GLOBAL_CIRCUIT_BREAKER_LIMIT,
  type ApiRateLimitStore,
  checkApiRateLimit,
  InMemoryApiRateLimitStore,
  type RateLimitIdentity,
} from "./rate-limit";

async function context(headers = new Headers()): Promise<Context> {
  return createApiContext({
    headers,
  });
}

describe("API rate limiting", () => {
  it("ignores hostile source and forwarding headers", async () => {
    let identity: RateLimitIdentity | undefined;
    const store: ApiRateLimitStore = {
      increment(value, now) {
        identity = value;
        return { count: 1, resetAt: now + 1_000 };
      },
    };
    await checkApiRateLimit(
      await context(new Headers({ "x-api-source": "vitest", "x-forwarded-for": "203.0.113.4" })),
      1,
      store,
    );
    expect(identity).toMatchObject({
      key: "anonymous:global-circuit-breaker",
      type: "global-anonymous-circuit-breaker",
    });
  });

  it("does not shard anonymous buckets with hostile headers", async () => {
    let identity: RateLimitIdentity | undefined;
    await checkApiRateLimit(
      await context(
        new Headers({
          "x-api-source": "vitest",
          "cf-connecting-ip": "198.51.100.8",
          "x-forwarded-for": "203.0.113.4",
        }),
      ),
      1,
      {
        increment(value, now) {
          identity = value;
          return { count: 1, resetAt: now + 1_000 };
        },
      },
    );
    expect(identity?.key).toBe("anonymous:global-circuit-breaker");
  });

  it("uses an intentionally high-capacity global anonymous circuit breaker", async () => {
    const store = new InMemoryApiRateLimitStore();
    const now = 1_000;
    let result = await checkApiRateLimit(await context(), now, store);
    for (let index = 1; index <= ANONYMOUS_GLOBAL_CIRCUIT_BREAKER_LIMIT; index += 1) {
      result = await checkApiRateLimit(await context(), now, store);
    }
    expect(result).toMatchObject({
      allowed: false,
      limit: ANONYMOUS_GLOBAL_CIRCUIT_BREAKER_LIMIT,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    expect(result.resetAt).toEqual(new Date(61_000));
    expect((await checkApiRateLimit(await context(), 61_000, store)).allowed).toBe(true);
  });

  it("fails closed when the durable store is unavailable", async () => {
    await expect(
      checkApiRateLimit(await context(), 1_000, {
        increment() {
          throw new Error("database unavailable");
        },
      }),
    ).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });
});
