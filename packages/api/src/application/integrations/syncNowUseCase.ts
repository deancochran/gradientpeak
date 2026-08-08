import { providerHasCapability } from "@repo/core";
import { type DrizzleDbClient, schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../../db";
import {
  createIntegrationsRepositories,
  createWahooSyncRepository,
} from "../../infrastructure/repositories";
import { hasWahooPlannedActivityScopes } from "../../lib/integrations/wahoo/planned-activity-scopes";
import {
  enqueueWahooPlannedActivitySyncAfterCalendarMutation,
  type WahooPlannedActivityQueueResult,
} from "../../lib/provider-sync/planned-activities";
import type { WahooSyncRepository } from "../../repositories/wahoo-sync-repository";
import { WahooProfileSetupService } from "../wahoo-profile-setup-service";
import {
  admitWahooReconciliation,
  type WahooReconciliationAdmission,
} from "./wahoo-reconciliation-admission";

const wahooActivityHistoryJobType = "wahoo.activity_history_reconcile";

export async function enqueueWahooActivityHistoryReconcile(input: {
  admission: Extract<WahooReconciliationAdmission, { admitted: true }>;
  providerSyncRepository: WahooSyncRepository;
  transaction?: DrizzleTransactionClient;
}) {
  if (input.admission.target !== "activity_history") {
    throw new Error("Wahoo activity history requires an admitted history target");
  }

  const jobInput = {
    dedupeKey: `wahoo-history-reconcile:${input.admission.integrationId}:${input.admission.generation}`,
    integrationGeneration: input.admission.generation,
    integrationId: input.admission.integrationId,
    jobType: wahooActivityHistoryJobType,
    payload: { trigger: input.admission.trigger },
    profileId: input.admission.profileId,
    provider: "wahoo",
    resourceKind: "activity",
    runAt: new Date().toISOString(),
    syncLaneKey: `wahoo:${input.admission.integrationId}:activity-history`,
  } as const;
  const job = input.transaction
    ? await input.providerSyncRepository.enqueueJobInTransaction(input.transaction, jobInput)
    : await input.providerSyncRepository.enqueueJob(jobInput);

  return { jobId: job.id, queued: job.status === "queued" };
}

async function refreshProviderSetupForSyncNow(input: {
  profileId: string;
  provider: "wahoo";
  service: WahooProfileSetupService;
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
  provider: "wahoo";
}) {
  if (input.provider !== "wahoo") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Provider integration is disabled" });
  }
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
  const historyAdmission = admitWahooReconciliation({
    integration,
    scope: grant?.scope,
    target: "activity_history",
    trigger: "manual",
  });
  if (!historyAdmission.admitted) {
    throw new TRPCError({
      code: historyAdmission.reason === "runtime_disabled" ? "NOT_FOUND" : "FORBIDDEN",
      message:
        historyAdmission.reason === "missing_scope"
          ? "Reconnect this integration to grant the scopes required for history sync"
          : "Wahoo activity history sync is not available",
    });
  }

  const setupRefresh = await refreshProviderSetupForSyncNow({
    profileId: input.profileId,
    provider: input.provider,
    service: new WahooProfileSetupService({ db: input.db }),
  });
  const historySync = await enqueueWahooActivityHistoryReconcile({
    admission: historyAdmission,
    providerSyncRepository: createWahooSyncRepository({ db: input.db }),
  });

  let plannedActivitySync: WahooPlannedActivityQueueResult | null = null;
  if (input.provider === "wahoo") {
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
      plannedActivitySync = await enqueueWahooPlannedActivitySyncAfterCalendarMutation({
        db: input.db,
        eventIds: events.map((event) => event.id),
        operation: "publish",
        profileId: input.profileId,
      });
    }
  }
  return {
    ...historySync,
    setupRefresh,
    plannedActivitySync,
  };
}
