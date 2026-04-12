import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export const Route = createFileRoute("/api/trpc")({
  server: {
    handlers: {
      GET: ({ request }) =>
        fetchRequestHandler({
          endpoint: "/api/trpc",
          req: request,
          router: appRouter,
          createContext: async () =>
            createApiContext({
              headers: new Headers(request.headers),
              auth: {
                resolveSession: resolveAuthSession,
              },
              db,
            }),
        }),
      POST: ({ request }) =>
        fetchRequestHandler({
          endpoint: "/api/trpc",
          req: request,
          router: appRouter,
          createContext: async () =>
            createApiContext({
              headers: new Headers(request.headers),
              auth: {
                resolveSession: resolveAuthSession,
              },
              db,
            }),
        }),
    },
  },
});
