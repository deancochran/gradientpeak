import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWahooWebhookPostHandler } from "./wahoo-webhook";

const TOKEN = "configured-token";

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event_type: "workout_summary",
    webhook_token: TOKEN,
    user: { id: 42 },
    workout_summary: { id: 99 },
    ...overrides,
  });
}

function signature(body: string) {
  return `sha256=${crypto.createHmac("sha256", TOKEN).update(body).digest("hex")}`;
}

function request(body: string, headers: HeadersInit = {}) {
  return new Request("https://app.example/api/webhooks/wahoo", {
    method: "POST",
    body,
    headers: {
      "X-Wahoo-Signature": signature(body),
      ...headers,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Wahoo webhook boundary", () => {
  it("requires receiver configuration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createWahooWebhookPostHandler({
      getToken: () => undefined,
      storeAndEnqueueReceipt: vi.fn(),
    });

    expect((await handler(request(payload()))).status).toBe(503);
  });

  it("rejects oversized payloads before persistence", async () => {
    const storeAndEnqueueReceipt = vi.fn();
    const handler = createWahooWebhookPostHandler({
      getToken: () => TOKEN,
      maxBodyBytes: 8,
      storeAndEnqueueReceipt,
    });

    expect((await handler(request(payload()))).status).toBe(413);
    expect(storeAndEnqueueReceipt).not.toHaveBeenCalled();
  });

  it("validates supplied signatures and requires a valid payload token", async () => {
    const handler = createWahooWebhookPostHandler({
      getToken: () => TOKEN,
      storeAndEnqueueReceipt: vi.fn(),
    });
    const body = payload();

    expect((await handler(request(body, { "X-Wahoo-Signature": "sha256=invalid" }))).status).toBe(
      401,
    );

    const wrongTokenBody = payload({ webhook_token: "wrong-token" });
    expect((await handler(request(wrongTokenBody))).status).toBe(401);
  });

  it("accepts the documented payload token when no signature header is supplied", async () => {
    const storeAndEnqueueReceipt = vi.fn().mockResolvedValue(undefined);
    const handler = createWahooWebhookPostHandler({
      getToken: () => TOKEN,
      storeAndEnqueueReceipt,
    });
    const body = payload();

    const response = await handler(
      new Request("https://app.example/api/webhooks/wahoo", { method: "POST", body }),
    );

    expect(response.status).toBe(200);
    expect(storeAndEnqueueReceipt).toHaveBeenCalledTimes(1);
    expect(storeAndEnqueueReceipt).toHaveBeenCalledWith(
      expect.not.objectContaining({ webhook_token: expect.anything() }),
    );
  });

  it("rejects malformed JSON and invalid payload shape", async () => {
    const handler = createWahooWebhookPostHandler({
      getToken: () => TOKEN,
      storeAndEnqueueReceipt: vi.fn(),
    });
    const malformed = "not-json";
    const invalidShape = payload({ user: {} });

    expect((await handler(request(malformed))).status).toBe(400);
    expect((await handler(request(invalidShape))).status).toBe(400);
  });

  it("persists valid payloads and returns a retryable failure when persistence fails", async () => {
    const storeAndEnqueueReceipt = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createWahooWebhookPostHandler({
      getToken: () => TOKEN,
      storeAndEnqueueReceipt,
    });
    const body = payload();

    expect((await handler(request(body))).status).toBe(200);
    expect((await handler(request(body))).status).toBe(503);
    expect(storeAndEnqueueReceipt).toHaveBeenCalledTimes(2);
  });
});
