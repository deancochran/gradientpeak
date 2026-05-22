import type { DrizzleDbClient } from "@repo/db";
import {
  createProviderSyncRepository,
  createWahooRepository,
} from "../../infrastructure/repositories";
import { createWahooRouteStorage, WahooSyncService } from "../integrations/wahoo/sync-service";
import { WahooSyncJobService } from "./wahoo-job-service";

export type WahooPlannedWorkoutDrainResult = {
  completed: number;
  failed: number;
  processed: number;
};

export async function drainDueWahooPlannedWorkoutJobs(input: {
  db: DrizzleDbClient;
  limit?: number;
  workerId?: string;
}): Promise<WahooPlannedWorkoutDrainResult> {
  const wahooRepository = createWahooRepository({ db: input.db });
  const providerSyncRepository = createProviderSyncRepository({ db: input.db });
  const syncService = new WahooSyncService({
    repository: wahooRepository,
    storage: createWahooRouteStorage({
      async downloadRouteGpx() {
        return null;
      },
    }),
  });

  return new WahooSyncJobService({
    providerSyncRepository,
    syncService,
    wahooRepository,
  }).processDueJobs({
    limit: input.limit ?? 3,
    workerId: input.workerId ?? "calendar-planned-workout-drain",
  });
}
