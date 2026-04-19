import { createFileRoute } from "@tanstack/react-router";
import { isInternalProviderSyncAuthorized } from "../../../../../lib/internal-provider-sync-auth";
import { createWahooSyncRuntime } from "../../../../../lib/wahoo-sync-runtime";

export const Route = createFileRoute("/api/internal/provider-sync/wahoo/drain" as never)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const runtime = createWahooSyncRuntime();
        const [syncJobs, webhookJobs] = await Promise.all([
          runtime.syncJobs.processDueJobs({ workerId: "api-internal-wahoo-drain" }),
          runtime.webhookJobs.processDueJobs({ workerId: "api-internal-wahoo-webhook-drain" }),
        ]);

        return Response.json({
          provider: "wahoo",
          syncJobs,
          webhookJobs,
        });
      },
    },
  },
});
