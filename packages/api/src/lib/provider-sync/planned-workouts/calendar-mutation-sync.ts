import { getProvidersWithCapability } from "@repo/core";
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

export type EventPlannedWorkoutSyncStatus =
  | "not_connected"
  | "not_synced"
  | "queued"
  | "scheduled"
  | "synced"
  | "failed"
  | "needs_reconnect";

export function createPlannedWorkoutSyncServiceForDb(db: DrizzleDbClient) {
  const providerSyncRepository = createProviderSyncRepository({ db });
  const wahooRepository = createWahooRepository({ db });

  return new PlannedWorkoutSyncService({
    adapters: {
      wahoo: new WahooPlannedWorkoutProvider({ providerSyncRepository, wahooRepository }),
    },
  });
}

const supportedPlannedWorkoutProviders = ["wahoo"] as const;

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

export async function getEventPlannedWorkoutProviderStatuses(input: {
  db: DrizzleDbClient;
  eventId: string;
  profileId: string;
}) {
  const repositories = createIntegrationsRepositories(input.db);
  const providerSyncRepository = createProviderSyncRepository({ db: input.db });
  const wahooRepository = createWahooRepository({ db: input.db });
  const integrations = await repositories.integrations.listByProfileId(input.profileId);
  const connectedByProvider = new Map(
    integrations.map((integration) => [integration.provider, integration]),
  );
  const providers = getProvidersWithCapability(
    supportedPlannedWorkoutProviders,
    "planned_activity_push",
  );
  const jobs = await providerSyncRepository.listJobs({
    limit: 100,
    profileId: input.profileId,
    statuses: ["queued", "running", "failed", "dead_lettered"],
  });
  const links = await wahooRepository.listEventResourceLinks({
    eventId: input.eventId,
    profileId: input.profileId,
  });
  const credentialEntries = await Promise.all(
    providers.map(
      async (provider) =>
        [
          provider,
          await repositories.integrations.findCredentialsByProfileIdAndProvider({
            profileId: input.profileId,
            provider,
          }),
        ] as const,
    ),
  );
  const credentialsByProvider = new Map(credentialEntries);
  const now = Date.now();

  return providers.map((provider) => {
    const integration = connectedByProvider.get(provider);
    if (!integration) {
      return {
        provider,
        status: "not_connected" satisfies EventPlannedWorkoutSyncStatus,
        jobId: null,
        runAt: null,
        lastError: null,
        externalId: null,
        syncedAt: null,
      };
    }

    const credentials = credentialsByProvider.get(provider);
    if (
      credentials?.expires_at &&
      credentials.expires_at.getTime() <= now &&
      !credentials.refresh_token
    ) {
      return {
        provider,
        status: "needs_reconnect" satisfies EventPlannedWorkoutSyncStatus,
        jobId: null,
        runAt: null,
        lastError: "Provider access expired",
        externalId: null,
        syncedAt: null,
      };
    }

    const latestJob = jobs.find(
      (job) => job.provider === provider && job.internalResourceId === input.eventId,
    );
    if (latestJob?.status === "failed" || latestJob?.status === "dead_lettered") {
      return {
        provider,
        status: "failed" satisfies EventPlannedWorkoutSyncStatus,
        jobId: latestJob.id,
        runAt: latestJob.runAt,
        lastError: latestJob.lastError,
        externalId: null,
        syncedAt: null,
      };
    }

    if (latestJob?.status === "queued" || latestJob?.status === "running") {
      return {
        provider,
        status: (Date.parse(latestJob.runAt) > now
          ? "scheduled"
          : "queued") satisfies EventPlannedWorkoutSyncStatus,
        jobId: latestJob.id,
        runAt: latestJob.runAt,
        lastError: null,
        externalId: null,
        syncedAt: null,
      };
    }

    const link = links.find((candidate) => candidate.provider === provider);
    if (link) {
      return {
        provider,
        status: "synced" satisfies EventPlannedWorkoutSyncStatus,
        jobId: null,
        runAt: null,
        lastError: null,
        externalId: link.externalId,
        syncedAt: link.syncedAt,
      };
    }

    return {
      provider,
      status: "not_synced" satisfies EventPlannedWorkoutSyncStatus,
      jobId: null,
      runAt: null,
      lastError: null,
      externalId: null,
      syncedAt: null,
    };
  });
}
