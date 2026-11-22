import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoundedFetch } from "./bounded-fetch";

afterEach(() => vi.useRealTimers());

describe("createBoundedFetch", () => {
  it("aborts the underlying request before a response that would outlive cleanup grace", async () => {
    vi.useFakeTimers();
    let completed = false;
    const baseFetch = vi.fn(
      (_request: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const response = setTimeout(
            () => {
              completed = true;
              resolve(new Response("late"));
            },
            45 * 60_000 + 1,
          );
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(response);
              reject(init.signal?.reason);
            },
            { once: true },
          );
        }),
    );
    const fetch = createBoundedFetch({ baseFetch, timeoutMs: 8_000 });

    const request = fetch("https://storage.example.test/object");
    const rejected = expect(request).rejects.toThrow("Wahoo storage request timed out");
    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;
    await vi.advanceTimersByTimeAsync(45 * 60_000);
    expect(completed).toBe(false);
    expect(baseFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("propagates operation and caller abort signals to the real transport", async () => {
    const operation = new AbortController();
    const caller = new AbortController();
    const baseFetch = vi.fn(
      (_request: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const fetch = createBoundedFetch({
      baseFetch,
      operationSignal: operation.signal,
      timeoutMs: 8_000,
    });

    const request = fetch("https://storage.example.test/object", { signal: caller.signal });
    operation.abort(new Error("lease lost"));
    await expect(request).rejects.toThrow("lease lost");
    expect(baseFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("keeps the timeout active while a response body stalls after immediate headers", async () => {
    vi.useFakeTimers();
    const baseFetch = vi.fn((_request: RequestInfo | URL, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), {
            once: true,
          });
        },
      });
      return Promise.resolve(
        new Response(body, { headers: { "content-type": "application/json" } }),
      );
    });
    const fetch = createBoundedFetch({ baseFetch, timeoutMs: 8_000 });

    const request = fetch("https://storage.example.test/object");
    const rejected = expect(request).rejects.toThrow("Wahoo storage request timed out");
    await vi.advanceTimersByTimeAsync(8_000);
    await rejected;
    expect(baseFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
