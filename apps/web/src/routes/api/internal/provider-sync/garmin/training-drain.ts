import { createFileRoute } from "@tanstack/react-router";
import { drainGarminTrainingSync } from "../../../../../lib/garmin-training-sync-worker";
import { isInternalProviderSyncAuthorized } from "../../../../../lib/internal-provider-sync-auth";

/** Callable internal route for the narrowly supported Garmin training subset. */
export const Route = createFileRoute("/api/internal/provider-sync/garmin/training-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const drain = await drainGarminTrainingSync();
        if (drain.alreadyRunning) {
          return Response.json({ provider: "garmin", status: "already_running" }, { status: 202 });
        }
        if (!drain.configured) {
          return Response.json({ error: "Unavailable" }, { status: 503 });
        }
        return Response.json(drain.result);
      },
    },
  },
});
