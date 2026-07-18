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
});
