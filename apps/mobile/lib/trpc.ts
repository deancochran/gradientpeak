import { getAuthHeaders } from "@/lib/supabase/auth-headers";
import { getServerConfig } from "@/lib/server-config";
import type { AppRouter } from "@repo/trpc/client";
import { createTRPCProxyClient, httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

export const getApiUrl = () => {
  const baseUrl = getServerConfig().apiUrl;
  const url = `${baseUrl}/api/trpc`;
  console.log("🔗 tRPC URL:", url);
  return url;
};

export const trpc = createTRPCReact<AppRouter>();

let vanillaTrpcClient: ReturnType<
  typeof createTRPCProxyClient<AppRouter>
> | null = null;
let vanillaTrpcUrl = "";

export function getVanillaTrpcClient() {
  const currentUrl = getApiUrl();
  if (!vanillaTrpcClient || vanillaTrpcUrl !== currentUrl) {
    vanillaTrpcClient = createTRPCProxyClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (opts) =>
            __DEV__ ||
            (opts.direction === "down" && opts.result instanceof Error),
          colorMode: "none",
        }),
        httpBatchLink({
          transformer: superjson,
          url: currentUrl,
          headers: () => {
            const authHeaders = getAuthHeaders();
            authHeaders.set("x-client-type", "mobile");
            authHeaders.set("x-trpc-source", "react-native");
            return authHeaders;
          },
        }),
      ],
    });
    vanillaTrpcUrl = currentUrl;
  }

  return vanillaTrpcClient;
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          __DEV__ ||
          (opts.direction === "down" && opts.result instanceof Error),
        colorMode: "none",
      }),
      httpBatchLink({
        transformer: superjson,
        url: getApiUrl(),
        headers: () => {
          const authHeaders = getAuthHeaders();
          authHeaders.set("x-client-type", "mobile");
          authHeaders.set("x-trpc-source", "react-native");
          return authHeaders;
        },
      }),
    ],
  });
}
