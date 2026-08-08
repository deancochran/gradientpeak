import { createFileRoute } from "@tanstack/react-router";
import { isInternalProviderSyncAuthorized } from "../../../../../lib/internal-provider-sync-auth";
import { WahooSyncDrainCoordinator } from "../../../../../lib/wahoo-sync-drain-coordinator";
import {
  createAthleteStateRuntime,
  createWahooSyncRuntime,
  getWahooDrainConfig,
  isWahooIntegrationEnabled,
} from "../../../../../lib/wahoo-sync-runtime";

type DrainResult = {
  activityHistoryJobs: { completed: number; failed: number; processed: number };
  athleteStateJobs: { completed: number; failed: number; processed: number };
  provider: "wahoo";
  syncJobs: { completed: number; failed: number; processed: number };
  webhookJobs: { completed: number; failed: number; processed: number };
};

const drainCoordinator = new WahooSyncDrainCoordinator<DrainResult>();

async function runDrain(): Promise<DrainResult> {
  const config = getWahooDrainConfig();
  const athleteStateRuntime = createAthleteStateRuntime();
  const empty = { completed: 0, failed: 0, processed: 0 };
  let syncJobs = empty;
  let webhookJobs = empty;
  let activityHistoryJobs = empty;
  if (isWahooIntegrationEnabled()) {
    const runtime = createWahooSyncRuntime();
    const totalClaims = Math.min(config.limit, config.concurrency);
    const [syncLimit, webhookLimit, activityHistoryLimit] =
      drainCoordinator.allocateCapacity(totalClaims);
    [syncJobs, webhookJobs, activityHistoryJobs] = await Promise.all([
      syncLimit > 0
        ? runtime.syncJobs.processDueJobs({
            concurrency: config.concurrency,
            leaseMs: config.leaseMs,
            limit: syncLimit,
            workerId: "api-internal-wahoo-drain",
          })
        : empty,
      webhookLimit > 0
        ? runtime.webhookJobs.processDueJobs({
            concurrency: config.concurrency,
            leaseMs: config.leaseMs,
            limit: webhookLimit,
            workerId: "api-internal-wahoo-webhook-drain",
          })
        : empty,
      activityHistoryLimit > 0
        ? runtime.activityHistoryJobs.processDueJobs({
            concurrency: config.concurrency,
            leaseMs: config.leaseMs,
            limit: activityHistoryLimit,
            workerId: "api-internal-wahoo-activity-history-drain",
          })
        : empty,
    ]);
  }
  const athleteStateJobs = await athleteStateRuntime.athleteStateJobs.processDueJobs({
    limit: config.limit,
  });
  return { activityHistoryJobs, athleteStateJobs, provider: "wahoo", syncJobs, webhookJobs };
}

export const Route = createFileRoute("/api/internal/provider-sync/wahoo/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const drain = await drainCoordinator.run(runDrain);
        if (drain.alreadyRunning) {
          return Response.json({ provider: "wahoo", status: "already_running" }, { status: 202 });
        }
        return Response.json(drain.result);
      },
    },
  },
});
