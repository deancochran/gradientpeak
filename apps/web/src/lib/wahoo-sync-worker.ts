import { WahooSyncDrainCoordinator } from "./wahoo-sync-drain-coordinator";
import {
  createAthleteStateRuntime,
  createWahooSyncRuntime,
  getWahooDrainConfig,
  isWahooIntegrationEnabled,
} from "./wahoo-sync-runtime";

export type WahooDrainResult = {
  activityHistoryJobs: { completed: number; failed: number; processed: number };
  athleteStateJobs: { completed: number; failed: number; processed: number };
  provider: "wahoo";
  syncJobs: { completed: number; failed: number; processed: number };
  webhookJobs: { completed: number; failed: number; processed: number };
};

const drainCoordinator = new WahooSyncDrainCoordinator<WahooDrainResult>();

async function runDrain(): Promise<WahooDrainResult> {
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

export async function drainWahooProviderSync(): Promise<
  { alreadyRunning: true } | { alreadyRunning: false; result: WahooDrainResult }
> {
  return drainCoordinator.run(runDrain);
}
