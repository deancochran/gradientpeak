import { getAuthHeaders } from "@/lib/supabase/auth-headers";
import type { AppRouter } from "@repo/trpc/client";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

export const getApiUrl = () => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL!;
  const url = `${baseUrl}/api/trpc`;
  console.log("🔗 tRPC URL:", url);
  return url;
};

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
