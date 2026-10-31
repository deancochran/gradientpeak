import { getConfigurableProviderActions, providerManifestRegistry } from "@repo/core";
import {
  activitySourceReferences,
  type DrizzleDbClient,
  publicIntegrationsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { createIntegrationsRepositories } from "../../infrastructure/repositories";
import { unsupportedProviderOverviewEvidence } from "./provider-runtime";
import { getProviderOverviewRuntime } from "./provider-runtime-registry";

function parseBoundaryValue<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause: parsed.error });
  }
  return parsed.data;
}

function summary(input: {
  activityStatus: string;
  connected: boolean;
  configured: boolean;
  label: string;
  plannedStatus: string;
  providerHealthStatus: string;
  setupStatus: string;
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
    [input.activityStatus, input.plannedStatus, input.setupStatus].includes("failed") ||
    input.plannedStatus === "recovery_required"
  ) {
    return {
      badge: "Issue",
      health: "failed" as const,
      subtitle:
        input.plannedStatus === "recovery_required" ? "Recovery required" : "Needs attention",
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
    return { badge: "Queued", health: "queued" as const, subtitle: "Waiting", title: input.label };
  }
  if (["unsupported", "unsupported_projection"].includes(input.plannedStatus)) {
    return {
      badge: "Limited",
      health: "connected" as const,
      subtitle:
        input.plannedStatus === "unsupported_projection"
          ? "Some planned activities are unsupported"
          : "Planned activities unavailable",
      title: input.label,
    };
  }
  return { badge: "Auto", health: "connected" as const, subtitle: "Connected", title: input.label };
}

export async function getProviderSyncOverview(input: { db: DrizzleDbClient; profileId: string }) {
  const repositories = createIntegrationsRepositories(input.db);
  const integrations = parseBoundaryValue(
    z.array(publicIntegrationsRowSchema),
    await repositories.integrations.listByProfileId(input.profileId),
    "Integrations repository returned invalid rows",
  );
  const integrationsByProvider = new Map(integrations.map((item) => [item.provider, item]));
  const reviews = await input.db
    .select({ provider: activitySourceReferences.provider, total: count() })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, input.profileId),
        eq(activitySourceReferences.resolution_status, "review"),
      ),
    )
    .groupBy(activitySourceReferences.provider);
  const unresolvedReviewCountByProvider = new Map(
    reviews.map((review) => [review.provider, Number(review.total)]),
  );

  return Promise.all(
    providerManifestRegistry.map(async (definition) => {
      const runtime = getProviderOverviewRuntime(definition.connectorId);
      const configured = runtime?.availability.isConfigured() ?? false;
      const lifecycle = integrationsByProvider.get(definition.connectorId);
      const disconnecting = lifecycle?.lifecycle_status === "disconnect_pending";
      const retryDisconnect = disconnecting && definition.connectorId === "garmin";
      const integration = lifecycle?.lifecycle_status === "active" ? lifecycle : undefined;
      const grant = integration
        ? await repositories.integrations.findGrantByProfileIdAndProvider({
            profileId: input.profileId,
            provider: definition.connectorId,
          })
        : null;
      const evidence = runtime
        ? await runtime.overview.readOverviewEvidence(
            integration
              ? {
                  db: input.db,
                  profileId: input.profileId,
                  integration: {
                    id: integration.id,
                    generation: integration.generation,
                    lifecycleStatus: "active",
                  },
                  scope: grant?.scope ?? null,
                }
              : { db: input.db, profileId: input.profileId, integration: null, scope: null },
          )
        : unsupportedProviderOverviewEvidence;
      const connected = Boolean(integration);
      const providerHealthStatus = disconnecting
        ? ("disconnecting" as const)
        : !connected
          ? ("disconnected" as const)
          : grant?.reconnect_required_at
            ? ("needs_reconnect" as const)
            : ("connected" as const);
      const actions =
        runtime && configured && connected && providerHealthStatus === "connected"
          ? getConfigurableProviderActions(definition.connectorId).filter((action) =>
              runtime.actionAuthorization.allowsAction({ action, grantedScope: grant?.scope }),
            )
          : connected || retryDisconnect
            ? (["disconnect"] as const)
            : [];
      const compact = summary({
        activityStatus: evidence.activityHistory.status,
        connected,
        configured,
        label: definition.label,
        plannedStatus: evidence.plannedActivities.status,
        providerHealthStatus,
        setupStatus: evidence.setupData.status,
      });
      return {
        actions,
        ...evidence,
        providerHealth: {
          lastError:
            evidence.activityHistory.lastError ??
            evidence.setupData.lastError ??
            evidence.plannedActivities.lastError,
          status: providerHealthStatus,
        },
        configured,
        onboarding: definition.onboarding,
        connected,
        integrationId: integration?.id ?? null,
        label: definition.label,
        primaryAction:
          providerHealthStatus === "disconnecting"
            ? retryDisconnect
              ? ("disconnect" as const)
              : null
            : !configured
              ? connected
                ? ("disconnect" as const)
                : null
              : !connected
                ? ("connect" as const)
                : providerHealthStatus === "needs_reconnect"
                  ? ("reconnect" as const)
                  : ("disconnect" as const),
        provider: definition.connectorId,
        unresolvedReviewCount: unresolvedReviewCountByProvider.get(definition.connectorId) ?? 0,
        summary: compact,
      };
    }),
  );
}
