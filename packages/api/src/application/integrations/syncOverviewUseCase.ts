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
import { hasWahooPlannedActivityScopes } from "../../lib/integrations/wahoo/planned-activity-scopes";
import { logger } from "../../lib/logger";

const activityHistoryResource = "historical_activities";
const profileEnrichmentResource = "profile_enrichment";
const plannedActivitiesResource = "planned_activities";
const wahooActivityHistoryJobType = "wahoo.activity_history_reconcile";
const wahooPlannedActivityJobTypes = new Set(["wahoo.publish_event", "wahoo.unsync_event"]);

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

  return toSafeProviderSyncCopy(input.lastError);
}

function toSafeProviderSyncCopy(error: string): string | null {
  switch (error) {
    case "activity_history_failed":
      return "Activity history sync failed";
    case "activity_history_budget_exceeded":
      return "Activity history sync will retry";
    case "invalid_job_payload":
      return "Sync job could not be processed";
    case "integration_generation_inactive":
      return "Sync was stopped";
    case "disconnect_attempt_uncertain":
    case "disconnect_response_uncertain":
      return "Disconnect is being retried";
    case "disconnect_failed":
      return "Disconnect failed";
    case "provider_sync_failed":
      return "Provider sync failed";
    default:
      return null;
  }
}

function getCompactProviderSummary(input: {
  activityStatus: "idle" | "queued" | "importing" | "synced" | "failed" | "unsupported";
  connected: boolean;
  configured: boolean;
  label: string;
  plannedStatus: "automatic" | "queued" | "syncing" | "failed" | "unsupported";
  providerHealthStatus:
    | "connected"
    | "disconnecting"
    | "disconnected"
    | "needs_reconnect"
    | "unsupported";
  setupStatus: "idle" | "refreshing" | "refreshed" | "failed" | "unsupported";
}) {
  if (input.providerHealthStatus === "disconnecting") {
    return {
      badge: "Disconnecting",
      health: "disconnecting" as const,
      subtitle: "Revoking provider access",
      title: input.label,
    };
  }

  if (!input.configured) {
    return {
      badge: "Unavailable",
      health: "unavailable" as const,
      subtitle: "Server configuration required",
      title: input.label,
    };
  }

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

  if (input.plannedStatus === "unsupported") {
    return {
      badge: "Limited",
      health: "connected" as const,
      subtitle: "Planned activities unavailable",
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
  configured: boolean;
  providerHealthStatus:
    | "connected"
    | "disconnecting"
    | "disconnected"
    | "needs_reconnect"
    | "unsupported";
}): "connect" | "disconnect" | "reconnect" | null {
  if (input.providerHealthStatus === "disconnecting") return null;
  if (!input.configured) return input.connected ? "disconnect" : null;
  if (!input.connected) return "connect";
  if (input.providerHealthStatus === "needs_reconnect") return "reconnect";
  return "disconnect";
}

function getGrantedScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? "").split(/[\s,]+/).filter(Boolean));
}

function getAllowedActions(input: {
  configured: boolean;
  connected: boolean;
  grantedScope: string | null | undefined;
  provider: PublicIntegrationProvider;
  providerHealthStatus:
    | "connected"
    | "disconnecting"
    | "disconnected"
    | "needs_reconnect"
    | "unsupported";
}) {
  if (!input.connected) return [];
  if (!input.configured || input.providerHealthStatus !== "connected")
    return ["disconnect"] as const;

  const actions = getConfigurableProviderActions(input.provider);
  const grantedScopes = getGrantedScopes(input.grantedScope);
  return actions.filter((action) => {
    if (action === "disconnect") return true;
    if (input.provider === "wahoo" && action === "sync_now") {
      return grantedScopes.has("workouts_read") && grantedScopes.has("offline_data");
    }
    if (input.provider === "wahoo" && action === "refresh_setup_data") {
      return grantedScopes.has("user_read") && grantedScopes.has("power_zones_read");
    }
    return false;
  });
}

