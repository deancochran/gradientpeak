import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
import {
  ApiRequestTimeoutError,
  createMobileHeaders,
  fetchWithTimeout,
  getSafeApiErrorDiagnostic,
  reportMobileApiError,
} from "./api";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/auth/auth-headers", () => ({
  getSessionAuthHeaders: async () => new Headers({ Cookie: "better-auth.session_token=redacted" }),
}));
vi.mock("@/lib/logging/mobile-action-log", () => ({
  getMobileDeviceKind: () => "simulator",
  logMobileAction: vi.fn(),
}));
vi.mock("@/lib/server-config", () => ({ getServerConfig: () => ({ apiUrl: "http://localhost" }) }));
vi.mock("@/lib/services/sentry", () => ({ captureException: vi.fn() }));

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

describe("createMobileHeaders", () => {
  it("adds the current contract epoch without replacing awaited auth headers", async () => {
    const headers = await createMobileHeaders();

    expect(headers.get(CONTRACT_EPOCH_HEADER)).toBe(String(CURRENT_CONTRACT_EPOCH));
    expect(headers.get("cookie")).toBe("better-auth.session_token=redacted");
    expect(headers.get("x-client-type")).toBe("mobile");
  });
});

describe("getSafeApiErrorDiagnostic", () => {
  it("allows only finite tRPC metadata without preserving raw error text", () => {
    expect(
      getSafeApiErrorDiagnostic({
        name: "TRPCClientError",
        message: "Failed query: select private_data",
        data: {
          code: "BAD_REQUEST",
          applicationErrorCode: "ACTIVITY_PLAN_INTEGRITY_FAILED",
          httpStatus: 400,
        },
      }),
    ).toEqual({
      errorClass: "TRPCClientError",
      trpcCode: "BAD_REQUEST",
      applicationErrorCode: "ACTIVITY_PLAN_INTEGRITY_FAILED",
      httpStatus: 400,
    });
  });

  it("denies unknown metadata and invalid status values", () => {
    expect(
      getSafeApiErrorDiagnostic({
        name: "CustomError",
        data: { code: "DATABASE_FAILURE", applicationErrorCode: "UNTRUSTED", httpStatus: 200 },
      }),
    ).toEqual({
      errorClass: "UnknownError",
      trpcCode: null,
      applicationErrorCode: null,
      httpStatus: null,
    });
  });
});

describe("reportMobileApiError", () => {
  const privateMessage = "Failed query: select private_data where token = secret";
  const privateInput = { profileId: "private-id", token: "secret" };

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it.each(["BAD_REQUEST", "CONFLICT"])("warns safely for expected %s responses", (code) => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = {
      name: "TRPCClientError",
      message: privateMessage,
      input: privateInput,
      data: { code, httpStatus: code === "CONFLICT" ? 409 : 400 },
    };

    reportMobileApiError("plannedSessions.create", error);

    expect(warn).toHaveBeenCalledWith("[api]", "plannedSessions.create", {
      errorClass: "TRPCClientError",
      trpcCode: code,
      applicationErrorCode: null,
      httpStatus: code === "CONFLICT" ? 409 : 400,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(privateMessage);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-id");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
  });

  it("keeps an internal 500 in the error channel without raw failure details", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = {
      name: "TRPCClientError",
      message: privateMessage,
      input: privateInput,
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
    };

    reportMobileApiError("plannedSessions.create", error);

    expect(errorLog).toHaveBeenCalledWith("[api]", "plannedSessions.create", {
      errorClass: "TRPCClientError",
      trpcCode: "INTERNAL_SERVER_ERROR",
      applicationErrorCode: null,
      httpStatus: 500,
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateMessage);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private-id");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret");
  });

  it("captures an unknown transport failure as operational while logging no raw data", async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const { captureException } = await import("@/lib/services/sentry");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new TypeError(privateMessage), { input: privateInput });

    reportMobileApiError("plannedSessions.create", error);

    expect(captureException).toHaveBeenCalledWith(error, { procedure: "plannedSessions.create" });
    expect(errorLog).toHaveBeenCalledWith("[api]", "plannedSessions.create", {
      errorClass: "TypeError",
      trpcCode: null,
      applicationErrorCode: null,
      httpStatus: null,
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateMessage);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private-id");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret");
  });
});
