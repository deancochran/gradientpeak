import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { unstable_localLink } from "@trpc/client";
import superjson from "superjson";

import { getServerActionTrpcSource } from "../contract-epoch-middleware";
import { api } from "./client";

/** Created per router/request, never shared between authenticated users. */
export function createServerApiClient() {
  let context: ReturnType<typeof createApiContext> | undefined;
  return api.createClient({
    links: [
      unstable_localLink({
        router: appRouter,
        transformer: superjson,
        createContext: () => {
          context ??= (async () => {
            const headers = getRequestHeaders();
            const [{ db }, session] = await Promise.all([
              import("@repo/db/client"),
              resolveAuthSessionFromHeaders(headers),
            ]);
            return createApiContext({
              headers,
              trpcSource: getServerActionTrpcSource(headers),
              auth: { session },
              db,
            });
          })();
          return context;
        },
      }),
    ],
  });
}
