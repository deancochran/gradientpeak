import { createWahooSyncRuntime } from "../src/lib/wahoo-sync-runtime";

const runtime = createWahooSyncRuntime();
const [syncJobs, webhookJobs, activityHistoryJobs] = await Promise.all([
  runtime.syncJobs.processDueJobs({ workerId: "local-direct-wahoo-drain" }),
  runtime.webhookJobs.processDueJobs({ workerId: "local-direct-wahoo-webhook-drain" }),
  runtime.activityHistoryJobs.processDueJobs({
    workerId: "local-direct-wahoo-activity-history-drain",
  }),
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