export async function getProviderSyncOverview(input: { db: DrizzleDbClient; profileId: string }) {
  const repositories = createIntegrationsRepositories(input.db);
  const providerSyncRepository = createProviderSyncRepository({ db: input.db });
  const integrations = parseBoundaryValue(
    z.array(publicIntegrationsRowSchema),
    await repositories.integrations.listByProfileId(input.profileId),
    "Integrations repository returned invalid rows",
  );
  const activeIntegrations = integrations.filter(
    (integration) => integration.lifecycle_status === "active",
  );
  const integrationIds = activeIntegrations.map((integration) => integration.id);
  const [syncStates, activeJobs] = await Promise.all([
    readProviderSyncOverviewState(providerSyncRepository, integrationIds),
    readActiveProviderSyncJobs(providerSyncRepository, input.profileId),
  ]);
  const integrationsByProvider = new Map(
    integrations.map((integration) => [integration.provider, integration]),
  );

  return Promise.all(
    providerCapabilityRegistry
      .filter((definition) => isProviderRuntimeEnabled(definition.id))
      .map(async (definition) => {
        const configured = isProviderOAuthConfigured(definition.id);
        const lifecycleIntegration = integrationsByProvider.get(definition.id);
        const disconnecting = lifecycleIntegration?.lifecycle_status === "disconnect_pending";
        const integration =
          lifecycleIntegration?.lifecycle_status === "active" ? lifecycleIntegration : undefined;
        const grant = integration
          ? await repositories.integrations.findGrantByProfileIdAndProvider({
              profileId: input.profileId,
              provider: definition.id,
            })
          : null;
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
                candidate.resource === plannedActivitiesResource,
            )
          : null;
        const activeActivityJob = integration
          ? activeJobs.find(
              (job) =>
                job.integrationId === integration.id && job.jobType === wahooActivityHistoryJobType,
            )
          : null;
        const activePlannedActivityJob = integration
          ? activeJobs.find(
              (job) =>
                job.integrationId === integration.id &&
                wahooPlannedActivityJobTypes.has(job.jobType),
            )
          : null;
        const activityHistorySupported = supportsActivityHistorySync(definition.id);
        const setupSupported = providerHasCapability(definition.id, "profile_enrichment_read");
        const plannedScopesGranted =
          definition.id !== "wahoo" || hasWahooPlannedActivityScopes(grant?.scope);
        const plannedSupported =
          providerHasCapability(definition.id, "planned_activity_push") && plannedScopesGranted;
        const plannedUnavailableReason = !plannedScopesGranted
          ? "Reconnect Wahoo to grant planned activity permissions"
          : null;
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
          : activePlannedActivityJob?.status === "running"
            ? "syncing"
            : activePlannedActivityJob?.status === "queued"
              ? "queued"
              : plannedLastError
                ? "failed"
                : "automatic";
        const providerHealthLastError = activityLastError ?? setupLastError ?? plannedLastError;
        const connected = integration?.lifecycle_status === "active";
        const providerHealthStatus = disconnecting
          ? "disconnecting"
          : !connected
            ? "disconnected"
            : grant?.reconnect_required_at
              ? "needs_reconnect"
              : "connected";
        const label = getProviderCapabilityDefinition(definition.id).label;
        const summary = getCompactProviderSummary({
          activityStatus: activityHistoryStatus,
          connected,
          configured,
          label,
          plannedStatus,
          providerHealthStatus,
          setupStatus,
        });

        return {
          actions: getAllowedActions({
            configured,
            connected,
            grantedScope: grant?.scope,
            provider: definition.id,
            providerHealthStatus,
          }),
          activityHistory: {
            lastError: activityLastError,
            lastFailedAt: activityState?.lastSyncFailedAt ?? null,
            lastSucceededAt: activityState?.lastSyncSucceededAt ?? null,
            queuedJobId: activeActivityJob?.id ?? null,
            status: activityHistoryStatus,
          },
          plannedActivities: {
            lastError: plannedUnavailableReason ?? plannedLastError,
            lastFailedAt: plannedState?.lastSyncFailedAt ?? null,
            lastSucceededAt: plannedState?.lastSyncSucceededAt ?? null,
            queuedJobId: activePlannedActivityJob?.id ?? null,
            status: plannedStatus,
          },
          providerHealth: {
            lastError: providerHealthLastError,
            status: providerHealthStatus,
          },
          configured,
          setupData: {
            lastError: setupLastError,
            lastFailedAt: setupState?.lastSyncFailedAt ?? null,
            lastSucceededAt: setupState?.lastSyncSucceededAt ?? null,
            status: setupStatus,
          },
          connected,
          integrationId: integration?.id ?? null,
          label,
          primaryAction: getPrimaryProviderAction({
            connected,
            configured,
            providerHealthStatus,
          }),
          provider: definition.id,
          summary,
        };
      }),
  );
}
