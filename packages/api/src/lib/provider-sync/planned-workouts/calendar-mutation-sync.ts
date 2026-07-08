import type { DrizzleDbClient } from "@repo/db";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
  createWahooRepository,
} from "../../../infrastructure/repositories";
import { drainDueWahooPlannedWorkoutJobs } from "../wahoo-planned-workout-drain";
import { PlannedWorkoutSyncService } from "./planned-workout-sync-service";
import type { PlannedWorkoutQueueResult, PlannedWorkoutSyncOperation } from "./types";
import { WahooPlannedWorkoutProvider } from "./wahoo-planned-workout-provider";

export type CalendarMutationPlannedWorkoutSyncInput = {
  db: DrizzleDbClient;
  drainDueJobs?: boolean;
  eventIds: string[];
  operation: PlannedWorkoutSyncOperation;
  profileId: string;
};

export function createPlannedWorkoutSyncServiceForDb(db: DrizzleDbClient) {
  const providerSyncRepository = createProviderSyncRepository({ db });
  const wahooRepository = createWahooRepository({ db });

  return new PlannedWorkoutSyncService({
    adapters: {
      wahoo: new WahooPlannedWorkoutProvider({ providerSyncRepository, wahooRepository }),
    },
  });
}

export async function enqueuePlannedWorkoutSyncAfterCalendarMutation(
  input: CalendarMutationPlannedWorkoutSyncInput,
): Promise<PlannedWorkoutQueueResult | null> {
  const eventIds = [...new Set(input.eventIds)].filter(Boolean);
  if (eventIds.length === 0) return null;

  const repositories = createIntegrationsRepositories(input.db);
  const integrations = await repositories.integrations.listByProfileId(input.profileId);

  const result = await createPlannedWorkoutSyncServiceForDb(input.db).enqueue({
    connectedProviders: integrations.map((integration) => integration.provider),
    eventIds,
    operation: input.operation,
    profileId: input.profileId,
  });

  if (input.drainDueJobs !== false && result?.queued) {
    try {
      await drainDueWahooPlannedWorkoutJobs({
        db: input.db,
        limit: 3,
        workerId: "calendar-mutation-planned-workout-drain",
      });
    } catch (error) {
      console.error("Failed to drain due planned workout sync jobs after enqueue:", error);
    }
  }

  return result;
}
