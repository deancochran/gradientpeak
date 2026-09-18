import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import {
  type AppRouter,
  api,
  createApiBatchLink,
  createApiUrl,
  createVanillaApiClient,
  type TRPCLink,
} from "@repo/api/react";
import { observable } from "@trpc/server/observable";
import { Platform } from "react-native";
import { getSessionAuthHeaders } from "@/lib/auth/auth-headers";
import { getMobileDeviceKind, logMobileAction } from "@/lib/logging/mobile-action-log";
import { getServerConfig } from "@/lib/server-config";
import { captureException } from "@/lib/services/sentry";

export { api };

const API_REQUEST_TIMEOUT_MS = 30000;

export class ApiRequestTimeoutError extends Error {
  readonly code = "API_REQUEST_TIMEOUT";
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`API request timed out after ${timeoutMs}ms`);
    this.name = "ApiRequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function isNativeNetworkTimeoutError(error: unknown): error is TypeError {
  return error instanceof TypeError && error.message === "Network request timed out";
}

function getActionName(input: RequestInfo | URL) {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  try {
    const parsed = new URL(rawUrl);
    const marker = "/api/trpc/";
    const actionPath = parsed.pathname.includes(marker)
      ? (parsed.pathname.split(marker)[1] ?? parsed.pathname)
      : parsed.pathname;

    return decodeURIComponent(actionPath || parsed.pathname)
      .replace(/[^A-Za-z0-9._,-]/g, "_")
      .slice(0, 160);
  } catch {
    return "unknown";
  }
}

export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  let abortSource: "local_timeout" | "upstream_abort" | null = null;
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => {
    if (abortSource !== null) return;
    abortSource = "local_timeout";
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);
  const action = getActionName(input);
  const method = init?.method ?? "GET";

  const requestSignal =
    typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined;
  const upstreamSignal = init?.signal ?? requestSignal;
  const abortFromUpstream = () => {
    if (abortSource !== null) return;
    abortSource = "upstream_abort";
    clearTimeout(timeoutId);
    controller.abort(upstreamSignal?.reason);
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  try {
    logMobileAction(action, "attempt", { channel: "api", method });

    const response = await fetch(input, {
      ...init,
      // Better Auth's Expo integration stores the session cookie outside the native cookie jar.
      // Omitting native credentials prevents that jar from overriding the manually supplied cookie.
      credentials: "omit",
      signal: controller.signal,
    });

    logMobileAction(action, response.ok ? "success" : "failure", {
      channel: "api",
      method,
      status: response.status,
      ok: response.ok,
    });

    return response;
  } catch (error) {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const nativeNetworkTimeout = abortSource === null && isNativeNetworkTimeoutError(error);
    logMobileAction(action, "failure", {
      channel: "api",
      method,
      classification: nativeNetworkTimeout
        ? "native_timeout"
        : (abortSource ?? "transport_failure"),
      elapsedMs,
      errorName: error instanceof Error ? error.name : "UnknownError",
      timeoutMs: API_REQUEST_TIMEOUT_MS,
    });
    if (abortSource === "local_timeout" || nativeNetworkTimeout) {
      throw new ApiRequestTimeoutError(API_REQUEST_TIMEOUT_MS);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
};

export const getApiUrl = () => {
  const baseUrl = getServerConfig().apiUrl;
  const url = createApiUrl(baseUrl);
  console.log("🔗 API URL:", url);
  return url;
};

export async function createMobileHeaders() {
  const authHeaders = await getSessionAuthHeaders();
  authHeaders.set(CONTRACT_EPOCH_HEADER, String(CURRENT_CONTRACT_EPOCH));
  authHeaders.set("x-client-type", "mobile");
  authHeaders.set("x-api-source", "react-native");
  authHeaders.set("x-mobile-platform", Platform.OS);
  authHeaders.set("x-mobile-device-kind", getMobileDeviceKind());
  return authHeaders;
}

let vanillaApiClient: ReturnType<typeof createVanillaApiClient> | null = null;
let vanillaApiUrl = "";

const SAFE_TRPC_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "INTERNAL_SERVER_ERROR",
]);
const SAFE_APPLICATION_ERROR_CODES = new Set([
  "ONBOARDING_PENDING_OAUTH",
  "ACTIVITY_PLAN_INTEGRITY_FAILED",
]);
const SAFE_ERROR_CLASSES = new Set([
  "TRPCClientError",
  "ApiRequestTimeoutError",
  "AbortError",
  "TypeError",
]);

