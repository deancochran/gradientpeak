import { getProvidersWithCapability } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
  createWahooRepository,
} from "../../../infrastructure/repositories";
import type { ProviderSyncJobRecord } from "../../../repositories/provider-sync-repository";
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

type EventResourceLink = {
  externalId: string;
  id: string;
  provider: string;
  syncedAt: string | null;
  updatedAt: string | null;
};

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function supersedes(
  candidate: ProviderSyncJobRecord,
  otherId: string,
  jobsById: ReadonlyMap<string, ProviderSyncJobRecord>,
): boolean {
  const visited = new Set<string>();
  let supersededId = candidate.supersedesJobId;

  while (supersededId && !visited.has(supersededId)) {
    if (supersededId === otherId) return true;
    visited.add(supersededId);
    supersededId = jobsById.get(supersededId)?.supersedesJobId ?? null;
  }

  return false;
}

function compareJobAuthority(
  left: ProviderSyncJobRecord,
  right: ProviderSyncJobRecord,
  jobsById: ReadonlyMap<string, ProviderSyncJobRecord>,
): number {
  if (supersedes(left, right.id, jobsById)) return 1;
  if (supersedes(right, left.id, jobsById)) return -1;

  if (
    left.queueSequence !== undefined &&
    right.queueSequence !== undefined &&
    left.queueSequence !== right.queueSequence
  ) {
    return left.queueSequence - right.queueSequence;
  }

  const leftRunAt = parseTimestamp(left.runAt);
  const rightRunAt = parseTimestamp(right.runAt);
  if (leftRunAt !== null && rightRunAt !== null && leftRunAt !== rightRunAt) {
    return leftRunAt - rightRunAt;
  }
  if (leftRunAt !== null && rightRunAt === null) return 1;
  if (leftRunAt === null && rightRunAt !== null) return -1;

  return left.id.localeCompare(right.id);
}

function selectLatestJob(jobs: ProviderSyncJobRecord[]): ProviderSyncJobRecord | undefined {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return jobs.reduce<ProviderSyncJobRecord | undefined>(
    (latest, job) => (!latest || compareJobAuthority(job, latest, jobsById) > 0 ? job : latest),
    undefined,
  );
}

function selectLatestLink(links: EventResourceLink[]): EventResourceLink | undefined {
  return links.reduce<EventResourceLink | undefined>((latest, link) => {
    if (!latest) return link;
    const linkTimestamp = parseTimestamp(link.syncedAt ?? link.updatedAt);
    const latestTimestamp = parseTimestamp(latest.syncedAt ?? latest.updatedAt);
    if (linkTimestamp !== latestTimestamp) {
      if (linkTimestamp === null) return latest;
      if (latestTimestamp === null || linkTimestamp > latestTimestamp) return link;
      return latest;
    }
    return link.id.localeCompare(latest.id) > 0 ? link : latest;
  }, undefined);
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
    internalResourceId: input.eventId,
    limit: 100,
    order: "newest_authority",
    profileId: input.profileId,
    provider: "wahoo",
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

    const latestJob = selectLatestJob(
      jobs.filter((job) => job.provider === provider && job.internalResourceId === input.eventId),
    );
    const link = selectLatestLink(links.filter((candidate) => candidate.provider === provider));
    const linkTimestamp = link ? parseTimestamp(link.syncedAt ?? link.updatedAt) : null;
    const jobTimestamp = latestJob ? parseTimestamp(latestJob.updatedAt ?? latestJob.runAt) : null;

    if (link && linkTimestamp !== null && jobTimestamp !== null && linkTimestamp > jobTimestamp) {
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
