import { publicProviderSyncJobsRowSchema, schema } from "@repo/db";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { isWahooIntegrationEnabled } from "../../lib/integrations/oauth-config";
import { decryptProviderToken } from "../../lib/provider-token-crypto";
import { lockOnboardingProfile } from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";
import type {
  CreateWahooSyncRepositoryOptions,
  WahooSyncJobRecord,
  WahooSyncRepository,
} from "../../repositories/wahoo-sync-repository";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const sqlRowsResultSchema = z.object({ rows: z.array(z.unknown()) }).passthrough();

const queueTelemetryRowSchema = z
  .object({
    deadLetterDepth: z.coerce.number().finite().int().nonnegative(),
    oldestDueAt: z.coerce.date().nullable(),
    queueDepth: z.coerce.number().finite().int().nonnegative(),
  })
  .strict();

const requiredQueueSequenceSchema = z.preprocess(
  (value) =>
    typeof value === "number" || (typeof value === "string" && value.trim().length > 0)
      ? value
      : undefined,
  z.coerce.number().finite().int().nonnegative(),
);
const requiredRunAtSchema = z.preprocess(
  (value) =>
    value instanceof Date || (typeof value === "string" && value.trim().length > 0)
      ? value
      : undefined,
  z.coerce.date(),
);

const claimedWahooSyncJobRowSchema = publicProviderSyncJobsRowSchema
  .pick({
    attempt: true,
    dedupe_key: true,
    id: true,
    import_run_id: true,
    integration_generation: true,
    integration_id: true,
    internal_resource_id: true,
    job_type: true,
    last_error: true,
    max_attempts: true,
    operation: true,
    payload: true,
    payload_hash: true,
    profile_id: true,
    provider: true,
    queue_sequence: true,
    resource_kind: true,
    run_at: true,
    status: true,
    supersedes_job_id: true,
    sync_lane_key: true,
  })
  .extend({
    provider: z.literal("wahoo"),
    queue_sequence: requiredQueueSequenceSchema,
    run_at: requiredRunAtSchema,
    stale_lock_recovered: z.boolean(),
  })
  .strict();

const claimCandidateJob = alias(schema.providerSyncJobs, "candidate_provider_sync_jobs");
const earlierLaneJob = alias(schema.providerSyncJobs, "earlier_provider_sync_jobs");
const runningLaneJob = alias(schema.providerSyncJobs, "running_provider_sync_jobs");

export class OnboardingProviderWorkConflictError extends Error {
  constructor() {
    super("Existing provider work must finish before onboarding processing can start");
    this.name = OnboardingProviderWorkConflictError.name;
  }
}

function getJobTrigger(payload: unknown): unknown {
  return payload && typeof payload === "object" && !Array.isArray(payload) && "trigger" in payload
    ? payload.trigger
    : undefined;
}

function canOnboardingReplaceQueuedConnectJob(
  job: Parameters<typeof onboardingJobIdentityMatches>[0],
  input: Parameters<typeof onboardingJobIdentityMatches>[1],
  integrationGeneration: number,
) {
  return (
    job.status === "queued" &&
    job.trigger === "connect" &&
    getJobTrigger(input.payload) === "onboarding" &&
    job.profileId === input.profileId &&
    job.provider === input.provider &&
    job.integrationId === input.integrationId &&
    job.integrationGeneration === integrationGeneration &&
    job.jobType === input.jobType &&
    job.operation === (input.operation ?? null) &&
    job.resourceKind === (input.resourceKind ?? null) &&
    job.internalResourceId === (input.internalResourceId ?? null)
  );
}

export function onboardingJobIdentityMatches(
  job: {
    integrationGeneration: number;
    integrationId: string;
    internalResourceId: string | null;
    jobType: string;
    operation: string | null;
    payloadHash: string | null;
    payloadMatches: boolean;
    profileId: string;
    provider: string;
    resourceKind: WahooSyncJobRecord["resourceKind"];
    status: string;
    trigger: unknown;
  },
  input: Parameters<WahooSyncRepository["enqueueJobInTransaction"]>[1],
  integrationGeneration: number,
) {
  return (
    job.profileId === input.profileId &&
    job.provider === input.provider &&
    job.integrationId === input.integrationId &&
    job.integrationGeneration === integrationGeneration &&
    job.jobType === input.jobType &&
    job.operation === (input.operation ?? null) &&
    job.resourceKind === (input.resourceKind ?? null) &&
    job.internalResourceId === (input.internalResourceId ?? null) &&
    job.payloadHash === (input.payloadHash ?? null) &&
    job.payloadMatches
  );
}

export function assertOnboardingJobOwnership(
  job: Parameters<typeof onboardingJobIdentityMatches>[0],
  input: Parameters<typeof onboardingJobIdentityMatches>[1],
  integrationGeneration: number,
) {
  if (
    getJobTrigger(input.payload) === "onboarding" &&
    !onboardingJobIdentityMatches(job, input, integrationGeneration) &&
    !canOnboardingReplaceQueuedConnectJob(job, input, integrationGeneration)
  ) {
    throw new OnboardingProviderWorkConflictError();
  }
}

/** Only durable, provider-neutral failure categories may cross the job/state boundary. */
function toBoundedWahooSyncError(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "activity_history_failed") return "activity_history_failed";
  if (normalized === "activity_import_failed") return "activity_import_failed";
  if (normalized === "activity_analysis_initial_segments_invalid")
    return "activity_analysis_initial_segments_invalid";
  if (normalized === "activity_analysis_failed") return "activity_analysis_failed";
  if (normalized === "activity_analysis_persisted_segments_invalid")
    return "activity_analysis_persisted_segments_invalid";
  if (normalized === "activity_analysis_segments_invalid")
    return "activity_analysis_segments_invalid";
  if (normalized === "activity_artifact_lifecycle_pending")
    return "activity_artifact_lifecycle_pending";
  if (normalized === "activity_artifact_persistence_failed")
    return "activity_artifact_persistence_failed";
  if (normalized === "activity_athlete_state_evidence_invalid")
    return "activity_athlete_state_evidence_invalid";
  if (normalized === "activity_calibration_evidence_invalid")
    return "activity_calibration_evidence_invalid";
  if (normalized === "activity_effort_segment_mismatch") return "activity_effort_segment_mismatch";
  if (normalized === "activity_effort_reconciliation_invalid")
    return "activity_effort_reconciliation_invalid";
  if (normalized === "activity_ingestion_conflict") return "activity_ingestion_conflict";
  if (normalized === "activity_ingestion_persistence_failed")
    return "activity_ingestion_persistence_failed";
  if (normalized === "activity_material_evidence_marker_failed")
    return "activity_material_evidence_marker_failed";
  if (normalized === "activity_parent_persistence_failed")
    return "activity_parent_persistence_failed";
  if (normalized === "activity_laps_invalid") return "activity_laps_invalid";
  if (normalized === "activity_performance_snapshot_invalid")
    return "activity_performance_snapshot_invalid";
  if (normalized === "activity_persistence_invariant_failed")
    return "activity_persistence_invariant_failed";
  if (normalized === "activity_segments_invalid") return "activity_segments_invalid";
  if (normalized === "activity_segment_persistence_failed")
    return "activity_segment_persistence_failed";
  if (normalized === "activity_source_reference_failed") return "activity_source_reference_failed";
  if (normalized === "activity_validation_failed") return "activity_validation_failed";
  if (normalized === "activity_persistence_failed") return "activity_persistence_failed";
  if (normalized === "unsupported_persisted_version") return "unsupported_persisted_version";
  if (
    normalized === "invalid wahoo activity history job payload" ||
    normalized === "invalid wahoo job payload"
  )
    return "invalid_job_payload";
  if (normalized === "integration_generation_inactive") return "integration_generation_inactive";
  if (normalized === "integration_inactive_at_receipt") return "integration_inactive_at_receipt";
  if (normalized === "invalid_webhook_payload") return "invalid_webhook_payload";
  if (normalized === "webhook_receipt_missing") return "webhook_receipt_missing";
  if (normalized === "webhook_import_failed") return "webhook_import_failed";
  if (normalized === "disconnect_attempt_uncertain") return "disconnect_attempt_uncertain";
  if (normalized === "disconnect_response_uncertain") return "disconnect_response_uncertain";
  if (normalized === "disconnect_failed") return "disconnect_failed";
  if (normalized === "invalid_wahoo_staging_cleanup_payload")
    return "invalid_wahoo_staging_cleanup_payload";
  if (normalized === "wahoo_staging_cleanup_failed") return "wahoo_staging_cleanup_failed";
  if (normalized === "wahoo_staging_cleanup_uncertain") return "wahoo_staging_cleanup_uncertain";
  if (normalized === "wahoo_profile_enrichment_failed") return "wahoo_profile_enrichment_failed";
  if (normalized === "invalid_wahoo_profile_enrichment_payload")
    return "invalid_wahoo_profile_enrichment_payload";
  return "provider_sync_failed";
}

