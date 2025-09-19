import { getAuthHeaders } from "@/lib/supabase/client";
import type { AppRouter } from "@repo/trpc/client";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

export const getApiUrl = () => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
  return `${baseUrl}/api/trpc`;
};

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          __DEV__ ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        transformer: superjson, // belongs here
        url: getApiUrl(),
        headers: getAuthHeaders,
      }),
    ],
  });
}
