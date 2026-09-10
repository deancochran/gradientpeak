import { providerCapabilityIsAuthorized } from "@repo/core";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  type DrizzleQueryExecutor,
  type DrizzleTransactionClient,
  withProfileAdvisorySessionFence,
} from "../../db";
import { isStravaIntegrationEnabled } from "../../lib/integrations/oauth-config";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
} from "../../lib/provider-token-crypto";
import { lockOnboardingProfile } from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";
import type {
  EnqueueStravaSyncJobInput,
  StravaCompletedActivityUploadTarget,
  StravaRepository,
  StravaSyncJobRecord,
} from "../../repositories/strava-repository";
import { createStravaCompletedActivityUploadDedupeKey } from "../../repositories/strava-repository";

const STRAVA_HISTORY_RESOURCE = "historical_activities";
const STRAVA_DISCONNECT_JOB = "strava.disconnect";
const STRAVA_WEBHOOK_JOB = "strava.process_webhook_receipt";
const STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB = "strava.completed_activity_upload";
const activeJobStatuses = ["queued", "running", "failed"] as const;

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function mapJob(row: typeof schema.providerSyncJobs.$inferSelect): StravaSyncJobRecord {
  return {
    attempt: row.attempt,
    id: row.id,
    importRunId: row.import_run_id,
    integrationGeneration: row.integration_generation,
    integrationId: row.integration_id,
    jobType: row.job_type,
    maxAttempts: row.max_attempts,
    payload: row.payload,
    profileId: row.profile_id,
    provider: "strava",
    status: row.status as StravaSyncJobRecord["status"],
  };
}

function boundedError(value: string): string {
  return /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "strava_provider_operation_failed";
}

function isCompletedActivityEchoCandidate(input: { payload: unknown }): boolean {
  const phase =
    input.payload && typeof input.payload === "object" && "phase" in input.payload
      ? input.payload.phase
      : null;
  return phase === "dispatching" || phase === "polling";
}

async function readCompletedActivityUploadTarget(
  query: DrizzleQueryExecutor,
  input: { activityId: string; profileId: string },
): Promise<StravaCompletedActivityUploadTarget> {
  const [activity] = await query
    .select({ id: schema.activities.id, segmentsRevision: schema.activities.segments_revision })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.id, input.activityId),
        eq(schema.activities.profile_id, input.profileId),
      ),
    )
    .limit(1);
  if (!activity) return { status: "activity_not_found" };

  const [integration] = await query
    .select({
      generation: schema.integrations.generation,
      id: schema.integrations.id,
      reconnectRequiredAt: schema.integrationCredentials.reconnect_required_at,
      scope: schema.integrationCredentials.scope,
    })
    .from(schema.integrations)
    .innerJoin(
      schema.integrationCredentials,
      eq(schema.integrationCredentials.integration_id, schema.integrations.id),
    )
    .where(
      and(
        eq(schema.integrations.profile_id, input.profileId),
        eq(schema.integrations.provider, "strava"),
        eq(schema.integrations.lifecycle_status, "active"),
      ),
    )
    .limit(1);
  if (!integration) return { status: "not_connected" };
  if (
    integration.reconnectRequiredAt ||
    !providerCapabilityIsAuthorized({
      provider: "strava",
      capability: "completed_activity_export",
      grantedScope: integration.scope,
    })
  ) {
    return { status: "reconnect_required" };
  }

  const [artifact] = await query
    .select({
      artifactId: schema.activityArtifacts.id,
      bucket: schema.activityArtifacts.bucket,
      byteSize: schema.activityArtifacts.byte_size,
      digest: schema.activityArtifacts.digest,
      format: schema.activityArtifacts.format,
      mediaType: schema.activityArtifacts.media_type,
      path: schema.activityArtifacts.path,
    })
    .from(schema.activityArtifactLinks)
    .innerJoin(
      schema.activityArtifacts,
      and(
        eq(schema.activityArtifacts.id, schema.activityArtifactLinks.artifact_id),
        eq(schema.activityArtifacts.profile_id, schema.activityArtifactLinks.profile_id),
      ),
    )
    .where(
      and(
        eq(schema.activityArtifactLinks.activity_id, input.activityId),
        eq(schema.activityArtifactLinks.profile_id, input.profileId),
        eq(schema.activityArtifactLinks.role, "source"),
        eq(schema.activityArtifactLinks.is_current, true),
        eq(schema.activityArtifacts.availability, "accepted"),
        isNull(schema.activityArtifacts.deletion_requested_at),
        isNull(schema.activityArtifacts.deleted_at),
      ),
    )
    .limit(1);
  if (!artifact || !["fit", "tcx", "gpx"].includes(artifact.format)) {
    return { status: "unsupported_evidence" };
  }
  return {
    artifact: {
      ...artifact,
      format: artifact.format as "fit" | "gpx" | "tcx",
      segmentsRevision: activity.segmentsRevision,
    },
    integrationGeneration: integration.generation,
    integrationId: integration.id,
    status: "ready",
  };
}

