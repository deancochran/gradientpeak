import { afterEach, describe, expect, it, vi } from "vitest";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
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
    expect(logMobileAction).toHaveBeenLastCalledWith(
      "activities.listPaginated",
      "failure",
      expect.objectContaining({ classification: "local_timeout" }),
    );
  });

  it("preserves the manually supplied auth cookie and omits native cookie-jar credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 200,
      }),
    );

    await fetchWithTimeout("https://example.test/api/trpc/profiles.get", {
      credentials: "include",
      headers: { Cookie: "better-auth.session_token=redacted" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.test/api/trpc/profiles.get",
      expect.objectContaining({
        credentials: "omit",
        headers: { Cookie: "better-auth.session_token=redacted" },
      }),
    );
  });

  it("normalizes the native fetch timeout and records its source", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Network request timed out"));

    await expect(
      fetchWithTimeout("https://example.test/api/trpc/activities.listPaginated"),
    ).rejects.toBeInstanceOf(ApiRequestTimeoutError);
    expect(logMobileAction).toHaveBeenLastCalledWith(
      "activities.listPaginated",
      "failure",
      expect.objectContaining({ classification: "native_timeout", errorName: "TypeError" }),
    );
  });

  it("preserves an upstream abort instead of relabeling it as a timeout", async () => {
    abortingFetch();
    const upstream = new AbortController();
    const request = fetchWithTimeout("https://example.test/api/trpc/profiles.get", {
      signal: upstream.signal,
    });

    upstream.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(logMobileAction).toHaveBeenLastCalledWith(
      "profiles.get",
      "failure",
      expect.objectContaining({ classification: "upstream_abort" }),
    );
  });

  it("honors a Request signal and preserves its abort reason", async () => {
    const reason = new Error("navigation changed");
    const upstream = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const request = fetchWithTimeout(
      new Request("https://example.test/api/trpc/profiles.get", { signal: upstream.signal }),
    );

    upstream.abort(reason);

    await expect(request).rejects.toBe(reason);
    expect(logMobileAction).toHaveBeenLastCalledWith(
      "profiles.get",
      "failure",
      expect.objectContaining({ classification: "upstream_abort" }),
    );
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
    expect(logMobileAction).toHaveBeenLastCalledWith(
      "profiles.get",
      "failure",
      expect.objectContaining({ classification: "upstream_abort" }),
    );
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
    expect(logMobileAction).toHaveBeenLastCalledWith(
      "profiles.get",
      "failure",
      expect.objectContaining({ classification: "local_timeout" }),
    );
  });
});
