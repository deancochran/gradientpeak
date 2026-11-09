import type { ApiContext } from "@repo/api/context";
import { describe, expect, it, vi } from "vitest";

import { createChatbotHttpHandler } from "./chatbot-http";

const payload = {
  requestId: "00000000-0000-4000-8000-000000000001",
  text: "Help me plan a run",
};

function context(overrides: Partial<ApiContext> = {}): ApiContext {
  return {
    clientType: "web",
    session: {
      sessionId: "session-1",
      transport: "cookie",
      user: { id: "user-1", email: "runner@example.com", emailVerified: true },
    },
    ...overrides,
  } as ApiContext;
}

function allowedRateLimit() {
  return {
    allowed: true,
    limit: 20,
    remaining: 19,
    resetAt: new Date("2026-10-30T00:01:00.000Z"),
    retryAfterSeconds: 60,
  };
}

function handlerFor(testContext = context(), host = vi.fn()) {
  const createContext = vi.fn(async () => testContext);
  const checkRateLimit = vi.fn(async () => allowedRateLimit());
  return {
    createContext,
    checkRateLimit,
    handler: createChatbotHttpHandler({ createContext, checkRateLimit, host }),
    host,
  };
}

function request(init: RequestInit = {}) {
  return new Request("https://app.example.com/api/chat", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.com",
      "x-gradientpeak-contract-epoch": "3",
    },
    method: "POST",
    ...init,
  });
}