export type SafeApiErrorDiagnostic = {
  applicationErrorCode: string | null;
  errorClass: string;
  httpStatus: number | null;
  trpcCode: string | null;
};

/** Returns only finite transport metadata; never use an error message as diagnostics. */
export function getSafeApiErrorDiagnostic(error: unknown): SafeApiErrorDiagnostic {
  const candidate = error && typeof error === "object" ? error : null;
  const data = candidate && "data" in candidate ? candidate.data : null;
  const errorData = data && typeof data === "object" ? data : null;
  const code = errorData && "code" in errorData ? errorData.code : null;
  const applicationErrorCode =
    errorData && "applicationErrorCode" in errorData ? errorData.applicationErrorCode : null;
  const httpStatus = errorData && "httpStatus" in errorData ? errorData.httpStatus : null;
  const errorName = candidate && "name" in candidate ? candidate.name : null;

  return {
    applicationErrorCode:
      typeof applicationErrorCode === "string" &&
      SAFE_APPLICATION_ERROR_CODES.has(applicationErrorCode)
        ? applicationErrorCode
        : null,
    errorClass:
      typeof errorName === "string" && SAFE_ERROR_CLASSES.has(errorName)
        ? errorName
        : "UnknownError",
    httpStatus:
      typeof httpStatus === "number" &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 400 &&
      httpStatus <= 599
        ? httpStatus
        : null,
    trpcCode: typeof code === "string" && SAFE_TRPC_ERROR_CODES.has(code) ? code : null,
  };
}

function isExpectedApiError(diagnostic: SafeApiErrorDiagnostic) {
  return (
    (diagnostic.httpStatus !== null &&
      diagnostic.httpStatus >= 400 &&
      diagnostic.httpStatus < 500) ||
    (diagnostic.trpcCode !== null && diagnostic.trpcCode !== "INTERNAL_SERVER_ERROR")
  );
}

export function reportMobileApiError(procedure: string, error: unknown) {
  const diagnostic = getSafeApiErrorDiagnostic(error);
  const expected = isExpectedApiError(diagnostic);
  // Expected user-action outcomes are handled in UI rather than reported as operational failures.
  if (!expected && diagnostic.httpStatus !== 500) {
    captureException(error instanceof Error ? error : new Error("API client failure"), {
      procedure,
    });
  }
  if (__DEV__) {
    const log = expected ? console.warn : console.error;
    log("[api]", procedure, diagnostic);
  }
}

const mobileErrorLoggerLink: TRPCLink<AppRouter> = () => {
  return ({ op, next }) =>
    observable((observer) =>
      next(op).subscribe({
        next: (result) => observer.next(result),
        complete: () => observer.complete(),
        error: (error) => {
          reportMobileApiError(op.path, error);
          observer.error(error);
        },
      }),
    );
};

export function getVanillaApiClient() {
  const currentUrl = getApiUrl();
  if (!vanillaApiClient || vanillaApiUrl !== currentUrl) {
    vanillaApiClient = createVanillaApiClient({
      url: currentUrl,
      fetch: fetchWithTimeout,
      headers: createMobileHeaders,
    });
    vanillaApiUrl = currentUrl;
  }

  return vanillaApiClient;
}

export function createApiClient() {
  return api.createClient({
    links: [
      mobileErrorLoggerLink,
      createApiBatchLink({
        url: getApiUrl(),
        fetch: fetchWithTimeout,
        headers: createMobileHeaders,
      }),
    ],
  });
}
