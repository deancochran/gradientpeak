import {
  getConfigurableProviderActions,
  getProviderCapabilityDefinition,
  isProviderRuntimeEnabled,
  providerCapabilityRegistry,
  providerHasCapability,
} from "@repo/core";
import {
  type DrizzleDbClient,
  type PublicIntegrationProvider,
  publicIntegrationsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
} from "../../infrastructure/repositories";
import { isProviderOAuthConfigured } from "../../lib/integrations/oauth-config";
import { logger } from "../../lib/logger";

const activityHistoryResource = "historical_activities";
const profileEnrichmentResource = "profile_enrichment";
const plannedWorkoutsResource = "planned_workouts";
const wahooActivityHistoryJobType = "wahoo.activity_history_reconcile";
const wahooPlannedWorkoutJobTypes = new Set(["wahoo.publish_event", "wahoo.unsync_event"]);

function parseBoundaryValue<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

export function supportsActivityHistorySync(provider: PublicIntegrationProvider): boolean {
  return (
    providerHasCapability(provider, "activity_history_read") &&
    providerHasCapability(provider, "activity_file_download")
  );
}

async function readProviderSyncOverviewState(
  providerSyncRepository: ReturnType<typeof createProviderSyncRepository>,
  integrationIds: string[],
) {
  try {
    return await providerSyncRepository.listSyncStateByIntegrationIds(integrationIds);
  } catch (error) {
    logger.warn("Failed to read provider sync state for integrations overview", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

async function readActiveProviderSyncJobs(
  providerSyncRepository: ReturnType<typeof createProviderSyncRepository>,
  profileId: string,
) {
  try {
    return await providerSyncRepository.listJobs({
      limit: 50,
      profileId,
      statuses: ["queued", "running"],
    });
  } catch (error) {
    logger.warn("Failed to read provider sync jobs for integrations overview", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

function getSyncMetadataStatus(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("status" in metadata)) return null;
  const status = metadata.status;
  return typeof status === "string" ? status : null;
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCurrentSyncError(input: {
  integrationUpdatedAt: Date | string | null | undefined;
  lastError: string | null | undefined;
  lastSyncFailedAt: string | null | undefined;
}): string | null {
  if (!input.lastError) return null;

  const integrationUpdatedAt = toDateOrNull(input.integrationUpdatedAt);
  const lastSyncFailedAt = toDateOrNull(input.lastSyncFailedAt);

  if (integrationUpdatedAt && lastSyncFailedAt && integrationUpdatedAt > lastSyncFailedAt) {
    return null;
  }

  return input.lastError;
}

function looksLikeReconnectError(error: string | null | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes("reconnect required") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401") ||
    normalized.includes("invalid token") ||
    normalized.includes("expired") ||
    normalized.includes("refresh token")
  );
}

function getCompactProviderSummary(input: {
  activityStatus: "idle" | "queued" | "importing" | "synced" | "failed" | "unsupported";
  connected: boolean;
  label: string;
  plannedStatus: "automatic" | "queued" | "syncing" | "failed" | "unsupported";
  providerHealthStatus: "connected" | "needs_reconnect" | "unsupported";
  setupStatus: "idle" | "refreshing" | "refreshed" | "failed" | "unsupported";
}) {
  if (!input.connected) {
    return {
      badge: "Ready",
      health: "unavailable" as const,
      subtitle: "Connect",
      title: input.label,
    };
  }

  if (input.providerHealthStatus === "needs_reconnect") {
    return {
      badge: "Reconnect",
      health: "needs_reconnect" as const,
      subtitle: "Sync paused",
      title: input.label,
    };
  }

  if (
    input.activityStatus === "failed" ||
    input.plannedStatus === "failed" ||
    input.setupStatus === "failed"
  ) {
    return {
      badge: "Issue",
      health: "failed" as const,
      subtitle: "Needs attention",
      title: input.label,
    };
  }

  if (input.activityStatus === "importing" || input.plannedStatus === "syncing") {
    return {
      badge: "Syncing",
      health: "syncing" as const,
      subtitle: "In progress",
      title: input.label,
    };
  }

  if (input.activityStatus === "queued" || input.plannedStatus === "queued") {
    return {
      badge: "Queued",
      health: "queued" as const,
      subtitle: "Waiting",
      title: input.label,
    };
  }

  return {
    badge: "Auto",
    health: "connected" as const,
    subtitle: "Connected",
    title: input.label,
  };
}

function getPrimaryProviderAction(input: {
  connected: boolean;
  providerHealthStatus: "connected" | "needs_reconnect" | "unsupported";
}): "connect" | "disconnect" | "reconnect" {
  if (!input.connected) return "connect";
  if (input.providerHealthStatus === "needs_reconnect") return "reconnect";
  return "disconnect";
}

export async function getProviderSyncOverview(input: { db: DrizzleDbClient; profileId: string }) {
  const repositories = createIntegrationsRepositories(input.db);
  const providerSyncRepository = createProviderSyncRepository({ db: input.db });
  const integrations = parseBoundaryValue(
    z.array(publicIntegrationsRowSchema),
    await repositories.integrations.listByProfileId(input.profileId),
    "Integrations repository returned invalid rows",
  );
  const integrationIds = integrations.map((integration) => integration.id);
  const [syncStates, activeJobs] = await Promise.all([
    readProviderSyncOverviewState(providerSyncRepository, integrationIds),
    readActiveProviderSyncJobs(providerSyncRepository, input.profileId),
  ]);
  const integrationsByProvider = new Map(
    integrations.map((integration) => [integration.provider, integration]),
  );

  return providerCapabilityRegistry
    .filter(
      (definition) =>
        isProviderRuntimeEnabled(definition.id) && isProviderOAuthConfigured(definition.id),
    )
    .map((definition) => {
      const integration = integrationsByProvider.get(definition.id);
      const activityState = integration
        ? syncStates.find(
            (candidate) =>
              candidate.integrationId === integration.id &&
              candidate.resource === activityHistoryResource,
          )
        : null;
      const setupState = integration
        ? syncStates.find(
            (candidate) =>
              candidate.integrationId === integration.id &&
              candidate.resource === profileEnrichmentResource,
          )
        : null;
      const plannedState = integration
        ? syncStates.find(
            (candidate) =>
              candidate.integrationId === integration.id &&
              candidate.resource === plannedWorkoutsResource,
          )
        : null;
      const activeActivityJob = integration
        ? activeJobs.find(
            (job) =>
              job.integrationId === integration.id && job.jobType === wahooActivityHistoryJobType,
          )
        : null;
      const activePlannedJob = integration
        ? activeJobs.find(
            (job) =>
              job.integrationId === integration.id && wahooPlannedWorkoutJobTypes.has(job.jobType),
          )
        : null;
      const activityHistorySupported = supportsActivityHistorySync(definition.id);
      const setupSupported = providerHasCapability(definition.id, "profile_enrichment_read");
      const plannedSupported = providerHasCapability(definition.id, "planned_activity_push");
      const activityLastError = getCurrentSyncError({
        integrationUpdatedAt: integration?.updated_at,
        lastError: activityState?.lastError,
        lastSyncFailedAt: activityState?.lastSyncFailedAt,
      });
      const setupLastError = getCurrentSyncError({
        integrationUpdatedAt: integration?.updated_at,
        lastError: setupState?.lastError,
        lastSyncFailedAt: setupState?.lastSyncFailedAt,
      });
      const plannedLastError = getCurrentSyncError({
        integrationUpdatedAt: integration?.updated_at,
        lastError: plannedState?.lastError,
        lastSyncFailedAt: plannedState?.lastSyncFailedAt,
      });
      const activityHistoryStatus = !activityHistorySupported
        ? "unsupported"
        : activeActivityJob?.status === "running"
          ? "importing"
          : activeActivityJob?.status === "queued"
            ? "queued"
            : activityLastError
              ? "failed"
              : activityState?.lastSyncSucceededAt
                ? "synced"
                : "idle";
      const setupStatus = !setupSupported
        ? "unsupported"
        : getSyncMetadataStatus(setupState?.metadata) === "running"
          ? "refreshing"
          : setupLastError
            ? "failed"
            : setupState?.lastSyncSucceededAt
              ? "refreshed"
              : "idle";
      const plannedStatus = !plannedSupported
        ? "unsupported"
        : activePlannedJob?.status === "running"
          ? "syncing"
          : activePlannedJob?.status === "queued"
            ? "queued"
            : plannedLastError
              ? "failed"
              : "automatic";
      const providerHealthLastError = activityLastError ?? setupLastError ?? plannedLastError;
      const providerHealthStatus = !integration
        ? "unsupported"
        : looksLikeReconnectError(providerHealthLastError)
          ? "needs_reconnect"
          : "connected";
      const label = getProviderCapabilityDefinition(definition.id).label;
      const summary = getCompactProviderSummary({
        activityStatus: activityHistoryStatus,
        connected: Boolean(integration),
        label,
        plannedStatus,
        providerHealthStatus,
        setupStatus,
      });

      return {
        actions: integration ? getConfigurableProviderActions(definition.id) : [],
        activityHistory: {
          lastError: activityLastError,
          lastFailedAt: activityState?.lastSyncFailedAt ?? null,
          lastSucceededAt: activityState?.lastSyncSucceededAt ?? null,
          queuedJobId: activeActivityJob?.id ?? null,
          status: activityHistoryStatus,
        },
        plannedWorkouts: {
          lastError: plannedLastError,
          lastFailedAt: plannedState?.lastSyncFailedAt ?? null,
          lastSucceededAt: plannedState?.lastSyncSucceededAt ?? null,
          queuedJobId: activePlannedJob?.id ?? null,
          status: plannedStatus,
        },
        providerHealth: {
          lastError: providerHealthLastError,
          status: providerHealthStatus,
        },
        configured: true,
        setupData: {
          lastError: setupLastError,
          lastFailedAt: setupState?.lastSyncFailedAt ?? null,
          lastSucceededAt: setupState?.lastSyncSucceededAt ?? null,
          status: setupStatus,
        },
        connected: Boolean(integration),
        integrationId: integration?.id ?? null,
        label,
        primaryAction: getPrimaryProviderAction({
          connected: Boolean(integration),
          providerHealthStatus,
        }),
        provider: definition.id,
        summary,
      };
    });
}
