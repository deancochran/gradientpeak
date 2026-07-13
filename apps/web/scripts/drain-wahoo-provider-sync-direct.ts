import { createWahooSyncRuntime, getWahooDrainConfig } from "../src/lib/wahoo-sync-runtime";

const runtime = createWahooSyncRuntime();
const config = getWahooDrainConfig();
const totalClaims = Math.min(config.limit, config.concurrency);
const syncLimit = Math.ceil(totalClaims / 3);
const webhookLimit = Math.ceil((totalClaims - syncLimit) / 2);
const activityHistoryLimit = totalClaims - syncLimit - webhookLimit;
const [syncJobs, webhookJobs, activityHistoryJobs] = await Promise.all([
  syncLimit > 0
    ? runtime.syncJobs.processDueJobs({
        ...config,
        limit: syncLimit,
        workerId: "local-direct-wahoo-drain",
      })
    : { completed: 0, failed: 0, processed: 0 },
  webhookLimit > 0
    ? runtime.webhookJobs.processDueJobs({
        ...config,
        limit: webhookLimit,
        workerId: "local-direct-wahoo-webhook-drain",
      })
    : { completed: 0, failed: 0, processed: 0 },
  activityHistoryLimit > 0
    ? runtime.activityHistoryJobs.processDueJobs({
        ...config,
        limit: activityHistoryLimit,
        workerId: "local-direct-wahoo-activity-history-drain",
      })
    : { completed: 0, failed: 0, processed: 0 },
]);

console.log(
  JSON.stringify(
    {
      activityHistoryJobs,
      drainedAt: new Date().toISOString(),
      provider: "wahoo",
      syncJobs,
      webhookJobs,
    },
    null,
    2,
  ),
);

process.exit(0);
