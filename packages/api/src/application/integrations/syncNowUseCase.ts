import { providerHasCapability } from "@repo/core";
import { type DrizzleDbClient, type PublicIntegrationProvider, schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
} from "../../infrastructure/repositories";
import {
  hasWahooPlannedActivityScopes,
  hasWahooRouteMirrorScopes,
} from "../../lib/integrations/wahoo/planned-activity-scopes";
import { logger } from "../../lib/logger";
import { enqueueWahooGroupEventRouteDeliveryReconcile } from "../../lib/provider-sync/event-delivery/wahoo-group-event-route-delivery";
import { enqueueWahooOwnedRouteReconcile } from "../../lib/provider-sync/owned-routes";
import {
  enqueuePlannedActivitySyncAfterCalendarMutation,
  type PlannedActivityQueueResult,
} from "../../lib/provider-sync/planned-activities";
import type { ProviderSyncRepository } from "../../repositories/provider-sync-repository";
import { OnboardingProviderEnrichmentService } from "../onboarding-provider-enrichment";
import { supportsActivityHistorySync } from "./syncOverviewUseCase";

const wahooActivityHistoryJobType = "wahoo.activity_history_reconcile";

function isProviderSyncPersistenceUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("provider_sync_jobs") ||
    message.includes("provider_sync_state") ||
    message.includes("Failed query")
  );
}

export async function enqueueActivityHistoryReconcile(input: {
  integrationId: string;
  profileId: string;
  provider: PublicIntegrationProvider;
  providerSyncRepository: ProviderSyncRepository;
  transaction?: DrizzleTransactionClient;
  trigger: "connect" | "manual";
}) {
  if (input.provider !== "wahoo" || !supportsActivityHistorySync(input.provider)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Activity history sync is not available for this provider",
    });
  }

  try {
    const jobInput = {
      dedupeKey: `provider-history-reconcile:${input.integrationId}:activity`,
      integrationId: input.integrationId,
      jobType: wahooActivityHistoryJobType,
      payload: { trigger: input.trigger, windowMonths: 12 },
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "activity",
      runAt: new Date().toISOString(),
    } as const;
    const job = input.transaction
      ? await input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
      : await input.providerSyncRepository.enqueueJob(jobInput);

    return { jobId: job.id, queued: job.status === "queued" };
  } catch (error) {
    if (input.transaction || !isProviderSyncPersistenceUnavailable(error)) throw error;

    logger.warn("Provider sync jobs are unavailable; skipping activity history enqueue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { jobId: null, queued: false };
  }
}

async function refreshProviderSetupForSyncNow(input: {
  profileId: string;
  provider: PublicIntegrationProvider;
  service: OnboardingProviderEnrichmentService;
}) {
  if (!providerHasCapability(input.provider, "profile_enrichment_read")) return null;

  const result = await input.service.refreshSetupData(input.profileId, input.provider);
  return {
    fieldsFilled: result.fieldsFilled,
    fieldsKept: result.fieldsKept,
    fieldsUpdated: result.fieldsUpdated,
    keptExistingValues: result.keptExistingValues,
    status: result.status,
  };
}

export async function syncIntegrationNow(input: {
  db: DrizzleDbClient;
  profileId: string;
  provider: PublicIntegrationProvider;
}) {
  const repositories = createIntegrationsRepositories(input.db);
  const integration = await repositories.integrations.findByProfileIdAndProvider({
    profileId: input.profileId,
    provider: input.provider,
  });

  if (!integration) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
  }

  const grant = await repositories.integrations.findGrantByProfileIdAndProvider({
    profileId: input.profileId,
    provider: input.provider,
  });
  const grantedScopes = new Set((grant?.scope ?? "").split(/[\s,]+/).filter(Boolean));
  if (
    input.provider === "wahoo" &&
    (!grantedScopes.has("workouts_read") || !grantedScopes.has("offline_data"))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Reconnect this integration to grant the scopes required for history sync",
    });
  }

  const setupRefresh = await refreshProviderSetupForSyncNow({
    profileId: input.profileId,
    provider: input.provider,
    service: new OnboardingProviderEnrichmentService({ db: input.db }),
  });
  const historySync = await enqueueActivityHistoryReconcile({
    integrationId: integration.id,
    profileId: input.profileId,
    provider: input.provider,
    providerSyncRepository: createProviderSyncRepository({ db: input.db }),
    trigger: "manual",
  });

  let plannedActivitySync: PlannedActivityQueueResult | null = null;
  let groupEventRouteDeliverySync: { jobId: string; queued: boolean } | null = null;
  let ownedRouteSync: { jobId: string; queued: boolean } | null = null;
  if (input.provider === "wahoo") {
    if (hasWahooRouteMirrorScopes(grant?.scope)) {
      ownedRouteSync = await enqueueWahooOwnedRouteReconcile({
        integrationGeneration: integration.generation,
        integrationId: integration.id,
        profileId: input.profileId,
        providerSyncRepository: createProviderSyncRepository({ db: input.db }),
        trigger: "manual",
      });
      groupEventRouteDeliverySync = await enqueueWahooGroupEventRouteDeliveryReconcile({
        integrationGeneration: integration.generation,
        integrationId: integration.id,
        profileId: input.profileId,
        providerSyncRepository: createProviderSyncRepository({ db: input.db }),
        trigger: "manual",
      });
    }
    if (!hasWahooPlannedActivityScopes(grant?.scope)) {
      plannedActivitySync = {
        affectedCount: 0,
        error: "Reconnect Wahoo to grant planned activity permissions",
        operation: "publish",
        queued: false,
        success: false,
      };
    } else {
      const windowStart = new Date();
      windowStart.setUTCHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);
      windowEnd.setUTCMilliseconds(windowEnd.getUTCMilliseconds() - 1);
      const events = await input.db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.profile_id, input.profileId),
            eq(schema.events.event_type, "planned"),
            eq(schema.events.status, "scheduled"),
            isNotNull(schema.events.activity_plan_id),
            gte(schema.events.starts_at, windowStart),
            lte(schema.events.starts_at, windowEnd),
          ),
        )
        .orderBy(asc(schema.events.starts_at), asc(schema.events.id))
        .limit(100);
      plannedActivitySync = await enqueuePlannedActivitySyncAfterCalendarMutation({
        db: input.db,
        eventIds: events.map((event) => event.id),
        operation: "publish",
        profileId: input.profileId,
      });
    }
  }
  return {
    ...historySync,
    groupEventRouteDeliverySync,
    ownedRouteSync,
    setupRefresh,
    plannedActivitySync,
  };
}
