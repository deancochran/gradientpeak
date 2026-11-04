import {
  createStravaSyncRuntime,
  getStravaDrainConfig,
  isStravaIntegrationEnabled,
} from "./strava-sync-runtime";

export type StravaDrainResult = {
  activityHistoryJobs: { completed: number; failed: number; processed: number };
  completedActivityUploadJobs: { completed: number; failed: number; processed: number };
  provider: "strava";
  webhookJobs: { completed: number; failed: number; processed: number };
};

let activeDrain: Promise<StravaDrainResult> | undefined;

/** App-owned bounded worker callable; deployment scheduling can invoke this without a route. */
export async function drainStravaProviderSync(): Promise<
  { alreadyRunning: true } | { alreadyRunning: false; result: StravaDrainResult }
> {
  if (activeDrain !== undefined) return { alreadyRunning: true };
  const invocation = (async () => {
    const empty = { completed: 0, failed: 0, processed: 0 };
    if (!isStravaIntegrationEnabled()) {
      return {
        activityHistoryJobs: empty,
        completedActivityUploadJobs: empty,
        provider: "strava" as const,
        webhookJobs: empty,
      };
    }
    const config = getStravaDrainConfig();
    const runtime = createStravaSyncRuntime();
    const webhookLimit = Math.max(1, Math.floor(config.limit / 3));
    const uploadLimit = Math.max(1, Math.floor(config.limit / 3));
    const historyLimit = Math.max(1, config.limit - webhookLimit - uploadLimit);
    const [webhookJobs, activityHistoryJobs, completedActivityUploadJobs] = await Promise.all([
      runtime.webhookJobs.processDueJobs({
        leaseMs: config.leaseMs,
        limit: webhookLimit,
        workerId: "app-strava-webhook-drain",
      }),
      runtime.activityHistoryJobs.processDueJobs({
        leaseMs: config.leaseMs,
        limit: historyLimit,
        workerId: "app-strava-history-drain",
      }),
      runtime.completedActivityUploadJobs.processDueJobs({
        leaseMs: config.leaseMs,
        limit: uploadLimit,
        workerId: "app-strava-upload-drain",
      }),
    ]);
    return {
      activityHistoryJobs,
      completedActivityUploadJobs,
      provider: "strava" as const,
      webhookJobs,
    };
  })();
  activeDrain = invocation;
  try {
    return { alreadyRunning: false, result: await invocation };
  } finally {
    if (activeDrain === invocation) activeDrain = undefined;
  }
}
