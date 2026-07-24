import { appRouter, createApiContext } from "@repo/api/server";
import { captureApiError } from "@repo/api/telemetry";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleTrpcRequest(request),
      POST: ({ request }) => handleTrpcRequest(request),
    },
  },
});

function handleTrpcRequest(request: Request) {
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
    onError: ({ error }) => {
      // Procedure middleware emits a coarse metric; HTTP errors capture exceptions once.
      captureApiError(error, { category: "unknown" });
    },
  });
}
