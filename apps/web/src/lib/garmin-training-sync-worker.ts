import {
  admitGarminPlannedSessionSyncWindow,
  getGarminOAuthConfig,
  runGarminPlannedSessionSyncJobs,
} from "@repo/api/webhooks";
import { db } from "@repo/db/client";

export type GarminTrainingDrainResult = {
  admission: { profiles: number; queued: number };
  provider: "garmin";
  trainingJobs: { claimed: number; completed: number; failed: number; recoveryRequired: number };
};

let activeDrain: Promise<GarminTrainingDrainResult> | undefined;

/**
 * Internal-only bounded runner. Configuration establishes credentials only; it
 * is deliberately not treated as a user-facing Garmin delivery enablement flag.
 */
export async function drainGarminTrainingSync(): Promise<
  | { alreadyRunning: true }
  | { alreadyRunning: false; configured: false }
  | { alreadyRunning: false; configured: true; result: GarminTrainingDrainResult }
> {
  if (activeDrain !== undefined) return { alreadyRunning: true };
  if (!getGarminOAuthConfig()) return { alreadyRunning: false, configured: false };
  const invocation = (async () => {
    const admission = await admitGarminPlannedSessionSyncWindow({ db, profileLimit: 10 });
    const trainingJobs = await runGarminPlannedSessionSyncJobs({
      db,
      workerId: "api-internal-garmin-training-drain",
      limit: 10,
    });
    return { admission, provider: "garmin" as const, trainingJobs };
  })();
  activeDrain = invocation;
  try {
    return { alreadyRunning: false, configured: true, result: await invocation };
  } finally {
    if (activeDrain === invocation) activeDrain = undefined;
  }
}
