import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../../db";
import {
  createIntegrationsRepositories,
  listIntegrationsByProfileId,
} from "../../../infrastructure/repositories/drizzle-integrations-repository";
import { createWahooRepository } from "../../../infrastructure/repositories/drizzle-wahoo-repository";
import { createWahooSyncRepository } from "../../../infrastructure/repositories/drizzle-wahoo-sync-repository";
import type { WahooSyncJobRecord } from "../../../repositories";
import { WahooPlannedActivitySyncService } from "./wahoo-planned-activity-sync-service";
import { WahooPlannedActivityProvider } from "./wahoo-planned-workout-provider";
import type {
  WahooPlannedActivityQueueResult,
  WahooPlannedActivitySyncOperation,
} from "./wahoo-types";

export type WahooCalendarMutationSyncInput = {
  db: DrizzleDbClient;
  plannedSessionIds: string[];
  operation: WahooPlannedActivitySyncOperation;
  profileId: string;
  transaction?: DrizzleTransactionClient;
};

export type EventWahooPlannedActivitySyncStatus =
  | "not_connected"
  | "not_synced"
  | "queued"
  | "scheduled"
  | "synced"
  | "failed"
  | "needs_reconnect";

export function createWahooPlannedActivitySyncServiceForDb(
  db: DrizzleDbClient,
  transaction?: DrizzleTransactionClient,
) {
  const providerSyncRepository = createWahooSyncRepository({ db });
  const wahooRepository = createWahooRepository({ db: transaction ?? db });
  const operationTime = new Date();
  return new WahooPlannedActivitySyncService(
    new WahooPlannedActivityProvider({
      providerSyncRepository,
      wahooRepository,
      now: () => operationTime,
      ...(transaction
        ? {
            enqueueJob: (input) =>
              providerSyncRepository.enqueueJobInTransaction(transaction, input),
          }
        : {}),
    }),
  );
}

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
  candidate: WahooSyncJobRecord,
  otherId: string,
  jobsById: ReadonlyMap<string, WahooSyncJobRecord>,
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
  left: WahooSyncJobRecord,
  right: WahooSyncJobRecord,
  jobsById: ReadonlyMap<string, WahooSyncJobRecord>,
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

function selectLatestJob(jobs: WahooSyncJobRecord[]): WahooSyncJobRecord | undefined {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return jobs.reduce<WahooSyncJobRecord | undefined>(
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

export async function enqueueWahooPlannedSessionSyncAfterMutation(
  input: WahooCalendarMutationSyncInput,
): Promise<WahooPlannedActivityQueueResult | null> {
  const plannedSessionIds = [...new Set(input.plannedSessionIds)].filter(Boolean);
  if (plannedSessionIds.length === 0) return null;

  const queryExecutor = input.transaction ?? input.db;
  if (input.operation === "publish") {
    const sessions = await queryExecutor
      .select({ id: schema.plannedSessions.id })
      .from(schema.plannedSessions)
      .where(
        and(
          eq(schema.plannedSessions.profile_id, input.profileId),
          eq(schema.plannedSessions.status, "scheduled"),
          inArray(schema.plannedSessions.id, plannedSessionIds),
        ),
      );
    if (sessions.length !== plannedSessionIds.length)
      throw new Error("Only owned scheduled planned sessions can be published to Wahoo");
  }
  const integrations = await listIntegrationsByProfileId(queryExecutor, input.profileId, {
    forUpdate: Boolean(input.transaction),
  });
  const wahooRepository = createWahooRepository({ db: queryExecutor });
  const unsyncTargets = new Map<string, { externalId: string; resourceLinkId: string }>();
  if (input.operation === "unsync") {
    for (const plannedSessionId of plannedSessionIds) {
      const link = await wahooRepository.getPlannedSessionResourceLink({
        plannedSessionId,
        forUpdate: Boolean(input.transaction),
        profileId: input.profileId,
        provider: "wahoo",
      });
      if (link)
        unsyncTargets.set(plannedSessionId, {
          externalId: link.externalId,
          resourceLinkId: link.id,
        });
    }
  }
  const actionablePlannedSessionIds =
    input.operation === "unsync"
      ? plannedSessionIds.filter((plannedSessionId) => unsyncTargets.has(plannedSessionId))
      : plannedSessionIds;
  if (actionablePlannedSessionIds.length === 0) return null;
  const result = await createWahooPlannedActivitySyncServiceForDb(
    input.db,
    input.transaction,
  ).enqueue({
    connectedProviders: integrations.map((integration) => integration.provider),
    plannedSessionIds: actionablePlannedSessionIds,
    operation: input.operation,
    profileId: input.profileId,
    unsyncTargets,
  });

  return result;
}

/**
 * Durable follow-up for an activity-plan edit. The worker resolves the current
 * plan when it runs; the queue stores only session identity, and its lane
 * coalescing makes a later edit authoritative over an older queued payload.
 */
export async function enqueueWahooActivityPlanRefreshAfterMutation(input: {
  activityPlanId: string;
  db: DrizzleDbClient;
  profileId: string;
  transaction: DrizzleTransactionClient;
  upcomingOnOrAfter: string;
}): Promise<WahooPlannedActivityQueueResult | null> {
  const sessions = await input.transaction
    .select({ id: schema.plannedSessions.id })
    .from(schema.plannedSessions)
    .where(
      and(
        eq(schema.plannedSessions.activity_plan_id, input.activityPlanId),
        eq(schema.plannedSessions.profile_id, input.profileId),
        eq(schema.plannedSessions.status, "scheduled"),
        gte(schema.plannedSessions.planning_date, input.upcomingOnOrAfter),
      ),
    );

  return enqueueWahooPlannedSessionSyncAfterMutation({
    db: input.db,
    transaction: input.transaction,
    plannedSessionIds: sessions.map((session) => session.id),
    operation: "publish",
    profileId: input.profileId,
  });
}

export async function getEventWahooPlannedActivityStatuses(input: {
  db: DrizzleDbClient;
  eventId: string;
  profileId: string;
}) {
  const repositories = createIntegrationsRepositories(input.db);
  const providerSyncRepository = createWahooSyncRepository({ db: input.db });
  const wahooRepository = createWahooRepository({ db: input.db });
  const integrations = await repositories.integrations.listByProfileId(input.profileId);
  const connectedByProvider = new Map(
    integrations.map((integration) => [integration.provider, integration]),
  );
  const providers = ["wahoo"] as const;
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
        status: "not_connected" satisfies EventWahooPlannedActivitySyncStatus,
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
        status: "needs_reconnect" satisfies EventWahooPlannedActivitySyncStatus,
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
        status: "synced" satisfies EventWahooPlannedActivitySyncStatus,
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
        status: "failed" satisfies EventWahooPlannedActivitySyncStatus,
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
          : "queued") satisfies EventWahooPlannedActivitySyncStatus,
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
        status: "synced" satisfies EventWahooPlannedActivitySyncStatus,
        jobId: null,
        runAt: null,
        lastError: null,
        externalId: link.externalId,
        syncedAt: link.syncedAt,
      };
    }

    return {
      provider,
      status: "not_synced" satisfies EventWahooPlannedActivitySyncStatus,
      jobId: null,
      runAt: null,
      lastError: null,
      externalId: null,
      syncedAt: null,
    };
  });
}
