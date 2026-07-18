import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestTimeoutError, fetchWithTimeout } from "./api";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/auth/auth-headers", () => ({ getSessionAuthHeaders: () => new Headers() }));
vi.mock("@/lib/logging/mobile-action-log", () => ({
  getMobileDeviceKind: () => "simulator",
  logMobileAction: vi.fn(),
}));
vi.mock("@/lib/server-config", () => ({ getServerConfig: () => ({ apiUrl: "http://localhost" }) }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function abortingFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  });
}

function delayedAbortingFetch(delayMs: number) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () =>
          setTimeout(
            () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            delayMs,
          ),
        { once: true },
      );
    });
  });
}

describe("fetchWithTimeout", () => {
  it("distinguishes the local request timeout", async () => {
    vi.useFakeTimers();
    abortingFetch();

    const request = fetchWithTimeout("https://example.test/api/trpc/activities.listPaginated");
    const rejection = expect(request).rejects.toBeInstanceOf(ApiRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
  });

  it("preserves an upstream abort instead of relabeling it as a timeout", async () => {
    abortingFetch();
    const upstream = new AbortController();
    const request = fetchWithTimeout("https://example.test/api/trpc/profiles.get", {
      signal: upstream.signal,
    });

    upstream.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not relabel a delayed upstream abort after the timeout deadline", async () => {
    vi.useFakeTimers();
    delayedAbortingFetch(35_000);
    const upstream = new AbortController();
    const request = fetchWithTimeout("https://example.test/api/trpc/profiles.get", {
      signal: upstream.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });

    upstream.abort();
    await vi.advanceTimersByTimeAsync(35_000);

    await rejection;
  });

  it("does not relabel a delayed local timeout after an upstream abort arrives", async () => {
    vi.useFakeTimers();
    delayedAbortingFetch(1_000);
    const upstream = new AbortController();
    const request = fetchWithTimeout("https://example.test/api/trpc/profiles.get", {
      signal: upstream.signal,
    });
    const rejection = expect(request).rejects.toBeInstanceOf(ApiRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(30_000);
    upstream.abort();
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });
});
