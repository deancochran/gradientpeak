import {
  api,
  createApiBatchLink,
  createApiUrl,
  createVanillaApiClient,
  loggerLink,
} from "@repo/api/react";
import { Platform } from "react-native";
import { getSessionAuthHeaders } from "@/lib/auth/auth-headers";
import { getMobileDeviceKind, logMobileAction } from "@/lib/logging/mobile-action-log";
import { getServerConfig } from "@/lib/server-config";

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

function createMobileHeaders() {
  const authHeaders = getSessionAuthHeaders();
  authHeaders.set("x-client-type", "mobile");
  authHeaders.set("x-api-source", "react-native");
  authHeaders.set("x-mobile-platform", Platform.OS);
  authHeaders.set("x-mobile-device-kind", getMobileDeviceKind());
  return authHeaders;
}

let vanillaApiClient: ReturnType<typeof createVanillaApiClient> | null = null;
let vanillaApiUrl = "";

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
      loggerLink({
        enabled: (opts) => __DEV__ || (opts.direction === "down" && opts.result instanceof Error),
        colorMode: "none",
      }),
      createApiBatchLink({
        url: getApiUrl(),
        fetch: fetchWithTimeout,
        headers: createMobileHeaders,
      }),
    ],
  });
}