type ClaimedWahooSyncJobRow = z.output<typeof claimedWahooSyncJobRowSchema>;

function toWahooSyncJobStatus(status: string): WahooSyncJobRecord["status"] {
  if (
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "dead_lettered"
  ) {
    return status;
  }
  throw new Error(`Invalid provider sync job status: ${status}`);
}

function mapClaimedWahooSyncJobRow(row: ClaimedWahooSyncJobRow): WahooSyncJobRecord {
  return {
    attempt: row.attempt,
    dedupeKey: row.dedupe_key,
    id: row.id,
    importRunId: row.import_run_id,
    integrationGeneration: row.integration_generation,
    integrationId: row.integration_id,
    internalResourceId: row.internal_resource_id,
    jobType: row.job_type,
    lastError: row.last_error,
    maxAttempts: row.max_attempts,
    operation: row.operation,
    payload: row.payload,
    payloadHash: row.payload_hash,
    profileId: row.profile_id,
    provider: "wahoo",
    queueSequence: row.queue_sequence,
    resourceKind: row.resource_kind,
    runAt: row.run_at.toISOString(),
    staleLockRecovered: row.stale_lock_recovered,
    status: toWahooSyncJobStatus(row.status),
    supersedesJobId: row.supersedes_job_id,
    syncLaneKey: row.sync_lane_key,
  };
}

export function parseQueueTelemetryRow(row: unknown) {
  const parsed = queueTelemetryRowSchema.parse(row);
  return {
    deadLetterDepth: parsed.deadLetterDepth,
    oldestDueAt: parsed.oldestDueAt?.toISOString() ?? null,
    queueDepth: parsed.queueDepth,
  };
}

export function parseClaimedWahooSyncJobRows(rows: unknown): WahooSyncJobRecord[] {
  return claimedWahooSyncJobRowSchema.array().parse(rows).map(mapClaimedWahooSyncJobRow);
}

