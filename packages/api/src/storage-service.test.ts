import { describe, expect, it, vi } from "vitest";
import { createActivityArtifactStorageService } from "./storage-service";

function stream(chunks: Uint8Array[], onCancel?: () => void, keepOpen = false) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (!keepOpen) controller.close();
    },
    ...(onCancel === undefined ? {} : { cancel: onCancel }),
  });
}

function storage(fetch: typeof globalThis.fetch, timeoutMs = 1_000) {
  return createActivityArtifactStorageService({
    url: "https://project.supabase.co/",
    serviceRoleKey: "secret-service-key",
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => undefined,
      }),
    },
    fetch,
    timeoutMs,
  });
}

describe("activity artifact storage reads", () => {
  it("returns exactly the configured limit", async () => {
    const service = storage(
      vi.fn(async () => new Response(stream([new Uint8Array([1, 2]), new Uint8Array([3])]))),
    );

    await expect(
      service.readObjectBounded({ bucket: "activity-files", path: "artifact.fit", maxBytes: 3 }),
    ).resolves.toMatchObject({ data: new Uint8Array([1, 2, 3]) });
  });

  it("aborts and cancels an over-limit stream even when Content-Length is missing", async () => {
    let cancelled = false;
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      expect(signal).toBeInstanceOf(AbortSignal);
      return new Response(
        stream(
          [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
          () => {
            cancelled = true;
          },
          true,
        ),
      );
    });

    await expect(
      storage(fetch as typeof globalThis.fetch).readObjectBounded({
        bucket: "activity-files",
        path: "artifact.fit",
        maxBytes: 3,
      }),
    ).rejects.toThrow("exceeds the allowed size");
    expect(cancelled).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it("rejects a misleading or oversized Content-Length without trusting it for correctness", async () => {
    const tooLarge = storage(
      vi.fn(
        async () =>
          new Response(stream([new Uint8Array([1])]), { headers: { "content-length": "4" } }),
      ),
    );
    await expect(
      tooLarge.readObjectBounded({ bucket: "activity-files", path: "artifact.fit", maxBytes: 3 }),
    ).rejects.toThrow("exceeds the allowed size");

    const misleading = storage(
      vi.fn(
        async () =>
          new Response(stream([new Uint8Array([1, 2]), new Uint8Array([3, 4])]), {
            headers: { "content-length": "1" },
          }),
      ),
    );
    await expect(
      misleading.readObjectBounded({ bucket: "activity-files", path: "artifact.fit", maxBytes: 3 }),
    ).rejects.toThrow("exceeds the allowed size");
  });

  it("maps HTTP failures without disclosing the object path or service credential", async () => {
    const secret = "secret-service-key";
    const path = "private/profile-1/medical.fit";
    const error = await storage(vi.fn(async () => new Response("storage failure", { status: 500 })))
      .readObjectBounded({ bucket: "activity-files", path, maxBytes: 3 })
      .catch((cause: unknown) => cause as Error);

    if (!(error instanceof Error)) throw new Error("Expected storage read to fail");
    expect(error.message).toBe("Failed to read activity artifact from storage.");
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain(path);
  });

  it("aborts a stalled fetch on timeout without disclosing storage details", async () => {
    vi.useFakeTimers();
    const secret = "secret-service-key";
    const path = "private/profile-1/stalled.fit";
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(new Error("network abort")), {
            once: true,
          });
        }),
    );

    try {
      const read = storage(fetch as typeof globalThis.fetch, 25).readObjectBounded({
        bucket: "activity-files",
        path,
        maxBytes: 3,
      });
      const failure = read.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(25);
      const error = await failure;
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw new Error("Expected storage read to fail");
      expect(error.message).toBe("Failed to read activity artifact from storage.");
      expect(signal?.aborted).toBe(true);
      expect(error.message).not.toContain(secret);
      expect(error.message).not.toContain(path);
    } finally {
      vi.useRealTimers();
    }
  });

  it("encodes bucket and individual path segments for the authenticated object endpoint", async () => {
    const fetch = vi.fn(async () => new Response(stream([new Uint8Array([1])])));
    await storage(fetch).readObjectBounded({
      bucket: "activity files",
      path: "profile one/a?b#c.fit",
      maxBytes: 3,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/activity%20files/profile%20one/a%3Fb%23c.fit",
      expect.objectContaining({
        headers: { apikey: "secret-service-key", authorization: "Bearer secret-service-key" },
      }),
    );
  });
});
