import { appRouter, createApiContext } from "@repo/api/server";
import { captureApiError, initServerTelemetry } from "@repo/api/telemetry";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        initServerTelemetry();

        return fetchRequestHandler({
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
          onError: ({ error, path, type }) => {
            captureApiError(error, {
              path,
              type,
              surface: "trpc",
            });
          },
        });
      },
      POST: ({ request }) => {
        initServerTelemetry();

        return fetchRequestHandler({
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
          onError: ({ error, path, type }) => {
            captureApiError(error, {
              path,
              type,
              surface: "trpc",
            });
          },
        });
      },
    },
  },
});