async function enqueueInTransaction(
  tx: DrizzleTransactionClient,
  input: EnqueueStravaSyncJobInput,
): Promise<{ id: string; status: StravaSyncJobRecord["status"] }> {
  if (input.provider !== "strava") throw new Error("Strava queue rejected another provider");
  const lockIdentity = input.dedupeKey ?? input.syncLaneKey;
  if (lockIdentity) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`strava-job:${lockIdentity}`}, 0))`,
    );
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
        eq(schema.integrations.provider, "strava"),
      ),
    )
    .limit(1)
    .for("update");
  if (!integration) throw new Error("Strava integration was not found");
  if (
    integration.lifecycleStatus !== "active" &&
    !(
      integration.lifecycleStatus === "disconnect_pending" &&
      input.jobType === STRAVA_DISCONNECT_JOB
    )
  ) {
    throw new Error("Strava integration is not active");
  }
  const generation = input.integrationGeneration ?? integration.generation;
  if (input.dedupeKey) {
    const [existing] = await tx
      .select()
      .from(schema.providerSyncJobs)
      .where(
        and(
          eq(schema.providerSyncJobs.provider, "strava"),
          eq(schema.providerSyncJobs.integration_id, input.integrationId),
          eq(schema.providerSyncJobs.integration_generation, generation),
          eq(schema.providerSyncJobs.dedupe_key, input.dedupeKey),
          inArray(schema.providerSyncJobs.status, activeJobStatuses),
        ),
      )
      .orderBy(asc(schema.providerSyncJobs.queue_sequence))
      .limit(1);
    if (existing) {
      const trigger =
        input.payload && typeof input.payload === "object" && "trigger" in input.payload
          ? input.payload.trigger
          : null;
      if (trigger === "onboarding") {
        const payload =
          existing.payload &&
          typeof existing.payload === "object" &&
          !Array.isArray(existing.payload) &&
          input.payload &&
          typeof input.payload === "object" &&
          !Array.isArray(input.payload)
            ? { ...existing.payload, ...input.payload }
            : input.payload;
        await tx
          .update(schema.providerSyncJobs)
          .set({ payload, updated_at: new Date() })
          .where(eq(schema.providerSyncJobs.id, existing.id));
      }
      return { id: existing.id, status: existing.status as StravaSyncJobRecord["status"] };
    }
  }
  const [created] = await tx
    .insert(schema.providerSyncJobs)
    .values({
      dedupe_key: input.dedupeKey ?? null,
      integration_id: input.integrationId,
      integration_generation: generation,
      import_run_id: input.importRunId ?? null,
      internal_resource_id: input.internalResourceId ?? null,
      job_type: input.jobType,
      max_attempts: input.maxAttempts ?? 8,
      operation: input.operation ?? null,
      payload: input.payload,
      payload_hash: input.payloadHash ?? null,
      priority: input.priority ?? 100,
      profile_id: input.profileId,
      provider: "strava",
      resource_kind: input.resourceKind ?? null,
      run_at: new Date(input.runAt),
      supersedes_job_id: input.supersedesJobId ?? null,
      sync_lane_key: input.syncLaneKey ?? null,
    })
    .returning();
  if (!created) throw new Error("Strava job could not be queued");
  return { id: created.id, status: created.status as StravaSyncJobRecord["status"] };
}

export function createStravaRepository({ db }: { db: DrizzleDbClient }): StravaRepository {
  return {
    async enqueueJob(input) {
      if (!isStravaIntegrationEnabled()) throw new Error("Strava integration is disabled");
      return db.transaction((tx) => enqueueInTransaction(tx, input));
    },

    async enqueueJobInTransaction(tx, input) {
      if (!isStravaIntegrationEnabled()) throw new Error("Strava integration is disabled");
      return enqueueInTransaction(tx, input);
    },

    async readCompletedActivityUploadTarget(input) {
      return readCompletedActivityUploadTarget(db, input);
    },

    async readCompletedActivityUploadState(input) {
      const target = await readCompletedActivityUploadTarget(db, input);
      if (target.status !== "ready") return { jobId: null, status: target.status };
      const [job] = await db
        .select({
          id: schema.providerSyncJobs.id,
          lastError: schema.providerSyncJobs.last_error,
          payload: schema.providerSyncJobs.payload,
          status: schema.providerSyncJobs.status,
        })
        .from(schema.providerSyncJobs)
        .where(
          and(
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.job_type, STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB),
            eq(schema.providerSyncJobs.integration_id, target.integrationId),
            eq(schema.providerSyncJobs.integration_generation, target.integrationGeneration),
            eq(schema.providerSyncJobs.internal_resource_id, input.activityId),
            eq(schema.providerSyncJobs.payload_hash, target.artifact.digest),
          ),
        )
        .orderBy(desc(schema.providerSyncJobs.queue_sequence))
        .limit(1);
      if (!job) return { jobId: null, status: "ready" };
      if (job.status === "completed") return { jobId: job.id, status: "completed" };
      if (job.status === "running") return { jobId: job.id, status: "running" };
      if (job.status === "queued" || job.status === "failed") {
        return { jobId: job.id, status: "queued" };
      }
      const phase =
        job.payload && typeof job.payload === "object" && "phase" in job.payload
          ? job.payload.phase
          : null;
      return {
        jobId: job.id,
        status:
          job.lastError === "dispatch_uncertain" || phase === "dispatching"
            ? "dispatch_uncertain"
            : "failed",
      };
    },

    async findCompletedActivityUploadEcho(input) {
      const normalizedExternalId = input.externalId.trim().replace(/\.(?:fit|gpx|tcx)$/i, "");
      if (!/^gp-v1-[A-Za-z0-9_-]{43}$/.test(normalizedExternalId)) return null;
      const [job] = await db
        .select({
          activityId: schema.providerSyncJobs.internal_resource_id,
          lastError: schema.providerSyncJobs.last_error,
          payload: schema.providerSyncJobs.payload,
          status: schema.providerSyncJobs.status,
        })
        .from(schema.providerSyncJobs)
        .where(
          and(
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.job_type, STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB),
            eq(schema.providerSyncJobs.integration_id, input.integrationId),
            eq(schema.providerSyncJobs.integration_generation, input.integrationGeneration),
            eq(schema.providerSyncJobs.profile_id, input.profileId),
            sql`${schema.providerSyncJobs.payload}->>'externalId' = ${normalizedExternalId}`,
            sql`exists (
                select 1 from integrations
                where integrations.id = ${input.integrationId}
                  and integrations.profile_id = ${input.profileId}
                  and integrations.provider = 'strava'
                  and integrations.lifecycle_status = 'active'
                  and integrations.generation = ${input.integrationGeneration}
              )`,
          ),
        )
        .orderBy(desc(schema.providerSyncJobs.queue_sequence))
        .limit(1);
      return job?.activityId && isCompletedActivityEchoCandidate(job)
        ? { activityId: job.activityId }
        : null;
    },

    async convergeCompletedActivityUploadEcho(input) {
      const normalizedExternalId = input.externalId.trim().replace(/\.(?:fit|gpx|tcx)$/i, "");
      if (!/^gp-v1-[A-Za-z0-9_-]{43}$/.test(normalizedExternalId)) return false;
      return db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .select({
            activityId: schema.providerSyncJobs.internal_resource_id,
            id: schema.providerSyncJobs.id,
            lastError: schema.providerSyncJobs.last_error,
            payload: schema.providerSyncJobs.payload,
            status: schema.providerSyncJobs.status,
          })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.provider, "strava"),
              eq(schema.providerSyncJobs.job_type, STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB),
              eq(schema.providerSyncJobs.integration_id, input.integrationId),
              eq(schema.providerSyncJobs.integration_generation, input.integrationGeneration),
              eq(schema.providerSyncJobs.profile_id, input.profileId),
              sql`${schema.providerSyncJobs.payload}->>'externalId' = ${normalizedExternalId}`,
              sql`exists (
                select 1 from integrations
                where integrations.id = ${input.integrationId}
                  and integrations.profile_id = ${input.profileId}
                  and integrations.provider = 'strava'
                  and integrations.lifecycle_status = 'active'
                  and integrations.generation = ${input.integrationGeneration}
              )`,
            ),
          )
          .orderBy(desc(schema.providerSyncJobs.queue_sequence))
          .limit(1)
          .for("update");
        if (!job || job.activityId !== input.activityId) return false;
        if (!isCompletedActivityEchoCandidate(job)) return false;

        const [source] = await tx
          .select({
            activityId: schema.activitySourceReferences.activity_id,
            id: schema.activitySourceReferences.id,
            relationshipKind: schema.activitySourceReferences.relationship_kind,
          })
          .from(schema.activitySourceReferences)
          .where(
            and(
              eq(schema.activitySourceReferences.profile_id, input.profileId),
              eq(schema.activitySourceReferences.provider, "strava"),
              eq(schema.activitySourceReferences.provider_external_id, input.providerExternalId),
            ),
          )
          .limit(1)
          .for("update");
        if (source?.activityId && source.activityId !== input.activityId) {
          throw new Error("strava_upload_source_activity_conflict");
        }
        if (source) {
          await tx
            .update(schema.activitySourceReferences)
            .set({
              activity_id: input.activityId,
              integration_id: input.integrationId,
              relationship_kind:
                source.relationshipKind === "imported" ? "both" : source.relationshipKind,
              resolution_status: "confirmed",
              updated_at: now,
            })
            .where(eq(schema.activitySourceReferences.id, source.id));
        } else {
          await tx.insert(schema.activitySourceReferences).values({
            activity_id: input.activityId,
            integration_id: input.integrationId,
            profile_id: input.profileId,
            provider: "strava",
            provider_external_id: input.providerExternalId,
            relationship_kind: "exported",
            resolution_status: "confirmed",
          });
        }
        if (job.status !== "completed") {
          const [completed] = await tx
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
                eq(schema.providerSyncJobs.id, job.id),
                inArray(schema.providerSyncJobs.status, [
                  "queued",
                  "running",
                  "failed",
                  "dead_lettered",
                ]),
              ),
            )
            .returning({ id: schema.providerSyncJobs.id });
          if (!completed) return false;
        }
        return true;
      });
    },

    async enqueueCompletedActivityUpload(input) {
      return db.transaction(async (tx) => {
        const dedupeKey = createStravaCompletedActivityUploadDedupeKey({
          activityId: input.activityId,
          artifactDigest: input.artifact.digest,
          integrationGeneration: input.integrationGeneration,
          integrationId: input.integrationId,
        });
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`strava-job:${dedupeKey}`}, 0))`,
        );
        const target = await readCompletedActivityUploadTarget(tx, {
          activityId: input.activityId,
          profileId: input.profileId,
        });
        if (
          target.status !== "ready" ||
          target.integrationId !== input.integrationId ||
          target.integrationGeneration !== input.integrationGeneration ||
          target.artifact.artifactId !== input.artifact.artifactId ||
          target.artifact.digest !== input.artifact.digest
        ) {
          throw new Error("strava_completed_activity_upload_target_changed");
        }
        const [existing] = await tx
          .select({ id: schema.providerSyncJobs.id, status: schema.providerSyncJobs.status })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.provider, "strava"),
              eq(schema.providerSyncJobs.integration_id, input.integrationId),
              eq(schema.providerSyncJobs.integration_generation, input.integrationGeneration),
              eq(schema.providerSyncJobs.dedupe_key, dedupeKey),
            ),
          )
          .orderBy(asc(schema.providerSyncJobs.queue_sequence))
          .limit(1);
        if (existing) {
          return {
            created: false,
            id: existing.id,
            status: existing.status as StravaSyncJobRecord["status"],
          };
        }
        const payload = {
          activityId: input.activityId,
          artifact: input.artifact,
          externalId: input.externalId,
          phase: "pre_dispatch" as const,
        };
        const created = await enqueueInTransaction(tx, {
          dedupeKey,
          integrationGeneration: input.integrationGeneration,
          integrationId: input.integrationId,
          internalResourceId: input.activityId,
          jobType: STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB,
          maxAttempts: 30,
          operation: "create",
          payload,
          payloadHash: input.artifact.digest,
          profileId: input.profileId,
          provider: "strava",
          resourceKind: "activity",
          runAt: new Date().toISOString(),
          syncLaneKey: `strava:${input.integrationId}:completed-activity:${input.activityId}`,
        });
        return { ...created, created: true };
      });
    },

    async storeAndEnqueueWebhookReceipt(input) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`strava-webhook:${input.deliveryId}`}, 0))`,
        );
        const [existing] = await tx
          .select({
            id: schema.providerWebhookReceipts.id,
            jobId: schema.providerWebhookReceipts.job_id,
          })
          .from(schema.providerWebhookReceipts)
          .where(
            and(
              eq(schema.providerWebhookReceipts.provider, "strava"),
              eq(schema.providerWebhookReceipts.provider_account_id, input.ownerExternalId),
              eq(schema.providerWebhookReceipts.provider_event_id, input.deliveryId),
            ),
          )
          .limit(1);
        if (existing) {
          return {
            inserted: false,
            jobId: existing.jobId,
            queued: false,
            receiptId: existing.id,
          };
        }

        const [integration] = await tx
          .select({
            generation: schema.integrations.generation,
            id: schema.integrations.id,
            profileId: schema.integrations.profile_id,
          })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.provider, "strava"),
              eq(schema.integrations.external_id, input.ownerExternalId),
              eq(schema.integrations.lifecycle_status, "active"),
            ),
          )
          .limit(1)
          .for("update");
        const receiptId = crypto.randomUUID();
        await tx.insert(schema.providerWebhookReceipts).values({
          id: receiptId,
          event_type: input.eventType,
          integration_generation: integration?.generation ?? null,
          integration_id: integration?.id ?? null,
          last_error: integration ? null : "integration_inactive_at_receipt",
          object_id: input.objectId,
          object_type: input.objectType,
          payload: input.payload,
          payload_hash: input.deliveryId,
          processing_status: integration ? "pending" : "processed",
          processed_at: integration ? null : new Date(),
          provider: "strava",
          provider_account_id: input.ownerExternalId,
          provider_event_id: input.deliveryId,
        });
        if (!integration) {
          return { inserted: true, jobId: null, queued: false, receiptId };
        }
        const job = await enqueueInTransaction(tx, {
          dedupeKey: `strava:webhook:${input.deliveryId}`,
          integrationGeneration: integration.generation,
          integrationId: integration.id,
          jobType: STRAVA_WEBHOOK_JOB,
          maxAttempts: 5,
          payload: { receiptId },
          priority: input.priority,
          profileId: integration.profileId,
          provider: "strava",
          resourceKind: input.objectType === "activity" ? "activity" : undefined,
          runAt: new Date().toISOString(),
          syncLaneKey:
            input.objectType === "activity"
              ? `strava:${integration.id}:activity:${input.objectId}`
              : `strava:${integration.id}:lifecycle`,
        });
        const [linked] = await tx
          .update(schema.providerWebhookReceipts)
          .set({ job_id: job.id })
          .where(eq(schema.providerWebhookReceipts.id, receiptId))
          .returning({ id: schema.providerWebhookReceipts.id });
        if (!linked) throw new Error("Strava webhook receipt job link could not be persisted");
        return {
          inserted: true,
          jobId: job.id,
          queued: job.status === "queued",
          receiptId,
        };
      });
    },

    async claimDueJobs({ jobTypes, limit, lockExpiresAt, now, workerId }) {
      return db.transaction(async (tx) => {
        const nowDate = new Date(now);
        const rows = await tx
          .select()
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.provider, "strava"),
              inArray(schema.providerSyncJobs.job_type, [...jobTypes]),
              lte(schema.providerSyncJobs.run_at, nowDate),
              or(
                inArray(schema.providerSyncJobs.status, ["queued", "failed"]),
                and(
                  eq(schema.providerSyncJobs.status, "running"),
                  or(
                    isNull(schema.providerSyncJobs.lock_expires_at),
                    lte(schema.providerSyncJobs.lock_expires_at, nowDate),
                  ),
                ),
              ),
              or(
                isNull(schema.providerSyncJobs.sync_lane_key),
                sql`not exists (
                  select 1 from provider_sync_jobs earlier
                  where earlier.sync_lane_key = ${schema.providerSyncJobs.sync_lane_key}
                    and earlier.status in ('queued', 'failed', 'running')
                    and earlier.queue_sequence < ${schema.providerSyncJobs.queue_sequence}
                )`,
              ),
              or(
                isNull(schema.providerSyncJobs.sync_lane_key),
                sql`not exists (
                  select 1 from provider_sync_jobs active_lane
                  where active_lane.sync_lane_key = ${schema.providerSyncJobs.sync_lane_key}
                    and active_lane.id <> ${schema.providerSyncJobs.id}
                    and active_lane.status = 'running'
                    and active_lane.lock_expires_at > ${nowDate}
                )`,
              ),
            ),
          )
          .orderBy(
            asc(schema.providerSyncJobs.priority),
            asc(schema.providerSyncJobs.queue_sequence),
          )
          .limit(Math.min(10, Math.max(1, Math.floor(limit))))
          .for("update", { skipLocked: true });
        const claimed: StravaSyncJobRecord[] = [];
        for (const row of rows) {
          const [updated] = await tx
            .update(schema.providerSyncJobs)
            .set({
              attempt: sql`${schema.providerSyncJobs.attempt} + 1`,
              last_error: null,
              locked_at: nowDate,
              locked_by: workerId,
              lock_expires_at: new Date(lockExpiresAt),
              status: "running",
              updated_at: nowDate,
            })
            .where(eq(schema.providerSyncJobs.id, row.id))
            .returning();
          if (updated) claimed.push(mapJob(updated));
        }
        return claimed;
      });
    },

    async renewJobLease({ id, lockExpiresAt, workerId }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({ lock_expires_at: new Date(lockExpiresAt), updated_at: new Date() })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async runCompletedActivityUploadDispatch(input) {
      return withProfileAdvisorySessionFence(db, input.profileId, async (connectionDb) => {
        const dispatchMarked = await connectionDb.transaction(async (tx) => {
          const [integration] = await tx
            .select({ id: schema.integrations.id })
            .from(schema.integrations)
            .where(
              and(
                eq(schema.integrations.id, input.integrationId),
                eq(schema.integrations.profile_id, input.profileId),
                eq(schema.integrations.provider, "strava"),
                eq(schema.integrations.lifecycle_status, "active"),
                eq(schema.integrations.generation, input.expectedIntegrationGeneration),
              ),
            )
            .limit(1)
            .for("update");
          if (!integration) return false;
          const now = new Date();
          const [started] = await tx
            .update(schema.providerSyncJobs)
            .set({ last_error: "dispatch_uncertain", payload: input.payload, updated_at: now })
            .where(
              and(
                eq(schema.providerSyncJobs.id, input.jobId),
                eq(schema.providerSyncJobs.integration_id, input.integrationId),
                eq(schema.providerSyncJobs.provider, "strava"),
                eq(schema.providerSyncJobs.job_type, STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB),
                eq(
                  schema.providerSyncJobs.integration_generation,
                  input.expectedIntegrationGeneration,
                ),
                eq(schema.providerSyncJobs.status, "running"),
                eq(schema.providerSyncJobs.locked_by, input.workerId),
                gt(schema.providerSyncJobs.lock_expires_at, now),
                sql`${schema.providerSyncJobs.payload}->>'phase' = 'pre_dispatch'`,
              ),
            )
            .returning({ id: schema.providerSyncJobs.id });
          return Boolean(started);
        });
        // The marker transaction has committed, while the same session-level
        // profile fence still excludes disconnect and provider deauthorization.
        return dispatchMarked ? input.dispatch() : null;
      });
    },

    async rescheduleActivityUpload(input) {
      const now = new Date();
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: input.lastError ? boundedError(input.lastError) : null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          payload: input.payload,
          run_at: new Date(input.nextRunAt),
          status: "failed",
          updated_at: now,
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, input.jobId),
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.job_type, STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB),
            eq(schema.providerSyncJobs.integration_generation, input.expectedIntegrationGeneration),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, input.workerId),
            gt(schema.providerSyncJobs.lock_expires_at, now),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async completeActivityUpload(input) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .select({
            id: schema.providerSyncJobs.id,
            integrationId: schema.providerSyncJobs.integration_id,
            profileId: schema.providerSyncJobs.profile_id,
          })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.id, input.jobId),
              eq(schema.providerSyncJobs.provider, "strava"),
              eq(schema.providerSyncJobs.job_type, STRAVA_COMPLETED_ACTIVITY_UPLOAD_JOB),
              eq(
                schema.providerSyncJobs.integration_generation,
                input.expectedIntegrationGeneration,
              ),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, input.workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
              sql`${schema.providerSyncJobs.payload}->>'phase' = 'polling'`,
              sql`exists (
                select 1 from integrations
                where integrations.id = ${schema.providerSyncJobs.integration_id}
                  and integrations.profile_id = ${schema.providerSyncJobs.profile_id}
                  and integrations.provider = 'strava'
                  and integrations.lifecycle_status = 'active'
                  and integrations.generation = ${input.expectedIntegrationGeneration}
              )`,
            ),
          )
          .limit(1)
          .for("update");
        if (!job) return false;
        const [existing] = await tx
          .select({
            activityId: schema.activitySourceReferences.activity_id,
            relationshipKind: schema.activitySourceReferences.relationship_kind,
          })
          .from(schema.activitySourceReferences)
          .where(
            and(
              eq(schema.activitySourceReferences.profile_id, job.profileId),
              eq(schema.activitySourceReferences.provider, "strava"),
              eq(schema.activitySourceReferences.provider_external_id, input.providerExternalId),
            ),
          )
          .limit(1)
          .for("update");
        if (existing && existing.activityId !== input.activityId) {
          throw new Error("strava_upload_source_activity_conflict");
        }
        if (!existing) {
          await tx.insert(schema.activitySourceReferences).values({
            activity_id: input.activityId,
            integration_id: job.integrationId,
            profile_id: job.profileId,
            provider: "strava",
            provider_external_id: input.providerExternalId,
            relationship_kind: "exported",
            resolution_status: "confirmed",
          });
        } else if (existing.relationshipKind === "imported") {
          await tx
            .update(schema.activitySourceReferences)
            .set({ relationship_kind: "both", updated_at: now })
            .where(
              and(
                eq(schema.activitySourceReferences.profile_id, job.profileId),
                eq(schema.activitySourceReferences.provider, "strava"),
                eq(schema.activitySourceReferences.provider_external_id, input.providerExternalId),
              ),
            );
        }
        const [completed] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: null,
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            status: "completed",
            updated_at: now,
          })
          .where(eq(schema.providerSyncJobs.id, input.jobId))
          .returning({ id: schema.providerSyncJobs.id });
        return Boolean(completed);
      });
    },

    async finalizeWebhookReceiptJob(input) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: input.lastError ? boundedError(input.lastError) : null,
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            run_at: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
            status: input.jobStatus,
            updated_at: now,
          })
          .where(
            and(
              eq(schema.providerSyncJobs.id, input.jobId),
              eq(schema.providerSyncJobs.provider, "strava"),
              eq(
                schema.providerSyncJobs.integration_generation,
                input.expectedIntegrationGeneration,
              ),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, input.workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (!job) return false;
        const [receipt] = await tx
          .update(schema.providerWebhookReceipts)
          .set({
            last_error: input.lastError ? boundedError(input.lastError) : null,
            processed_at: input.receiptStatus === "processed" ? now : null,
            processing_status: input.receiptStatus,
          })
          .where(
            and(
              eq(schema.providerWebhookReceipts.id, input.receiptId),
              eq(schema.providerWebhookReceipts.job_id, input.jobId),
              eq(schema.providerWebhookReceipts.provider, "strava"),
            ),
          )
          .returning({ id: schema.providerWebhookReceipts.id });
        if (!receipt) throw new Error("Strava webhook receipt is not linked to its job");
        return true;
      });
    },

    async applyProviderDeauthorization(input) {
      if (input.provider !== "strava")
        throw new Error("Strava lifecycle rejected another provider");
      return db.transaction(async (tx) => {
        const now = new Date();
        await lockProfileAdvisoryFence(tx, input.profileId);
        const [activeIntegration] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.id, input.integrationId),
              eq(schema.integrations.profile_id, input.profileId),
              eq(schema.integrations.provider, "strava"),
              eq(schema.integrations.external_id, input.ownerExternalId),
              eq(schema.integrations.generation, input.expectedIntegrationGeneration),
              eq(schema.integrations.lifecycle_status, "active"),
            ),
          )
          .limit(1)
          .for("update");
        if (!activeIntegration) return false;
        const [job] = await tx
          .select({ id: schema.providerSyncJobs.id })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.id, input.jobId),
              eq(schema.providerSyncJobs.integration_id, input.integrationId),
              eq(
                schema.providerSyncJobs.integration_generation,
                input.expectedIntegrationGeneration,
              ),
              eq(schema.providerSyncJobs.provider, "strava"),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, input.workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
            ),
          )
          .limit(1)
          .for("update");
        if (!job) return false;
        const [receipt] = await tx
          .select({ id: schema.providerWebhookReceipts.id })
          .from(schema.providerWebhookReceipts)
          .where(
            and(
              eq(schema.providerWebhookReceipts.id, input.receiptId),
              eq(schema.providerWebhookReceipts.job_id, input.jobId),
            ),
          )
          .limit(1)
          .for("update");
        if (!receipt) return false;
        const [integration] = await tx
          .update(schema.integrations)
          .set({
            disconnect_requested_at: now,
            disconnected_at: now,
            generation: sql`${schema.integrations.generation} + 1`,
            lifecycle_status: "disconnected",
            remote_revoked_at: now,
            updated_at: now,
          })
          .where(
            and(
              eq(schema.integrations.id, input.integrationId),
              eq(schema.integrations.profile_id, input.profileId),
              eq(schema.integrations.provider, "strava"),
              eq(schema.integrations.external_id, input.ownerExternalId),
              eq(schema.integrations.generation, input.expectedIntegrationGeneration),
              eq(schema.integrations.lifecycle_status, "active"),
            ),
          )
          .returning({ id: schema.integrations.id });
        if (!integration) return false;
        await tx
          .delete(schema.integrationCredentials)
          .where(eq(schema.integrationCredentials.integration_id, input.integrationId));
        await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error: "integration_generation_inactive",
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            status: "completed",
            updated_at: now,
          })
          .where(
            and(
              eq(schema.providerSyncJobs.integration_id, input.integrationId),
              inArray(schema.providerSyncJobs.status, activeJobStatuses),
            ),
          );
        await tx
          .update(schema.providerSyncJobs)
          .set({ last_error: null })
          .where(eq(schema.providerSyncJobs.id, input.jobId));
        await tx
          .update(schema.providerWebhookReceipts)
          .set({
            last_error: "integration_generation_inactive",
            processed_at: now,
            processing_status: "processed",
          })
          .where(
            and(
              eq(schema.providerWebhookReceipts.integration_id, input.integrationId),
              eq(schema.providerWebhookReceipts.processing_status, "pending"),
            ),
          );
        await tx
          .update(schema.providerWebhookReceipts)
          .set({ last_error: null })
          .where(eq(schema.providerWebhookReceipts.id, input.receiptId));
        return true;
      });
    },

    async getWebhookReceipt(id) {
      const [row] = await db
        .select({
          eventType: schema.providerWebhookReceipts.event_type,
          id: schema.providerWebhookReceipts.id,
          integrationGeneration: schema.providerWebhookReceipts.integration_generation,
          integrationId: schema.providerWebhookReceipts.integration_id,
          jobId: schema.providerWebhookReceipts.job_id,
          payload: schema.providerWebhookReceipts.payload,
          processingStatus: schema.providerWebhookReceipts.processing_status,
          providerAccountId: schema.providerWebhookReceipts.provider_account_id,
          providerEventId: schema.providerWebhookReceipts.provider_event_id,
        })
        .from(schema.providerWebhookReceipts)
        .where(
          and(
            eq(schema.providerWebhookReceipts.id, id),
            eq(schema.providerWebhookReceipts.provider, "strava"),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async markJobSucceeded({ expectedIntegrationGeneration, id, workerId }) {
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
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            expectedIntegrationGeneration === undefined
              ? undefined
              : eq(schema.providerSyncJobs.integration_generation, expectedIntegrationGeneration),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async failJob({ expectedIntegrationGeneration, id, lastError, nextRunAt, status, workerId }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: boundedError(lastError),
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
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            expectedIntegrationGeneration === undefined
              ? undefined
              : eq(schema.providerSyncJobs.integration_generation, expectedIntegrationGeneration),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async bindJobImportRun({ expectedIntegrationGeneration, id, importRunId, payload, workerId }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({ import_run_id: importRunId, payload, updated_at: new Date() })
        .where(
          and(
            eq(schema.providerSyncJobs.id, id),
            eq(schema.providerSyncJobs.provider, "strava"),
            eq(schema.providerSyncJobs.integration_generation, expectedIntegrationGeneration),
            eq(schema.providerSyncJobs.status, "running"),
            eq(schema.providerSyncJobs.locked_by, workerId),
            gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            isNull(schema.providerSyncJobs.import_run_id),
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      return Boolean(updated);
    },

    async completeHistoryJob(input) {
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
              eq(schema.providerSyncJobs.id, input.id),
              eq(schema.providerSyncJobs.integration_id, input.integrationId),
              eq(
                schema.providerSyncJobs.integration_generation,
                input.expectedIntegrationGeneration,
              ),
              eq(schema.providerSyncJobs.provider, "strava"),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, input.workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
              sql`exists (
                select 1 from integrations
                where integrations.id = ${schema.providerSyncJobs.integration_id}
                  and integrations.profile_id = ${schema.providerSyncJobs.profile_id}
                  and integrations.provider = 'strava'
                  and integrations.lifecycle_status = 'active'
                  and integrations.generation = ${input.expectedIntegrationGeneration}
              )`,
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (!updated) return false;
        await tx
          .insert(schema.providerSyncState)
          .values({
            integration_id: input.integrationId,
            provider: "strava",
            resource: STRAVA_HISTORY_RESOURCE,
            sync_mode: "manual",
            high_watermark: new Date(input.highWatermark),
            metadata: input.metadata,
            consecutive_failures: 0,
            last_sync_started_at: now,
            last_sync_succeeded_at: now,
          })
          .onConflictDoUpdate({
            target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
            set: {
              consecutive_failures: 0,
              high_watermark: sql`greatest(coalesce(${schema.providerSyncState.high_watermark}, ${new Date(input.highWatermark)}), ${new Date(input.highWatermark)})`,
              last_error: null,
              last_sync_succeeded_at: now,
              metadata: input.metadata,
              updated_at: now,
            },
          });
        return true;
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
            eq(schema.integrations.provider, "strava"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, generation),
          ),
        )
        .limit(1);
      return Boolean(row);
    },

    async findIntegrationByProfileId(profileId) {
      const [row] = await db
        .select({
          accessToken: schema.integrationCredentials.access_token,
          credentialGeneration: schema.integrationCredentials.generation,
          expiresAt: schema.integrationCredentials.expires_at,
          externalId: schema.integrations.external_id,
          id: schema.integrations.id,
          integrationGeneration: schema.integrations.generation,
          lifecycleStatus: schema.integrations.lifecycle_status,
          profileId: schema.integrations.profile_id,
          reconnectRequiredAt: schema.integrationCredentials.reconnect_required_at,
          refreshToken: schema.integrationCredentials.refresh_token,
          scope: schema.integrationCredentials.scope,
        })
        .from(schema.integrations)
        .innerJoin(
          schema.integrationCredentials,
          eq(schema.integrationCredentials.integration_id, schema.integrations.id),
        )
        .where(
          and(
            eq(schema.integrations.profile_id, profileId),
            eq(schema.integrations.provider, "strava"),
            eq(schema.integrations.lifecycle_status, "active"),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        ...row,
        accessToken: decryptProviderToken(row.accessToken),
        refreshToken: decryptNullableProviderToken(row.refreshToken),
        expiresAt: toIso(row.expiresAt),
        reconnectRequiredAt: toIso(row.reconnectRequiredAt),
        lifecycleStatus: row.lifecycleStatus as "active",
      };
    },

    async updateIntegrationTokens(input) {
      const [updated] = await db
        .update(schema.integrationCredentials)
        .set({
          access_token: encryptProviderToken(input.accessToken),
          expires_at: new Date(input.expiresAt),
          generation: sql`${schema.integrationCredentials.generation} + 1`,
          reconnect_required_at: null,
          refresh_token: encryptProviderToken(input.refreshToken),
          updated_at: new Date(),
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrationCredentials.integration_id, input.id),
            eq(schema.integrationCredentials.generation, input.expectedCredentialGeneration),
            isNull(schema.integrationCredentials.reconnect_required_at),
            eq(schema.integrations.id, input.id),
            eq(schema.integrations.provider, "strava"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, input.expectedIntegrationGeneration),
          ),
        )
        .returning({ generation: schema.integrationCredentials.generation });
      return updated?.generation ?? null;
    },

    async markReconnectRequired(input) {
      const [updated] = await db
        .update(schema.integrationCredentials)
        .set({
          generation: sql`${schema.integrationCredentials.generation} + 1`,
          reconnect_required_at: new Date(),
          updated_at: new Date(),
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrationCredentials.integration_id, input.id),
            eq(schema.integrationCredentials.generation, input.expectedCredentialGeneration),
            isNull(schema.integrationCredentials.reconnect_required_at),
            eq(schema.integrations.id, input.id),
            eq(schema.integrations.provider, "strava"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, input.expectedIntegrationGeneration),
          ),
        )
        .returning({ id: schema.integrationCredentials.integration_id });
      return Boolean(updated);
    },

    async findDirectActivitySource({ profileId, providerExternalId }) {
      const [row] = await db
        .select({
          activityId: schema.activitySourceReferences.activity_id,
          providerRevision: schema.activitySourceReferences.provider_revision,
          resolutionStatus: schema.activitySourceReferences.resolution_status,
        })
        .from(schema.activitySourceReferences)
        .where(
          and(
            eq(schema.activitySourceReferences.profile_id, profileId),
            eq(schema.activitySourceReferences.provider, "strava"),
            eq(schema.activitySourceReferences.provider_external_id, providerExternalId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async findIntegrationByExternalId(externalId) {
      const [row] = await db
        .select({
          accessToken: schema.integrationCredentials.access_token,
          credentialGeneration: schema.integrationCredentials.generation,
          expiresAt: schema.integrationCredentials.expires_at,
          externalId: schema.integrations.external_id,
          id: schema.integrations.id,
          integrationGeneration: schema.integrations.generation,
          lifecycleStatus: schema.integrations.lifecycle_status,
          profileId: schema.integrations.profile_id,
          reconnectRequiredAt: schema.integrationCredentials.reconnect_required_at,
          refreshToken: schema.integrationCredentials.refresh_token,
          scope: schema.integrationCredentials.scope,
        })
        .from(schema.integrations)
        .innerJoin(
          schema.integrationCredentials,
          eq(schema.integrationCredentials.integration_id, schema.integrations.id),
        )
        .where(
          and(
            eq(schema.integrations.external_id, externalId),
            eq(schema.integrations.provider, "strava"),
            eq(schema.integrations.lifecycle_status, "active"),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        ...row,
        accessToken: decryptProviderToken(row.accessToken),
        refreshToken: decryptNullableProviderToken(row.refreshToken),
        expiresAt: toIso(row.expiresAt),
        reconnectRequiredAt: toIso(row.reconnectRequiredAt),
        lifecycleStatus: row.lifecycleStatus as "active",
      };
    },

    async listActiveJobs({ profileId, limit = 50 }) {
      const rows = await db
        .select()
        .from(schema.providerSyncJobs)
        .where(
          and(
            eq(schema.providerSyncJobs.profile_id, profileId),
            eq(schema.providerSyncJobs.provider, "strava"),
            inArray(schema.providerSyncJobs.status, ["queued", "running"]),
          ),
        )
        .orderBy(asc(schema.providerSyncJobs.queue_sequence))
        .limit(Math.min(100, Math.max(1, limit)));
      return rows.map(mapJob);
    },

    async readHistorySyncState(integrationId) {
      const [row] = await db
        .select({
          lastError: schema.providerSyncState.last_error,
          lastFailedAt: schema.providerSyncState.last_sync_failed_at,
          lastSucceededAt: schema.providerSyncState.last_sync_succeeded_at,
        })
        .from(schema.providerSyncState)
        .where(
          and(
            eq(schema.providerSyncState.integration_id, integrationId),
            eq(schema.providerSyncState.provider, "strava"),
            eq(schema.providerSyncState.resource, STRAVA_HISTORY_RESOURCE),
          ),
        )
        .limit(1);
      return row
        ? {
            lastError: row.lastError,
            lastFailedAt: toIso(row.lastFailedAt),
            lastSucceededAt: toIso(row.lastSucceededAt),
          }
        : null;
    },

    async requestProviderDisconnect({ profileId, provider }) {
      if (provider !== "strava") throw new Error("Strava lifecycle rejected another provider");
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
              eq(schema.integrations.provider, "strava"),
            ),
          )
          .limit(1)
          .for("update");
        if (!integration) {
          return {
            generation: null,
            integrationId: null,
            jobId: null,
            status: "not_found" as const,
          };
        }
        if (integration.lifecycle_status === "disconnected") {
          return {
            generation: integration.generation,
            integrationId: integration.id,
            jobId: null,
            status: "disconnected" as const,
          };
        }
        if (!isStravaIntegrationEnabled()) {
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
            .delete(schema.integrationCredentials)
            .where(eq(schema.integrationCredentials.integration_id, integration.id));
          await tx
            .update(schema.providerSyncJobs)
            .set({
              last_error: "strava_runtime_disabled_local_disconnect",
              lock_expires_at: null,
              locked_at: null,
              locked_by: null,
              status: "completed",
              updated_at: now,
            })
            .where(
              and(
                eq(schema.providerSyncJobs.integration_id, integration.id),
                inArray(schema.providerSyncJobs.status, activeJobStatuses),
              ),
            );
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
              last_error: "integration_generation_inactive",
              lock_expires_at: null,
              locked_at: null,
              locked_by: null,
              status: "completed",
              updated_at: now,
            })
            .where(
              and(
                eq(schema.providerSyncJobs.integration_id, integration.id),
                sql`${schema.providerSyncJobs.job_type} <> ${STRAVA_DISCONNECT_JOB}`,
                inArray(schema.providerSyncJobs.status, activeJobStatuses),
              ),
            );
        }
        const job = await enqueueInTransaction(tx, {
          dedupeKey: `strava.disconnect:${integration.id}:${generation}`,
          integrationGeneration: generation,
          integrationId: integration.id,
          jobType: STRAVA_DISCONNECT_JOB,
          payload: { expectedGeneration: generation },
          priority: 0,
          profileId,
          provider: "strava",
          runAt: now.toISOString(),
        });
        return {
          generation,
          integrationId: integration.id,
          jobId: job.id,
          status: "pending" as const,
        };
      });
    },

    async beginProviderDisconnectAttempt({ generation, integrationId, jobId, provider, workerId }) {
      if (provider !== "strava") throw new Error("Strava lifecycle rejected another provider");
      return db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .update(schema.providerSyncJobs)
          .set({ last_error: "disconnect_attempt_uncertain", updated_at: now })
          .where(
            and(
              eq(schema.providerSyncJobs.id, jobId),
              eq(schema.providerSyncJobs.integration_id, integrationId),
              eq(schema.providerSyncJobs.integration_generation, generation),
              eq(schema.providerSyncJobs.job_type, STRAVA_DISCONNECT_JOB),
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
          .where(
            and(
              eq(schema.integrations.id, integrationId),
              eq(schema.integrations.provider, "strava"),
            ),
          )
          .limit(1)
          .for("update");
        if (
          !integration ||
          integration.generation !== generation ||
          integration.lifecycleStatus !== "disconnect_pending"
        ) {
          return { disposition: "superseded" as const };
        }
        const [credentials] = await tx
          .select({ accessToken: schema.integrationCredentials.access_token })
          .from(schema.integrationCredentials)
          .where(eq(schema.integrationCredentials.integration_id, integrationId))
          .limit(1);
        if (!credentials) return { disposition: "invalid" as const };
        return {
          disposition: "ready" as const,
          accessToken: decryptProviderToken(credentials.accessToken),
        };
      });
    },

    async finalizeProviderDisconnect({
      generation,
      integrationId,
      jobId,
      outcome,
      provider,
      workerId,
    }) {
      if (provider !== "strava") throw new Error("Strava lifecycle rejected another provider");
      return db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .select({ id: schema.providerSyncJobs.id })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.id, jobId),
              eq(schema.providerSyncJobs.integration_id, integrationId),
              eq(schema.providerSyncJobs.integration_generation, generation),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, workerId),
            ),
          )
          .limit(1)
          .for("update");
        if (!job) return false;
        if (outcome === "confirmed") {
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
                eq(schema.integrations.provider, "strava"),
                eq(schema.integrations.generation, generation),
                eq(schema.integrations.lifecycle_status, "disconnect_pending"),
              ),
            )
            .returning({ id: schema.integrations.id });
          if (!integration) return false;
          await tx
            .delete(schema.integrationCredentials)
            .where(eq(schema.integrationCredentials.integration_id, integrationId));
        }
        await tx
          .update(schema.providerSyncJobs)
          .set({
            last_error:
              outcome === "confirmed"
                ? null
                : outcome === "retry"
                  ? "strava_deauthorization_retry"
                  : "strava_deauthorization_dead_lettered",
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            run_at: outcome === "retry" ? new Date(now.getTime() + 5 * 60_000) : undefined,
            status:
              outcome === "confirmed"
                ? "completed"
                : outcome === "retry"
                  ? "failed"
                  : "dead_lettered",
            updated_at: now,
          })
          .where(eq(schema.providerSyncJobs.id, jobId));
        return true;
      });
    },
  };
}
