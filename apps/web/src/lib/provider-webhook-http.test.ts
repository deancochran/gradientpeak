import { describe, expect, it } from "vitest";
import {
  ProviderWebhookPayloadTooLargeError,
  readProviderWebhookBody,
} from "./provider-webhook-http";

const encoder = new TextEncoder();
type StreamingRequestInit = RequestInit & { duplex: "half" };

function streamRequest(
  chunks: Uint8Array[],
  headers: HeadersInit = {},
  onCancel?: () => void,
  close = true,
): Request {
  const body = new ReadableStream<Uint8Array>({
    ...(onCancel ? { cancel: onCancel } : {}),
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (close) controller.close();
    },
  });
  const init: StreamingRequestInit = {
    body,
    duplex: "half",
    headers,
    method: "POST",
  };
  return new Request("https://app.example/api/webhooks/provider", init);
}

describe("provider webhook HTTP helpers", () => {
  it("preserves exact raw UTF-8 text across chunks", async () => {
    const raw = encoder.encode('{"title":"café 🏃"}');
    const request = streamRequest([raw.slice(0, 18), raw.slice(18)]);

    await expect(
      readProviderWebhookBody(request, {
        contentLengthPolicy: "reject-malformed",
        maxBodyBytes: 100,
      }),
    ).resolves.toBe('{"title":"café 🏃"}');
  });

  it("rejects malformed declared length only under the strict provider policy", async () => {
    let cancelled = false;
    const strict = streamRequest(
      [encoder.encode("{}")],
      { "content-length": "unknown" },
      () => {
        cancelled = true;
      },
      false,
    );
    const permissive = streamRequest([encoder.encode("{}")], { "content-length": "unknown" });

    await expect(
      readProviderWebhookBody(strict, {
        contentLengthPolicy: "reject-malformed",
        maxBodyBytes: 100,
      }),
    ).rejects.toThrow("invalid_content_length");
    expect(cancelled).toBe(true);
    expect(strict.body?.locked).toBe(false);
    await expect(
      readProviderWebhookBody(permissive, {
        contentLengthPolicy: "ignore-malformed",
        maxBodyBytes: 100,
      }),
    ).resolves.toBe("{}");
  });

  it("rejects declared and chunked bodies that exceed the byte limit", async () => {
    let declaredCancelled = false;
    const declared = streamRequest(
      [encoder.encode("{}")],
      { "content-length": "3" },
      () => {
        declaredCancelled = true;
      },
      false,
    );
    let cancelled = false;
    const chunked = streamRequest(
      [encoder.encode("12"), encoder.encode("34")],
      {},
      () => {
        cancelled = true;
      },
      false,
    );

    await expect(
      readProviderWebhookBody(declared, {
        contentLengthPolicy: "reject-malformed",
        maxBodyBytes: 2,
      }),
    ).rejects.toBeInstanceOf(ProviderWebhookPayloadTooLargeError);
    expect(declaredCancelled).toBe(true);
    expect(declared.body?.locked).toBe(false);
    await expect(
      readProviderWebhookBody(chunked, {
        contentLengthPolicy: "ignore-malformed",
        maxBodyBytes: 3,
      }),
    ).rejects.toBeInstanceOf(ProviderWebhookPayloadTooLargeError);
    expect(cancelled).toBe(true);
  });

  it("rejects invalid UTF-8 and releases its reader", async () => {
    const request = streamRequest([new Uint8Array([0xc3])]);

    await expect(
      readProviderWebhookBody(request, {
        contentLengthPolicy: "reject-malformed",
        maxBodyBytes: 100,
      }),
    ).rejects.toThrow(TypeError);
    expect(request.body?.locked).toBe(false);
  });

  it("releases the reader when the stream errors", async () => {
    const failure = new Error("stream failed");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    const init: StreamingRequestInit = {
      body,
      duplex: "half",
      method: "POST",
    };
    const request = new Request("https://app.example/api/webhooks/provider", init);

    await expect(
      readProviderWebhookBody(request, {
        contentLengthPolicy: "ignore-malformed",
        maxBodyBytes: 100,
      }),
    ).rejects.toBe(failure);
    expect(request.body?.locked).toBe(false);
  });
});