function mapWahooSyncJobRow(row: {
  attempt: number;
  dedupeKey: string | null;
  id: string;
  integrationGeneration: number;
  integrationId: string;
  internalResourceId: string | null;
  jobType: string;
  lastError: string | null;
  maxAttempts: number;
  operation: string | null;
  payload: unknown;
  payloadHash: string | null;
  profileId: string;
  provider: string;
  queueSequence: number;
  resourceKind: WahooSyncJobRecord["resourceKind"];
  runAt: Date;
  status: string;
  supersedesJobId: string | null;
  syncLaneKey: string | null;
  updatedAt: Date;
}): WahooSyncJobRecord {
  if (row.provider !== "wahoo") throw new Error("Expected a Wahoo provider sync job");
  return {
    ...row,
    provider: "wahoo",
    runAt: row.runAt.toISOString(),
    status: toWahooSyncJobStatus(row.status),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createWahooSyncRepository({
  db,
}: CreateWahooSyncRepositoryOptions): WahooSyncRepository {
  const repository: Omit<
    WahooSyncRepository,
    "beginProviderDisconnectAttempt" | "finalizeProviderDisconnect" | "requestProviderDisconnect"
  > = {
    async bindJobImportRun({ expectedIntegrationGeneration, id, importRunId, payload, workerId }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({ import_run_id: importRunId, payload, updated_at: new Date() })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            eq(schema.providerSyncJobs.integration_generation, expectedIntegrationGeneration),
            isNull(schema.providerSyncJobs.import_run_id),
            sql`${schema.providerSyncJobs.payload}->>'importRunId' is null`,
            sql`exists (
              select 1 from activity_import_runs run
              where run.id = ${importRunId}::uuid
                and run.profile_id = ${schema.providerSyncJobs.profile_id}
                and run.integration_id = ${schema.providerSyncJobs.integration_id}
                and run.integration_generation = ${schema.providerSyncJobs.integration_generation}
            )`,
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },
    async failJobWithSyncState({
      expectedIntegrationGeneration,
      id,
      integrationId,
      lastError,
      nextRunAt,
      provider,
      resource,
      status,
      workerId,
    }) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const boundedError = toBoundedWahooSyncError(lastError);
        const [updated] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: boundedError,
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            run_at: nextRunAt ? new Date(nextRunAt) : undefined,
            status,
            updated_at: now,
          })
          .where(
            and(
              eq(schema.providerSyncJobs.id, id),
              eq(schema.providerSyncJobs.integration_id, integrationId),
              eq(schema.providerSyncJobs.integration_generation, expectedIntegrationGeneration),
              eq(schema.providerSyncJobs.provider, provider),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
              sql`exists (
                select 1 from integrations where integrations.id = ${schema.providerSyncJobs.integration_id}
                  and integrations.lifecycle_status = 'active'
                  and integrations.generation = ${expectedIntegrationGeneration}
              )`,
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (!updated) return false;

        await tx
          .insert(schema.providerSyncState)
          .values({
            integration_id: integrationId,
            provider,
            resource,
            sync_mode: "push_windowed",
            next_sync_at: nextRunAt ? new Date(nextRunAt) : null,
            last_error: boundedError,
            consecutive_failures: 1,
            last_sync_failed_at: now,
          })
          .onConflictDoUpdate({
            target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
            set: {
              consecutive_failures: sql`${schema.providerSyncState.consecutive_failures} + 1`,
              last_error: boundedError,
              last_sync_failed_at: now,
              next_sync_at: nextRunAt ? new Date(nextRunAt) : schema.providerSyncState.next_sync_at,
              updated_at: now,
            },
          });
        return true;
      });
    },

    async completeJobWithSyncState({
      highWatermark,
      expectedIntegrationGeneration,
      id,
      integrationId,
      importRunId,
      metadata,
      provider,
      resource,
      workerId,
    }) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [updated] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: null,
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            status: "completed",
            updated_at: now,
          })
          .where(
            and(
              eq(schema.providerSyncJobs.id, id),
              eq(schema.providerSyncJobs.integration_id, integrationId),
              eq(schema.providerSyncJobs.provider, provider),
              importRunId === undefined
                ? undefined
                : and(
                    eq(schema.providerSyncJobs.import_run_id, importRunId),
                    sql`${schema.providerSyncJobs.payload}->>'importRunId' = ${importRunId}`,
                    sql`exists (
                      select 1 from activity_import_runs run
                      where run.id = ${importRunId}::uuid
                        and run.profile_id = ${schema.providerSyncJobs.profile_id}
                        and run.integration_id = ${schema.providerSyncJobs.integration_id}
                        and run.integration_generation = ${schema.providerSyncJobs.integration_generation}
                    )`,
                  ),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
              expectedIntegrationGeneration === undefined
                ? undefined
                : sql`exists (
                select 1 from integrations where integrations.id = ${schema.providerSyncJobs.integration_id}
                  and integrations.lifecycle_status = 'active'
                  and integrations.generation = ${expectedIntegrationGeneration}
              )`,
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (!updated) return false;
        await tx
          .insert(schema.providerSyncState)
          .values({
            integration_id: integrationId,
            provider,
            resource,
            sync_mode: "push_windowed",
            high_watermark: new Date(highWatermark),
            metadata,
            consecutive_failures: 0,
            last_sync_started_at: now,
            last_sync_succeeded_at: now,
          })
          .onConflictDoUpdate({
            target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
            set: {
              consecutive_failures: 0,
              // A successful narrower replay must never move the observed source
              // boundary backwards. Exact interval truth remains in metadata.
              high_watermark: sql`greatest(${schema.providerSyncState.high_watermark}, ${new Date(highWatermark)})`,
              last_error: null,
              last_sync_started_at: now,
              last_sync_succeeded_at: now,
              metadata: sql`${schema.providerSyncState.metadata} || ${JSON.stringify(metadata)}::jsonb`,
              updated_at: now,
            },
          });
        return true;
      });
    },

    async updateRunningJobDesiredState({
      expectedIntegrationGeneration,
      id,
      integrationId,
      payload,
      payloadHash,
      profileId,
      provider,
      workerId,
    }) {
      const now = new Date();
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          payload,
          payload_hash: payloadHash,
          updated_at: now,
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.integration_id, integrationId),
            eq(schema.providerSyncJobs.integration_generation, expectedIntegrationGeneration),
            eq(schema.providerSyncJobs.profile_id, profileId),
            eq(schema.providerSyncJobs.provider, provider),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, now),
            sql`exists (
              select 1 from integrations where integrations.id = ${schema.providerSyncJobs.integration_id}
                and integrations.profile_id = ${profileId}
                and integrations.provider = ${provider}
                and integrations.lifecycle_status = 'active'
                and integrations.generation = ${expectedIntegrationGeneration}
            )`,
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return updated !== undefined;
    },

    async getQueueTelemetry({ jobTypes, now, provider }) {
      const at = new Date(now);
      const due = and(
        inArray(schema.providerSyncJobs.status, ["queued", "failed", "running"]),
        lte(schema.providerSyncJobs.run_at, at),
        or(
          isNull(schema.providerSyncJobs.lock_expires_at),
          lte(schema.providerSyncJobs.lock_expires_at, at),
        ),
      );
      const [row] = await db
        .select({
          deadLetterDepth: sql<number>`count(*) filter (where ${eq(schema.providerSyncJobs.status, "dead_lettered")})`,
          oldestDueAt: sql<Date | null>`min(${schema.providerSyncJobs.run_at}) filter (where ${due})`,
          queueDepth: sql<number>`count(*) filter (where ${due})`,
        })
        .from(schema.providerSyncJobs)
        .where(
          and(
            provider ? eq(schema.providerSyncJobs.provider, provider) : undefined,
            jobTypes?.length ? inArray(schema.providerSyncJobs.job_type, jobTypes) : undefined,
          ),
        );
      return parseQueueTelemetryRow(
        row ?? {
          deadLetterDepth: 0,
          oldestDueAt: null,
          queueDepth: 0,
        },
      );
    },
    async enqueueJob(input) {
      if (!isWahooIntegrationEnabled()) throw new Error("Provider integration is disabled");
      return db.transaction((tx) => this.enqueueJobInTransaction(tx, input));
    },

    async enqueueJobInTransaction(tx, input) {
      if (!isWahooIntegrationEnabled()) throw new Error("Provider integration is disabled");
      return (async () => {
        const lockIdentities = [
          input.syncLaneKey ? JSON.stringify(["provider-sync", "lane", input.syncLaneKey]) : null,
          input.dedupeKey ? JSON.stringify(["provider-sync", "dedupe", input.dedupeKey]) : null,
        ]
          .filter((identity): identity is string => identity !== null)
          .sort();

        for (const identity of lockIdentities) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity}, 0))`);
        }

        const [integration] = await tx
          .select({
            generation: schema.integrations.generation,
            lifecycleStatus: schema.integrations.lifecycle_status,
          })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.id, input.integrationId),
              eq(schema.integrations.profile_id, input.profileId),
              eq(schema.integrations.provider, input.provider),
            ),
          )
          .limit(1)
          .for("update");
        if (!integration) throw new Error("Provider sync integration was not found");
        if (integration.lifecycleStatus !== "active" && input.jobType !== "wahoo.disconnect") {
          throw new Error("Provider sync integration is not active");
        }
        const integrationGeneration = input.integrationGeneration ?? integration.generation;
        const desiredQueuedValues = {
          dedupe_key: input.dedupeKey ?? null,
          integration_id: input.integrationId,
          integration_generation: integrationGeneration,
          import_run_id: input.importRunId ?? null,
          internal_resource_id: input.internalResourceId ?? null,
          job_type: input.jobType,
          max_attempts: input.maxAttempts ?? 8,
          operation: input.operation ?? null,
          payload: input.payload,
          payload_hash: input.payloadHash ?? null,
          priority: input.priority ?? 100,
          profile_id: input.profileId,
          provider: input.provider,
          resource_kind: input.resourceKind ?? null,
          run_at: new Date(input.runAt),
          supersedes_job_id: input.supersedesJobId ?? null,
          sync_lane_key: input.syncLaneKey ?? null,
          updated_at: new Date(),
        };

        let shouldCheckDedupe = !input.syncLaneKey;
        if (input.syncLaneKey) {
          const activeLaneJobs = await tx
            .select({
              id: schema.providerSyncJobs.id,
              internalResourceId: schema.providerSyncJobs.internal_resource_id,
              jobType: schema.providerSyncJobs.job_type,
              operation: schema.providerSyncJobs.operation,
              payloadHash: schema.providerSyncJobs.payload_hash,
              payloadMatches: sql<boolean>`${schema.providerSyncJobs.payload} = ${JSON.stringify(input.payload)}::jsonb`,
              trigger: sql<unknown>`${schema.providerSyncJobs.payload}->>'trigger'`,
              profileId: schema.providerSyncJobs.profile_id,
              provider: schema.providerSyncJobs.provider,
              integrationId: schema.providerSyncJobs.integration_id,
              integrationGeneration: schema.providerSyncJobs.integration_generation,
              resourceKind: schema.providerSyncJobs.resource_kind,
              status: schema.providerSyncJobs.status,
            })
            .from(schema.providerSyncJobs)
            .where(
              and(
                eq(schema.providerSyncJobs.sync_lane_key, input.syncLaneKey),
                or(
                  eq(schema.providerSyncJobs.status, "queued"),
                  eq(schema.providerSyncJobs.status, "running"),
                ),
              ),
            )
            .orderBy(asc(schema.providerSyncJobs.queue_sequence))
            .for("update");
          const queuedJobs = activeLaneJobs.filter((job) => job.status === "queued");
          const coalescibleQueuedJobs = queuedJobs.filter(
            (job) =>
              job.internalResourceId === (input.internalResourceId ?? null) &&
              job.resourceKind === (input.resourceKind ?? null),
          );
          if (getJobTrigger(input.payload) === "onboarding") {
            for (const activeJob of activeLaneJobs) {
              assertOnboardingJobOwnership(activeJob, input, integrationGeneration);
            }
          }
          const queuedJob = coalescibleQueuedJobs[0];
          if (queuedJob) {
            assertOnboardingJobOwnership(queuedJob, input, integrationGeneration);
            await tx
              .update(schema.providerSyncJobs)
              .set(desiredQueuedValues)
              .where(eq(schema.providerSyncJobs.id, queuedJob.id));

            const redundantQueuedJobIds = coalescibleQueuedJobs.slice(1).map((job) => job.id);
            if (redundantQueuedJobIds.length > 0) {
              await tx
                .delete(schema.providerSyncJobs)
                .where(inArray(schema.providerSyncJobs.id, redundantQueuedJobIds));
            }

            return { id: queuedJob.id, status: "queued" };
          }

          const runningJob = activeLaneJobs.find((job) => job.status === "running");
          if (runningJob) assertOnboardingJobOwnership(runningJob, input, integrationGeneration);
          if (
            runningJob &&
            runningJob.jobType === input.jobType &&
            runningJob.operation === (input.operation ?? null) &&
            runningJob.payloadHash === (input.payloadHash ?? null) &&
            runningJob.payloadMatches
          ) {
            return { id: runningJob.id, status: "running" };
          }

          shouldCheckDedupe = !runningJob;
        }

        if (shouldCheckDedupe && input.dedupeKey) {
          const [existing] = await tx
            .select({
              id: schema.providerSyncJobs.id,
              status: schema.providerSyncJobs.status,
              jobType: schema.providerSyncJobs.job_type,
              operation: schema.providerSyncJobs.operation,
              payloadHash: schema.providerSyncJobs.payload_hash,
              payloadMatches: sql<boolean>`${schema.providerSyncJobs.payload} = ${JSON.stringify(input.payload)}::jsonb`,
              trigger: sql<unknown>`${schema.providerSyncJobs.payload}->>'trigger'`,
              profileId: schema.providerSyncJobs.profile_id,
              provider: schema.providerSyncJobs.provider,
              integrationId: schema.providerSyncJobs.integration_id,
              integrationGeneration: schema.providerSyncJobs.integration_generation,
              internalResourceId: schema.providerSyncJobs.internal_resource_id,
              resourceKind: schema.providerSyncJobs.resource_kind,
            })
            .from(schema.providerSyncJobs)
            .where(
              and(
                eq(schema.providerSyncJobs.dedupe_key, input.dedupeKey),
                or(
                  eq(schema.providerSyncJobs.status, "queued"),
                  eq(schema.providerSyncJobs.status, "running"),
                ),
              ),
            )
            .limit(1)
            .for("update");

          if (existing) {
            assertOnboardingJobOwnership(existing, input, integrationGeneration);
            if (existing.status === "queued") {
              await tx
                .update(schema.providerSyncJobs)
                .set(desiredQueuedValues)
                .where(eq(schema.providerSyncJobs.id, existing.id));
            }

            return {
              id: existing.id,
              status: toWahooSyncJobStatus(existing.status),
            };
          }
        }

        const [created] = await tx
          .insert(schema.providerSyncJobs)
          .values({ ...desiredQueuedValues, status: "queued" })
          .returning({ id: schema.providerSyncJobs.id, status: schema.providerSyncJobs.status });

        if (!created) {
          throw new Error("Failed to enqueue provider sync job");
        }

        return {
          id: created.id,
          status: toWahooSyncJobStatus(created.status),
        };
      })();
    },

    async claimDueJobs({ jobTypes, limit, now, workerId, lockExpiresAt, profileId }) {
      if (!isWahooIntegrationEnabled()) return [];
      return db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          with candidate_rows as (
            select
              ${claimCandidateJob.id} as id,
              ${claimCandidateJob.queue_sequence} as queue_sequence,
              ${claimCandidateJob.status} as status,
              ${claimCandidateJob.sync_lane_key} as sync_lane_key
            from ${schema.providerSyncJobs} as ${sql.identifier("candidate_provider_sync_jobs")}
            where ${eq(claimCandidateJob.provider, "wahoo")}
              and ${profileId ? eq(claimCandidateJob.profile_id, profileId) : sql`true`}
              and ${jobTypes?.length ? inArray(claimCandidateJob.job_type, jobTypes) : sql`true`}
              and ${inArray(claimCandidateJob.status, ["queued", "failed", "running"])}
              and ${lte(claimCandidateJob.run_at, new Date(now))}
              and (
                ${isNull(claimCandidateJob.lock_expires_at)}
                or ${lte(claimCandidateJob.lock_expires_at, new Date(now))}
              )
              and (
                ${isNull(claimCandidateJob.sync_lane_key)}
                or not exists (
                  select 1
                  from ${schema.providerSyncJobs} as ${sql.identifier("earlier_provider_sync_jobs")}
                  where ${eq(earlierLaneJob.sync_lane_key, claimCandidateJob.sync_lane_key)}
                    and ${inArray(earlierLaneJob.status, ["queued", "failed", "running"])}
                    and ${sql`${earlierLaneJob.queue_sequence} < ${claimCandidateJob.queue_sequence}`}
                )
              )
              and (
                ${isNull(claimCandidateJob.sync_lane_key)}
                or not exists (
                  select 1
                  from ${schema.providerSyncJobs} as ${sql.identifier("running_provider_sync_jobs")}
                  where ${eq(runningLaneJob.sync_lane_key, claimCandidateJob.sync_lane_key)}
                    and ${eq(runningLaneJob.status, "running")}
                    and ${gt(runningLaneJob.lock_expires_at, new Date(now))}
                )
              )
            order by ${asc(claimCandidateJob.priority)}, ${asc(claimCandidateJob.run_at)}
            limit ${Math.max(limit * 4, limit)}
            for update skip locked
          ), ranked_rows as (
            select
              candidate_rows.id,
              candidate_rows.queue_sequence,
              candidate_rows.status,
              row_number() over (
                partition by coalesce(candidate_rows.sync_lane_key, candidate_rows.id::text)
                order by candidate_rows.queue_sequence asc
              ) as lane_rank
            from candidate_rows
          ), selected_rows as (
            select id, queue_sequence, status = 'running' as stale_lock_recovered
            from ranked_rows
            where lane_rank = 1
            limit ${limit}
          )
          update ${schema.providerSyncJobs}
          set
            attempt = ${schema.providerSyncJobs.attempt} + 1,
            lock_expires_at = ${new Date(lockExpiresAt)},
            locked_at = ${new Date(now)},
            locked_by = ${workerId},
            status = 'running',
            updated_at = ${new Date(now)}
          from selected_rows
          where ${schema.providerSyncJobs.id} = selected_rows.id
          returning
            ${schema.providerSyncJobs.attempt},
            ${schema.providerSyncJobs.dedupe_key},
            ${schema.providerSyncJobs.id},
            ${schema.providerSyncJobs.integration_id},
            ${schema.providerSyncJobs.integration_generation},
            ${schema.providerSyncJobs.import_run_id},
            ${schema.providerSyncJobs.internal_resource_id},
            ${schema.providerSyncJobs.job_type},
            ${schema.providerSyncJobs.last_error},
            ${schema.providerSyncJobs.max_attempts},
            ${schema.providerSyncJobs.operation},
            ${schema.providerSyncJobs.payload},
            ${schema.providerSyncJobs.payload_hash},
            ${schema.providerSyncJobs.profile_id},
            ${schema.providerSyncJobs.provider},
            selected_rows.queue_sequence,
            ${schema.providerSyncJobs.resource_kind},
            ${schema.providerSyncJobs.run_at},
            selected_rows.stale_lock_recovered,
            ${schema.providerSyncJobs.status},
            ${schema.providerSyncJobs.supersedes_job_id},
            ${schema.providerSyncJobs.sync_lane_key}
        `);

        return parseClaimedWahooSyncJobRows(sqlRowsResultSchema.parse(result).rows);
      });
    },

    async isIntegrationGenerationActive({ generation, integrationId, profileId }) {
      const [row] = await db
        .select({ id: schema.integrations.id })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.profile_id, profileId),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, generation),
          ),
        )
        .limit(1);
      return Boolean(row);
    },

    async requestWahooDisconnect({ profileId }) {
      return db.transaction(async (tx) => {
        await lockProfileAdvisoryFence(tx, profileId);
        const profile = await lockOnboardingProfile(tx, profileId);
        if (profile.onboarding_status === "processing" || profile.onboarding_status === "review") {
          throw new Error("Integration changes are unavailable during onboarding processing");
        }
        const now = new Date();
        const [integration] = await tx
          .select()
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, "wahoo"),
            ),
          )
          .limit(1)
          .for("update");
        if (!integration)
          return {
            generation: null,
            integrationId: null,
            jobId: null,
            status: "not_found" as const,
          };
        if (integration.lifecycle_status === "disconnected") {
          return {
            generation: integration.generation,
            integrationId: integration.id,
            jobId: null,
            status: "disconnected" as const,
          };
        }
        if (!isWahooIntegrationEnabled()) {
          const generation =
            integration.lifecycle_status === "active"
              ? integration.generation + 1
              : integration.generation;
          await tx
            .update(schema.integrations)
            .set({
              disconnect_requested_at: integration.disconnect_requested_at ?? now,
              disconnected_at: now,
              generation,
              lifecycle_status: "disconnected",
              remote_revoked_at: null,
              updated_at: now,
            })
            .where(eq(schema.integrations.id, integration.id));
          await tx
            .update(schema.providerSyncJobs)
            .set({
              last_error: "Wahoo runtime disabled during local disconnect",
              lock_expires_at: null,
              locked_at: null,
              locked_by: null,
              status: "completed",
              updated_at: now,
            })
            .where(
              and(
                eq(schema.providerSyncJobs.integration_id, integration.id),
                inArray(schema.providerSyncJobs.status, ["queued", "failed", "running"]),
              ),
            );
          await tx
            .update(schema.providerWebhookReceipts)
            .set({
              last_error: "integration_generation_inactive",
              processed_at: now,
              processing_status: "processed",
            })
            .where(
              and(
                eq(schema.providerWebhookReceipts.integration_id, integration.id),
                eq(schema.providerWebhookReceipts.processing_status, "pending"),
              ),
            );
          await tx
            .delete(schema.integrationCredentials)
            .where(eq(schema.integrationCredentials.integration_id, integration.id));
          return {
            generation,
            integrationId: integration.id,
            jobId: null,
            status: "disconnected" as const,
          };
        }
        let generation = integration.generation;
        if (integration.lifecycle_status === "active") {
          generation += 1;
          await tx
            .update(schema.integrations)
            .set({
              disconnect_requested_at: now,
              generation,
              lifecycle_status: "disconnect_pending",
              remote_revoked_at: null,
              updated_at: now,
            })
            .where(eq(schema.integrations.id, integration.id));
          await tx
            .update(schema.providerSyncJobs)
            .set({
              last_error: "Fenced by integration disconnect",
              lock_expires_at: null,
              locked_at: null,
              locked_by: null,
              status: "completed",
              updated_at: now,
            })
            .where(
              and(
                eq(schema.providerSyncJobs.integration_id, integration.id),
                sql`${schema.providerSyncJobs.job_type} not in ('wahoo.disconnect', 'wahoo.staging_cleanup')`,
                inArray(schema.providerSyncJobs.status, ["queued", "failed", "running"]),
              ),
            );
          await tx
            .update(schema.providerWebhookReceipts)
            .set({
              last_error: "integration_generation_inactive",
              processed_at: now,
              processing_status: "processed",
            })
            .where(
              and(
                eq(schema.providerWebhookReceipts.integration_id, integration.id),
                eq(schema.providerWebhookReceipts.integration_generation, generation - 1),
                eq(schema.providerWebhookReceipts.processing_status, "pending"),
              ),
            );
        }
        const enqueued = await this.enqueueJobInTransaction(tx, {
          dedupeKey: `wahoo.disconnect:${integration.id}:${generation}`,
          integrationGeneration: generation,
          integrationId: integration.id,
          jobType: "wahoo.disconnect",
          payload: { expectedGeneration: generation },
          priority: 0,
          profileId,
          provider: "wahoo",
          runAt: now.toISOString(),
        });
        return {
          generation,
          integrationId: integration.id,
          jobId: enqueued.id,
          status: "pending" as const,
        };
      });
    },

    async beginWahooDisconnectAttempt({ generation, integrationId, jobId, workerId }) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: "disconnect_attempt_uncertain",
            updated_at: now,
          })
          .where(
            and(
              eq(schema.providerSyncJobs.id, jobId),
              eq(schema.providerSyncJobs.integration_id, integrationId),
              eq(schema.providerSyncJobs.integration_generation, generation),
              eq(schema.providerSyncJobs.job_type, "wahoo.disconnect"),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (!job) return null;
        const [integration] = await tx
          .select({
            generation: schema.integrations.generation,
            lifecycleStatus: schema.integrations.lifecycle_status,
          })
          .from(schema.integrations)
          .where(eq(schema.integrations.id, integrationId))
          .limit(1);
        if (!integration) return { disposition: "invalid" };
        if (
          integration.generation !== generation ||
          integration.lifecycleStatus === "disconnected"
        ) {
          return { disposition: "superseded" };
        }
        if (integration.lifecycleStatus !== "disconnect_pending") {
          return { disposition: "invalid" };
        }
        const [credential] = await tx
          .select({ accessToken: schema.integrationCredentials.access_token })
          .from(schema.integrationCredentials)
          .where(eq(schema.integrationCredentials.integration_id, integrationId))
          .limit(1);
        return credential
          ? { accessToken: decryptProviderToken(credential.accessToken), disposition: "ready" }
          : { disposition: "invalid" };
      });
    },

    async finalizeWahooDisconnect({ generation, integrationId, jobId, outcome, workerId }) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const owned = and(
          eq(schema.providerSyncJobs.id, jobId),
          eq(schema.providerSyncJobs.integration_id, integrationId),
          eq(schema.providerSyncJobs.integration_generation, generation),
          eq(schema.providerSyncJobs.status, "running"),
          eq(schema.providerSyncJobs.locked_by, workerId),
          gt(schema.providerSyncJobs.lock_expires_at, now),
        );
        if (outcome === "retry" || outcome === "dead_lettered") {
          const [updated] = await tx
            .update(schema.providerSyncJobs)
            .set({
              last_error:
                outcome === "retry" ? "disconnect_response_uncertain" : "disconnect_failed",
              lock_expires_at: null,
              locked_at: null,
              locked_by: null,
              run_at: outcome === "retry" ? new Date(now.getTime() + 5 * 60_000) : undefined,
              status: outcome === "retry" ? "failed" : "dead_lettered",
              updated_at: now,
            })
            .where(owned)
            .returning({ id: schema.providerSyncJobs.id });
          return Boolean(updated);
        }
        const [integration] = await tx
          .update(schema.integrations)
          .set({
            disconnected_at: now,
            lifecycle_status: "disconnected",
            remote_revoked_at: now,
            updated_at: now,
          })
          .where(
            and(
              eq(schema.integrations.id, integrationId),
              eq(schema.integrations.generation, generation),
              eq(schema.integrations.lifecycle_status, "disconnect_pending"),
            ),
          )
          .returning({ id: schema.integrations.id });
        if (!integration) return false;
        await tx
          .delete(schema.integrationCredentials)
          .where(eq(schema.integrationCredentials.integration_id, integrationId));
        const [job] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: null,
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            status: "completed",
            updated_at: now,
          })
          .where(owned)
          .returning({ id: schema.providerSyncJobs.id });
        return Boolean(job);
      });
    },

    async markJobSucceeded(id, workerId, expectedIntegrationGeneration) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          status: "completed",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            expectedIntegrationGeneration === undefined
              ? undefined
              : sql`exists (
              select 1 from integrations where integrations.id = ${schema.providerSyncJobs.integration_id}
                and integrations.lifecycle_status = 'active'
                and integrations.generation = ${expectedIntegrationGeneration}
            )`,
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async renewJobLease({ id, lockExpiresAt, workerId }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({ lock_expires_at: new Date(lockExpiresAt), updated_at: new Date() })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async finalizeWebhookReceiptJob(input) {
      return db.transaction(async (tx) => {
        const [ownedJob] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: input.lastError ? toBoundedWahooSyncError(input.lastError) : null,
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            run_at: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
            status: input.jobStatus,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.providerSyncJobs.id, input.jobId),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, input.workerId),
              gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (!ownedJob) return false;

        const [updatedReceipt] = await tx
          .update(schema.providerWebhookReceipts)
          .set({
            last_error: input.lastError ? toBoundedWahooSyncError(input.lastError) : null,
            processed_at: input.receiptStatus === "processed" ? new Date() : null,
            processing_status: input.receiptStatus,
          })
          .where(
            and(
              eq(schema.providerWebhookReceipts.id, input.receiptId),
              eq(schema.providerWebhookReceipts.job_id, input.jobId),
            ),
          )
          .returning({ id: schema.providerWebhookReceipts.id });
        if (!updatedReceipt) {
          throw new Error("Webhook receipt is not linked to the owned provider sync job");
        }
        return true;
      });
    },

    async storeWebhookReceipt(input) {
      return db.transaction(async (tx) => {
        if (input.providerEventId && input.providerAccountId) {
          const [existing] = await tx
            .select({ id: schema.providerWebhookReceipts.id })
            .from(schema.providerWebhookReceipts)
            .where(
              and(
                eq(schema.providerWebhookReceipts.provider, input.provider),
                eq(schema.providerWebhookReceipts.provider_account_id, input.providerAccountId),
                eq(schema.providerWebhookReceipts.provider_event_id, input.providerEventId),
              ),
            )
            .limit(1);

          if (existing) {
            return { id: existing.id, inserted: false, captured: false };
          }
        }

        const activeIntegration =
          input.integrationId && input.integrationGeneration
            ? (
                await tx
                  .select({ id: schema.integrations.id })
                  .from(schema.integrations)
                  .where(
                    and(
                      eq(schema.integrations.id, input.integrationId),
                      eq(schema.integrations.generation, input.integrationGeneration),
                      eq(schema.integrations.lifecycle_status, "active"),
                      eq(schema.integrations.provider, input.provider),
                    ),
                  )
                  .limit(1)
                  .for("update")
              )[0]
            : undefined;
        const captured = Boolean(activeIntegration);

        const [created] = await tx
          .insert(schema.providerWebhookReceipts)
          .values({
            event_type: input.eventType,
            integration_id: captured ? input.integrationId : null,
            integration_generation: captured ? input.integrationGeneration : null,
            object_id: input.objectId,
            object_type: input.objectType,
            payload: input.payload,
            payload_hash: input.payloadHash,
            processing_status: captured ? "pending" : "processed",
            provider: input.provider,
            provider_account_id: input.providerAccountId,
            provider_event_id: input.providerEventId,
            last_error: captured ? null : "integration_inactive_at_receipt",
          })
          .returning({ id: schema.providerWebhookReceipts.id });

        if (!created) {
          throw new Error("Failed to store provider webhook receipt");
        }

        return { id: created.id, inserted: true, captured };
      });
    },

    async setWebhookReceiptJob({ id, jobId }) {
      await db
        .update(schema.providerWebhookReceipts)
        .set({ job_id: jobId })
        .where(eq(schema.providerWebhookReceipts.id, id));
    },

    async getWebhookReceipt(id) {
      const [receipt] = await db
        .select({
          createdAt: schema.providerWebhookReceipts.created_at,
          eventType: schema.providerWebhookReceipts.event_type,
          id: schema.providerWebhookReceipts.id,
          integrationId: schema.providerWebhookReceipts.integration_id,
          integrationGeneration: schema.providerWebhookReceipts.integration_generation,
          jobId: schema.providerWebhookReceipts.job_id,
          lastError: schema.providerWebhookReceipts.last_error,
          payload: schema.providerWebhookReceipts.payload,
          processingStatus: schema.providerWebhookReceipts.processing_status,
          provider: schema.providerWebhookReceipts.provider,
          providerAccountId: schema.providerWebhookReceipts.provider_account_id,
          providerEventId: schema.providerWebhookReceipts.provider_event_id,
          receivedAt: schema.providerWebhookReceipts.received_at,
        })
        .from(schema.providerWebhookReceipts)
        .where(
          and(
            eq(schema.providerWebhookReceipts.id, id),
            eq(schema.providerWebhookReceipts.provider, "wahoo"),
          ),
        )
        .limit(1);

      return receipt
        ? {
            ...receipt,
            createdAt: toIsoString(receipt.createdAt),
            provider: "wahoo" as const,
            receivedAt: toIsoString(receipt.receivedAt),
          }
        : null;
    },

    async listJobs({ internalResourceId, limit, order = "oldest_run_at", profileId, statuses }) {
      const rows = await db
        .select({
          attempt: schema.providerSyncJobs.attempt,
          dedupeKey: schema.providerSyncJobs.dedupe_key,
          id: schema.providerSyncJobs.id,
          integrationId: schema.providerSyncJobs.integration_id,
          integrationGeneration: schema.providerSyncJobs.integration_generation,
          internalResourceId: schema.providerSyncJobs.internal_resource_id,
          jobType: schema.providerSyncJobs.job_type,
          lastError: schema.providerSyncJobs.last_error,
          maxAttempts: schema.providerSyncJobs.max_attempts,
          operation: schema.providerSyncJobs.operation,
          payload: schema.providerSyncJobs.payload,
          payloadHash: schema.providerSyncJobs.payload_hash,
          profileId: schema.providerSyncJobs.profile_id,
          provider: schema.providerSyncJobs.provider,
          queueSequence: schema.providerSyncJobs.queue_sequence,
          resourceKind: schema.providerSyncJobs.resource_kind,
          runAt: schema.providerSyncJobs.run_at,
          status: schema.providerSyncJobs.status,
          supersedesJobId: schema.providerSyncJobs.supersedes_job_id,
          syncLaneKey: schema.providerSyncJobs.sync_lane_key,
          updatedAt: schema.providerSyncJobs.updated_at,
        })
        .from(schema.providerSyncJobs)
        .where(
          and(
            internalResourceId
              ? eq(schema.providerSyncJobs.internal_resource_id, internalResourceId)
              : undefined,
            eq(schema.providerSyncJobs.provider, "wahoo"),
            profileId ? eq(schema.providerSyncJobs.profile_id, profileId) : undefined,
            statuses?.length ? inArray(schema.providerSyncJobs.status, statuses) : undefined,
          ),
        )
        .orderBy(
          ...(order === "newest_authority"
            ? [desc(schema.providerSyncJobs.queue_sequence), desc(schema.providerSyncJobs.run_at)]
            : [asc(schema.providerSyncJobs.run_at)]),
        )
        .limit(limit);

      return rows.map(mapWahooSyncJobRow);
    },

    async listSyncStateByIntegrationIds(integrationIds) {
      if (integrationIds.length === 0) return [];

      const rows = await db
        .select({
          consecutiveFailures: schema.providerSyncState.consecutive_failures,
          cursor: schema.providerSyncState.cursor,
          highWatermark: schema.providerSyncState.high_watermark,
          id: schema.providerSyncState.id,
          integrationId: schema.providerSyncState.integration_id,
          lastError: schema.providerSyncState.last_error,
          lastSyncFailedAt: schema.providerSyncState.last_sync_failed_at,
          lastSyncStartedAt: schema.providerSyncState.last_sync_started_at,
          lastSyncSucceededAt: schema.providerSyncState.last_sync_succeeded_at,
          metadata: schema.providerSyncState.metadata,
          nextSyncAt: schema.providerSyncState.next_sync_at,
          provider: schema.providerSyncState.provider,
          publishHorizonDays: schema.providerSyncState.publish_horizon_days,
          resource: schema.providerSyncState.resource,
          syncMode: schema.providerSyncState.sync_mode,
        })
        .from(schema.providerSyncState)
        .where(
          and(
            inArray(schema.providerSyncState.integration_id, integrationIds),
            eq(schema.providerSyncState.provider, "wahoo"),
          ),
        );

      return rows.map((row) => ({
        ...row,
        provider: "wahoo" as const,
        highWatermark: toIsoString(row.highWatermark),
        lastSyncFailedAt: toIsoString(row.lastSyncFailedAt),
        lastSyncStartedAt: toIsoString(row.lastSyncStartedAt),
        lastSyncSucceededAt: toIsoString(row.lastSyncSucceededAt),
        nextSyncAt: toIsoString(row.nextSyncAt),
      }));
    },

    async listWebhookReceipts({ limit, statuses }) {
      const rows = await db
        .select({
          createdAt: schema.providerWebhookReceipts.created_at,
          eventType: schema.providerWebhookReceipts.event_type,
          id: schema.providerWebhookReceipts.id,
          integrationId: schema.providerWebhookReceipts.integration_id,
          integrationGeneration: schema.providerWebhookReceipts.integration_generation,
          jobId: schema.providerWebhookReceipts.job_id,
          lastError: schema.providerWebhookReceipts.last_error,
          payload: schema.providerWebhookReceipts.payload,
          processingStatus: schema.providerWebhookReceipts.processing_status,
          provider: schema.providerWebhookReceipts.provider,
          providerAccountId: schema.providerWebhookReceipts.provider_account_id,
          providerEventId: schema.providerWebhookReceipts.provider_event_id,
          receivedAt: schema.providerWebhookReceipts.received_at,
        })
        .from(schema.providerWebhookReceipts)
        .where(
          and(
            eq(schema.providerWebhookReceipts.provider, "wahoo"),
            statuses?.length
              ? inArray(schema.providerWebhookReceipts.processing_status, statuses)
              : undefined,
          ),
        )
        .orderBy(asc(schema.providerWebhookReceipts.received_at))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        provider: "wahoo" as const,
        createdAt: toIsoString(row.createdAt),
        receivedAt: toIsoString(row.receivedAt),
      }));
    },

    async retryJob({ id, provider }) {
      if (!isWahooIntegrationEnabled()) return false;
      const [retried] = await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          run_at: new Date(),
          attempt: 0,
          status: "queued",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.provider, provider),
            inArray(schema.providerSyncJobs.status, ["failed", "dead_lettered"]),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });

      return Boolean(retried);
    },

    async retryWebhookReceipt({ id, provider }) {
      if (!isWahooIntegrationEnabled()) return false;
      return db.transaction(async (tx) => {
        const [receipt] = await tx
          .select({ jobId: schema.providerWebhookReceipts.job_id })
          .from(schema.providerWebhookReceipts)
          .where(
            and(
              eq(schema.providerWebhookReceipts.id, id),
              eq(schema.providerWebhookReceipts.provider, provider),
              eq(schema.providerWebhookReceipts.processing_status, "failed"),
            ),
          )
          .limit(1)
          .for("update");
        if (!receipt) return false;

        if (receipt.jobId) {
          const [retriedJob] = await tx
            .update(schema.providerSyncJobs)
            .set({
              last_error: null,
              lock_expires_at: null,
              locked_at: null,
              locked_by: null,
              run_at: new Date(),
              attempt: 0,
              status: "queued",
              updated_at: new Date(),
            })
            .where(
              and(
                eq(schema.providerSyncJobs.id, receipt.jobId),
                eq(schema.providerSyncJobs.provider, provider),
                inArray(schema.providerSyncJobs.status, ["failed", "dead_lettered"]),
              ),
            )
            .returning({ id: schema.providerSyncJobs.id });
          if (!retriedJob) return false;
        }

        const [retried] = await tx
          .update(schema.providerWebhookReceipts)
          .set({
            last_error: null,
            processed_at: null,
            processing_status: "pending",
          })
          .where(
            and(
              eq(schema.providerWebhookReceipts.id, id),
              eq(schema.providerWebhookReceipts.provider, provider),
              eq(schema.providerWebhookReceipts.processing_status, "failed"),
            ),
          )
          .returning({ id: schema.providerWebhookReceipts.id });
        if (!retried) return false;
        return true;
      });
    },

    async markWebhookReceiptProcessed({ id, lastError, status }) {
      await db
        .update(schema.providerWebhookReceipts)
        .set({
          last_error: lastError ? toBoundedWahooSyncError(lastError) : null,
          processed_at: status === "processed" ? new Date() : null,
          processing_status: status,
        })
        .where(eq(schema.providerWebhookReceipts.id, id));
    },

    async markJobFailed({
      expectedIntegrationGeneration,
      id,
      lastError,
      nextRunAt,
      status,
      workerId,
    }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: toBoundedWahooSyncError(lastError),
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          run_at: nextRunAt ? new Date(nextRunAt) : undefined,
          status,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            expectedIntegrationGeneration === undefined
              ? undefined
              : sql`exists (
              select 1 from integrations where integrations.id = ${schema.providerSyncJobs.integration_id}
                and integrations.lifecycle_status = 'active'
                and integrations.generation = ${expectedIntegrationGeneration}
            )`,
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async continueJob({
      expectedIntegrationGeneration,
      id,
      importRunId,
      payload,
      runAt,
      workerId,
    }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          payload,
          import_run_id: importRunId,
          last_error: null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          run_at: new Date(runAt),
          status: "queued",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            importRunId === undefined
              ? isNull(schema.providerSyncJobs.import_run_id)
              : and(
                  eq(schema.providerSyncJobs.import_run_id, importRunId),
                  sql`${schema.providerSyncJobs.payload}->>'importRunId' = ${importRunId}`,
                  sql`exists (
                    select 1 from activity_import_runs run
                    where run.id = ${importRunId}::uuid
                      and run.profile_id = ${schema.providerSyncJobs.profile_id}
                      and run.integration_id = ${schema.providerSyncJobs.integration_id}
                      and run.integration_generation = ${schema.providerSyncJobs.integration_generation}
                  )`,
                ),
            sql`exists (
              select 1 from integrations where integrations.id = ${schema.providerSyncJobs.integration_id}
                and integrations.lifecycle_status = 'active'
                and integrations.generation = ${expectedIntegrationGeneration}
            )`,
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async touchSyncState({
      integrationId,
      metadata,
      nextSyncAt,
      provider,
      publishHorizonDays,
      resource,
      syncMode,
    }) {
      await db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integrationId,
          provider,
          resource,
          publish_horizon_days: publishHorizonDays,
          sync_mode: syncMode,
          next_sync_at: nextSyncAt ? new Date(nextSyncAt) : null,
          metadata: metadata ?? {},
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            metadata: metadata
              ? sql`${schema.providerSyncState.metadata} || ${JSON.stringify(metadata)}::jsonb`
              : schema.providerSyncState.metadata,
            next_sync_at: nextSyncAt ? new Date(nextSyncAt) : schema.providerSyncState.next_sync_at,
            provider,
            publish_horizon_days:
              publishHorizonDays ?? schema.providerSyncState.publish_horizon_days,
            sync_mode: syncMode,
            updated_at: new Date(),
          },
        });
    },

    async updateSyncStateAfterRun({
      highWatermark,
      integrationId,
      metadata,
      nextSyncAt,
      provider,
      resource,
      succeeded,
    }) {
      await db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integrationId,
          provider,
          resource,
          sync_mode: "push_windowed",
          next_sync_at: nextSyncAt ? new Date(nextSyncAt) : null,
          high_watermark: highWatermark ? new Date(highWatermark) : null,
          metadata: metadata ?? {},
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            consecutive_failures: succeeded
              ? 0
              : sql`${schema.providerSyncState.consecutive_failures}`,
            last_error: succeeded ? null : schema.providerSyncState.last_error,
            last_sync_failed_at: succeeded
              ? schema.providerSyncState.last_sync_failed_at
              : new Date(),
            last_sync_started_at: new Date(),
            last_sync_succeeded_at: succeeded
              ? new Date()
              : schema.providerSyncState.last_sync_succeeded_at,
            high_watermark: highWatermark
              ? new Date(highWatermark)
              : schema.providerSyncState.high_watermark,
            metadata: metadata
              ? sql`${schema.providerSyncState.metadata} || ${JSON.stringify(metadata)}::jsonb`
              : schema.providerSyncState.metadata,
            next_sync_at: nextSyncAt ? new Date(nextSyncAt) : schema.providerSyncState.next_sync_at,
            updated_at: new Date(),
          },
        });
    },

    async updateSyncStateAfterFailure({
      integrationId,
      lastError,
      nextSyncAt,
      provider,
      resource,
    }) {
      const boundedError = toBoundedWahooSyncError(lastError);
      await db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integrationId,
          provider,
          resource,
          sync_mode: "push_windowed",
          next_sync_at: nextSyncAt ? new Date(nextSyncAt) : null,
          last_error: boundedError,
          consecutive_failures: 1,
          last_sync_failed_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            consecutive_failures: sql`${schema.providerSyncState.consecutive_failures} + 1`,
            last_error: boundedError,
            last_sync_failed_at: new Date(),
            next_sync_at: nextSyncAt ? new Date(nextSyncAt) : schema.providerSyncState.next_sync_at,
            updated_at: new Date(),
          },
        });
    },
  };
  return {
    ...repository,
    requestProviderDisconnect: ({ profileId }) => repository.requestWahooDisconnect({ profileId }),
    beginProviderDisconnectAttempt: ({ generation, integrationId, jobId, workerId }) =>
      repository.beginWahooDisconnectAttempt({ generation, integrationId, jobId, workerId }),
    finalizeProviderDisconnect: ({ generation, integrationId, jobId, outcome, workerId }) =>
      repository.finalizeWahooDisconnect({ generation, integrationId, jobId, outcome, workerId }),
  };
}
