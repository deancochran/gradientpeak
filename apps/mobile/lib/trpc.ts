import {
  createTRPCBatchLink,
  createTRPCUrl,
  createVanillaTRPCClient,
  trpc,
} from "@repo/trpc/react";
import { loggerLink } from "@trpc/client";
import { Platform } from "react-native";
import { getMobileDeviceKind, logMobileAction } from "@/lib/logging/mobile-action-log";
import { getServerConfig } from "@/lib/server-config";
import { getAuthHeaders } from "@/lib/supabase/auth-headers";

export { trpc };

const TRPC_REQUEST_TIMEOUT_MS = 10000;

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
  const timeoutId = setTimeout(() => controller.abort(), TRPC_REQUEST_TIMEOUT_MS);
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
    logMobileAction(action, "attempt", { channel: "trpc", method });

    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    logMobileAction(action, response.ok ? "success" : "failure", {
      channel: "trpc",
      method,
      status: response.status,
      ok: response.ok,
    });

    return response;
  } catch (error) {
    logMobileAction(action, "failure", {
      channel: "trpc",
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
  const url = createTRPCUrl(baseUrl);
  console.log("🔗 tRPC URL:", url);
  return url;
};

function createMobileHeaders() {
  const authHeaders = getAuthHeaders();
  authHeaders.set("x-client-type", "mobile");
  authHeaders.set("x-trpc-source", "react-native");
  authHeaders.set("x-mobile-platform", Platform.OS);
  authHeaders.set("x-mobile-device-kind", getMobileDeviceKind());
  return authHeaders;
}

let vanillaTrpcClient: ReturnType<typeof createVanillaTRPCClient> | null = null;
let vanillaTrpcUrl = "";

export function getVanillaTrpcClient() {
  const currentUrl = getApiUrl();
  if (!vanillaTrpcClient || vanillaTrpcUrl !== currentUrl) {
    vanillaTrpcClient = createVanillaTRPCClient({
      url: currentUrl,
      fetch: fetchWithTimeout,
      headers: createMobileHeaders,
    });
    vanillaTrpcUrl = currentUrl;
  }

  return vanillaTrpcClient;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) => __DEV__ || (opts.direction === "down" && opts.result instanceof Error),
        colorMode: "none",
      }),
      createTRPCBatchLink({
        url: getApiUrl(),
        fetch: fetchWithTimeout,
        headers: createMobileHeaders,
      }),
    ],
  });
}