describe("chatbot HTTP boundary", () => {
  it("rejects unsupported methods", async () => {
    const { handler, createContext, host } = handlerFor();

    const response = await handler(
      new Request("https://app.example.com/api/chat", { method: "DELETE" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    expect(createContext).not.toHaveBeenCalled();
    expect(host).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before rate limiting, parsing, or host work", async () => {
    const { handler, checkRateLimit, host } = handlerFor(context({ session: null }));

    const response = await handler(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(host).not.toHaveBeenCalled();
  });

  it("rejects a stale client contract before rate limiting or host work", async () => {
    const { handler, checkRateLimit, host } = handlerFor();

    const response = await handler(
      request({
        headers: { "content-type": "application/json", origin: "https://app.example.com" },
      }),
    );

    expect(response.status).toBe(412);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(host).not.toHaveBeenCalled();
  });

  it("rejects hostile origins, including requests claiming to be native", async () => {
    const { handler, checkRateLimit, host } = handlerFor(
      context({
        clientType: "mobile",
        session: {
          sessionId: "session-1",
          transport: "bearer",
          user: { id: "user-1", email: "runner@example.com", emailVerified: true },
        },
      }),
    );

    const response = await handler(
      request({ headers: { "content-type": "application/json", origin: "https://evil.example" } }),
    );

    expect(response.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(host).not.toHaveBeenCalled();
  });

  it("supports an origin-less bearer session only for the native transport", async () => {
    const host = vi.fn(async () => new Response("streamed"));
    const { handler } = handlerFor(
      context({
        clientType: "mobile",
        session: {
          sessionId: "session-1",
          transport: "bearer",
          user: { id: "user-1", email: "runner@example.com", emailVerified: true },
        },
      }),
      host,
    );

    const response = await handler(
      request({
        headers: { "content-type": "application/json", "x-gradientpeak-contract-epoch": "3" },
      }),
    );

    expect(response.status).toBe(200);
    expect(host).toHaveBeenCalledOnce();
  });

  it("enforces content type and bounded streamed body bytes without calling the provider", async () => {
    const noJson = handlerFor();
    expect(
      (
        await noJson.handler(
          request({
            headers: {
              origin: "https://app.example.com",
              "x-gradientpeak-contract-epoch": "3",
            },
          }),
        )
      ).status,
    ).toBe(415);
    expect(noJson.host).not.toHaveBeenCalled();

    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024));
        controller.enqueue(new Uint8Array(8 * 1024 + 1));
        controller.close();
      },
    });
    const oversized = handlerFor();
    const streamedRequestInit: RequestInit & { duplex: "half" } = {
      body: chunked,
      headers: {
        "content-type": "application/json",
        origin: "https://app.example.com",
        "x-gradientpeak-contract-epoch": "3",
      },
      method: "POST",
      // Undici requires this Fetch extension for a streaming request body.
      duplex: "half",
    };
    const response = await oversized.handler(
      new Request("https://app.example.com/api/chat", streamedRequestInit),
    );
    expect(response.status).toBe(413);
    expect(oversized.host).not.toHaveBeenCalled();
  });

  it("returns the limiter retry delay before parsing or host work", async () => {
    const setup = handlerFor();
    setup.checkRateLimit.mockResolvedValue({
      ...allowedRateLimit(),
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 17,
    });

    const response = await setup.handler(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(setup.host).not.toHaveBeenCalled();
  });

  it("passes request cancellation to the host and preserves the SDK stream response", async () => {
    const stream = new ReadableStream({ start: (controller) => controller.enqueue("event") });
    const sdkResponse = new Response(stream, {
      headers: { "content-type": "text/event-stream", "x-chatbot-turn-id": "turn-1" },
    });
    let receivedSignal: AbortSignal | undefined;
    const host = vi.fn(async (_context: ApiContext, _payload: unknown, signal?: AbortSignal) => {
      receivedSignal = signal;
      return sdkResponse;
    });
    const { handler } = handlerFor(context(), host);
    const abortController = new AbortController();
    const input = request({ signal: abortController.signal });
    abortController.abort();

    const response = await handler(input);

    expect(response).not.toBe(sdkResponse);
    expect(response.headers.get("x-chatbot-turn-id")).toBe("turn-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(host).toHaveBeenCalledWith(expect.anything(), payload, input.signal);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("maps replay and recovery outcomes to documented JSON responses", async () => {
    const replay = handlerFor(
      context(),
      vi.fn(async () => ({
        kind: "replay" as const,
        text: "Earlier answer",
        threadId: "thread-1",
        turnId: "turn-1",
      })),
    );
    const replayResponse = await replay.handler(request());
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.headers.get("cache-control")).toBe("no-store");
    expect(await replayResponse.json()).toEqual({
      status: "completed",
      text: "Earlier answer",
      threadId: "thread-1",
      turnId: "turn-1",
    });

    const recovery = handlerFor(
      context(),
      vi.fn(async () => ({
        kind: "recovery" as const,
        status: "interrupted" as const,
        threadId: "thread-1",
        turnId: "turn-1",
      })),
    );
    const recoveryResponse = await recovery.handler(request());
    expect(recoveryResponse.status).toBe(409);
    expect(recoveryResponse.headers.get("cache-control")).toBe("no-store");
    expect(await recoveryResponse.json()).toEqual({
      status: "interrupted",
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

  it("serves owned status over GET and routes strict recovery posts without weakening normal posts", async () => {
    const recovery = {
      status: vi.fn(async () => ({
        kind: "status",
        threadId: "11111111-1111-4111-8111-111111111111",
        turns: [],
      })),
      recover: vi.fn(async () => ({
        kind: "completed" as const,
        threadId: "11111111-1111-4111-8111-111111111111",
        turnId: "22222222-2222-4222-8222-222222222222",
        text: "Recovered",
        actions: [],
      })),
    };
    const createContext = vi.fn(async () => context());
    const checkRateLimit = vi.fn(async () => allowedRateLimit());
    const handler = createChatbotHttpHandler({
      createContext,
      checkRateLimit,
      host: vi.fn(),
      recovery,
    });
    const get = await handler(
      new Request(
        "https://app.example.com/api/chat?threadId=11111111-1111-4111-8111-111111111111",
        { headers: { "x-gradientpeak-contract-epoch": "3" } },
      ),
    );
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe("no-store");
    expect(recovery.status).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
    );
    const post = await handler(
      request({
        body: JSON.stringify({
          type: "recover",
          threadId: "11111111-1111-4111-8111-111111111111",
          turnId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
    expect(post.status).toBe(200);
    expect(post.headers.get("cache-control")).toBe("no-store");
    expect(recovery.recover).toHaveBeenCalledOnce();
  });
});
