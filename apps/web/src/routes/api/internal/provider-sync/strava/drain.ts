import { createFileRoute } from "@tanstack/react-router";
import { isInternalProviderSyncAuthorized } from "../../../../../lib/internal-provider-sync-auth";
import { providerWorkerRegistry } from "../../../../../lib/provider-worker-registry";

export const Route = createFileRoute("/api/internal/provider-sync/strava/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const worker = providerWorkerRegistry.get("strava", "strava-provider-sync");
        if (!worker) return Response.json({ error: "Unavailable" }, { status: 503 });
        const drain = (await worker()) as
          | { alreadyRunning: true }
          | { alreadyRunning: false; result: unknown };
        if (drain.alreadyRunning) {
          return Response.json({ provider: "strava", status: "already_running" }, { status: 202 });
        }
        return Response.json(drain.result);
      },
    },
  },
});
