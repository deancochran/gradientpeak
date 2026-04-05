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

function getActionName(input: RequestInfo | URL) {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  try {
    const parsed = new URL(rawUrl);
    const marker = "/api/trpc/";
    const actionPath = parsed.pathname.includes(marker)
      ? (parsed.pathname.split(marker)[1] ?? parsed.pathname)
      : parsed.pathname;

    return decodeURIComponent(actionPath || parsed.pathname);
  } catch {
    return rawUrl;
  }
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  const action = getActionName(input);
  const method = init?.method ?? "GET";

  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort();
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
    logMobileAction(action, "failure", {
      channel: "api",
      method,
      error: error instanceof Error ? error.message : String(error),
    });
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
