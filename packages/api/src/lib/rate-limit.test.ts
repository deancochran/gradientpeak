import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../context";
import {
  type ApiRateLimitStore,
  checkApiRateLimit,
  InMemoryApiRateLimitStore,
  type RateLimitIdentity,
} from "./rate-limit";

function context(headers = new Headers()): Context {
  return {
    db: {} as any,
    session: null,
    headers,
    clientType: "web",
    trpcSource: "fetch",
  } as Context;
}

afterEach(() => vi.unstubAllEnvs());

describe("API rate limiting", () => {
  it("ignores spoofable proxy headers unless explicitly trusted", () => {
    let identity: RateLimitIdentity | undefined;
    const store: ApiRateLimitStore = {
      increment(value, now) {
        identity = value;
        return { count: 1, resetAt: now + 1_000 };
      },
    };
    checkApiRateLimit(context(new Headers({ "x-forwarded-for": "203.0.113.4" })), 1, store);
    expect(identity?.key).toBe("anonymous:fetch:unknown");
  });

  it("uses only configured proxy IP headers", () => {
    vi.stubEnv("TRUSTED_PROXY_IP_HEADERS", "cf-connecting-ip");
    let identity: RateLimitIdentity | undefined;
    checkApiRateLimit(
      context(
        new Headers({
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
    expect(identity?.key).toBe("anonymous:fetch:198.51.100.8");
  });

  it("supports isolated injectable stores and returns retry metadata", () => {
    const store = new InMemoryApiRateLimitStore();
    const now = 1_000;
    let result = checkApiRateLimit(context(), now, store);
    for (let index = 1; index < 61; index += 1) {
      result = checkApiRateLimit(context(), now, store);
    }
    expect(result).toMatchObject({
      allowed: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    expect(result.resetAt).toEqual(new Date(61_000));
    expect(checkApiRateLimit(context(), 61_000, store).allowed).toBe(true);
  });
});
