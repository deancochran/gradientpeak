import { describe, expect, it } from "vitest";

import { createApiContext } from "../context";
import type { ApiRateLimitStore, RateLimitIdentity } from "../lib/rate-limit";
import { CHATBOT_RATE_LIMIT_PER_MINUTE, checkChatbotRateLimit } from "./rate-limit";

describe("chatbot rate limit", () => {
  it("uses a distinct durable per-user bucket", async () => {
    let identity: RateLimitIdentity | undefined;
    const context = await createApiContext({
      auth: {
        session: {
          sessionId: "session-1",
          transport: "cookie",
          user: { id: "user-1", email: "runner@example.com", emailVerified: true },
        },
      },
      headers: new Headers(),
    });
    const store: ApiRateLimitStore = {
      increment(value, now) {
        identity = value;
        return { count: 1, resetAt: now + 60_000 };
      },
    };

    await checkChatbotRateLimit(context, 1_000, store);

    expect(identity).toEqual({
      key: "chatbot:user:user-1",
      limit: CHATBOT_RATE_LIMIT_PER_MINUTE,
      type: "authenticated-user",
    });
  });
});
