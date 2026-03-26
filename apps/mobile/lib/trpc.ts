import {
  createTRPCBatchLink,
  createTRPCUrl,
  createVanillaTRPCClient,
  trpc,
} from "@repo/trpc/react";
import { loggerLink } from "@trpc/client";
import { getServerConfig } from "@/lib/server-config";
import { getAuthHeaders } from "@/lib/supabase/auth-headers";

export { trpc };

const TRPC_REQUEST_TIMEOUT_MS = 10000;

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRPC_REQUEST_TIMEOUT_MS);

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
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
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
