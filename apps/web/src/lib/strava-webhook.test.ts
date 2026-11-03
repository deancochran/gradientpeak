import { afterEach, describe, expect, it, vi } from "vitest";
import { createStravaWebhookHandlers } from "./strava-webhook";

const payload = {
  aspect_type: "update",
  event_time: 1_725_000_000,
  object_id: 123,
  object_type: "activity",
  owner_id: 456,
  subscription_id: 789,
  updates: { title: "Morning run" },
} as const;

function createHandlers(input: { persist?: ReturnType<typeof vi.fn>; maxBodyBytes?: number } = {}) {
  const persist = input.persist ?? vi.fn(async () => undefined);
  return {
    handlers: createStravaWebhookHandlers({
      getSubscriptionId: () => "789",
      getVerifyToken: () => "verify-secret",
      isEnabled: () => true,
      ...(input.maxBodyBytes === undefined ? {} : { maxBodyBytes: input.maxBodyBytes }),
      storeAndEnqueueReceipt: persist,
    }),
    persist,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Strava webhook HTTP boundary", () => {
  it("validates subscribe mode and token before echoing a bounded challenge", async () => {
    const { handlers } = createHandlers();
    const response = await handlers.GET(
      new Request(
        "https://app.example/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=bounded-challenge",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ "hub.challenge": "bounded-challenge" });

    const invalid = await handlers.GET(
      new Request(
        "https://app.example/api/webhooks/strava?hub.mode=unsubscribe&hub.verify_token=verify-secret&hub.challenge=x",
      ),
    );
    expect(invalid.status).toBe(403);

    const oversized = await handlers.GET(
      new Request(
        `https://app.example/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=${"x".repeat(513)}`,
      ),
    );
    expect(oversized.status).toBe(403);
  });

  it("requires an application/json content type", async () => {
    const { handlers, persist } = createHandlers();
    const response = await handlers.POST(
      new Request("https://app.example/api/webhooks/strava", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(415);
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{", 400],
    ["unsupported payload", JSON.stringify({ ...payload, aspect_type: "share" }), 400],
  ])("rejects %s", async (_label, body, status) => {
    const { handlers, persist } = createHandlers();
    const response = await handlers.POST(
      new Request("https://app.example/api/webhooks/strava", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    expect(response.status).toBe(status);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before parsing", async () => {
    const { handlers, persist } = createHandlers({ maxBodyBytes: 32 });
    const response = await handlers.POST(
      new Request("https://app.example/api/webhooks/strava", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects an unknown configured subscription", async () => {
    const { handlers, persist } = createHandlers();
    const response = await handlers.POST(
      new Request("https://app.example/api/webhooks/strava", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, subscription_id: 790 }),
      }),
    );
    expect(response.status).toBe(403);
    expect(persist).not.toHaveBeenCalled();
  });

  it("uses the same delivery identity for exact duplicates and different identities for updates", async () => {
    const { handlers, persist } = createHandlers();
    const send = (body: unknown) =>
      handlers.POST(
        new Request("https://app.example/api/webhooks/strava", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(body),
        }),
      );
    await send(payload);
    await send(payload);
    await send({ ...payload, updates: { title: "Evening run" } });
    expect(persist).toHaveBeenCalledTimes(3);
    expect(persist.mock.calls[0]?.[1]).toBe(persist.mock.calls[1]?.[1]);
    expect(persist.mock.calls[0]?.[1]).not.toBe(persist.mock.calls[2]?.[1]);
  });

  it("returns a retryable response when durable persistence fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handlers } = createHandlers({
      persist: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const response = await handlers.POST(
      new Request("https://app.example/api/webhooks/strava", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
