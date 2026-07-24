import { schema } from "@repo/db";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import type {
  CreateProviderSyncRepositoryOptions,
  ProviderSyncJobRecord,
  ProviderSyncRepository,
} from "../../repositories/provider-sync-repository";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

type ProviderSyncJobSqlRow = {
  attempt: number;
  dedupeKey: string | null;
  id: string;
  integrationId: string;
  internalResourceId: string | null;
  jobType: string;
  lastError: string | null;
  maxAttempts: number;
  operation: string | null;
  payload: unknown;
  payloadHash: string | null;
  profileId: string;
  provider: ProviderSyncJobRecord["provider"];
  queueSequence?: number;
  resourceKind: ProviderSyncJobRecord["resourceKind"];
  runAt: Date | string;
  staleLockRecovered?: boolean;
  status: string;
  supersedesJobId: string | null;
  syncLaneKey: string | null;
  updatedAt?: Date | string;
};

function mapProviderSyncJobRow(row: ProviderSyncJobSqlRow): ProviderSyncJobRecord {
  return {
    ...row,
    runAt: row.runAt instanceof Date ? row.runAt.toISOString() : row.runAt,
    status: row.status as ProviderSyncJobRecord["status"],
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export function createProviderSyncRepository({
  db,
}: CreateProviderSyncRepositoryOptions): ProviderSyncRepository {
  return {
    async completeJobWithSyncState({
      highWatermark,
      id,
      integrationId,
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
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, workerId),
              gt(schema.providerSyncJobs.lock_expires_at, now),
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

    async getQueueTelemetry({ jobTypes, now, provider }) {
      const result = await db.execute(sql<{
        deadLetterDepth: number | string;
        oldestDueAt: Date | string | null;
        queueDepth: number | string;
      }>`
        select
          count(*) filter (
            where status in ('queued', 'failed', 'running')
              and run_at <= ${new Date(now)}
              and (lock_expires_at is null or lock_expires_at <= ${new Date(now)})
          ) as "queueDepth",
          min(run_at) filter (
            where status in ('queued', 'failed', 'running')
              and run_at <= ${new Date(now)}
              and (lock_expires_at is null or lock_expires_at <= ${new Date(now)})
          ) as "oldestDueAt",
          count(*) filter (where status = 'dead_lettered') as "deadLetterDepth"
        from provider_sync_jobs
        where (${provider ?? null}::text is null or provider = ${provider ?? null}::integration_provider)
          and ${
            jobTypes?.length
              ? sql`job_type = any(array[${sql.join(jobTypes, sql`, `)}]::text[])`
              : sql`true`
          }
      `);
      const row = getSqlRows<{
        deadLetterDepth: number | string;
        oldestDueAt: Date | string | null;
        queueDepth: number | string;
      }>(result)[0];
      return {
        deadLetterDepth: Number(row?.deadLetterDepth ?? 0),
        oldestDueAt:
          row?.oldestDueAt instanceof Date
            ? row.oldestDueAt.toISOString()
            : (row?.oldestDueAt ?? null),
        queueDepth: Number(row?.queueDepth ?? 0),
      };
    },
    async enqueueJob(input) {
      return db.transaction(async (tx) => {
        const lockIdentities = [
          input.syncLaneKey ? JSON.stringify(["provider-sync", "lane", input.syncLaneKey]) : null,
          input.dedupeKey ? JSON.stringify(["provider-sync", "dedupe", input.dedupeKey]) : null,
        ]
          .filter((identity): identity is string => identity !== null)
          .sort();

        for (const identity of lockIdentities) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity}, 0))`);
        }

        const desiredQueuedValues = {
          dedupe_key: input.dedupeKey ?? null,
          integration_id: input.integrationId,
          internal_resource_id: input.internalResourceId ?? null,
          job_type: input.jobType,
          max_attempts: input.maxAttempts ?? 8,
          operation: input.operation ?? null,
          payload: input.payload,
          payload_hash: input.payloadHash ?? null,
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
              jobType: schema.providerSyncJobs.job_type,
              operation: schema.providerSyncJobs.operation,
              payloadHash: schema.providerSyncJobs.payload_hash,
              payloadMatches: sql<boolean>`${schema.providerSyncJobs.payload} = ${JSON.stringify(input.payload)}::jsonb`,
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
          const queuedJob = queuedJobs[0];

          if (queuedJob) {
            await tx
              .update(schema.providerSyncJobs)
              .set(desiredQueuedValues)
              .where(eq(schema.providerSyncJobs.id, queuedJob.id));

            const redundantQueuedJobIds = queuedJobs.slice(1).map((job) => job.id);
            if (redundantQueuedJobIds.length > 0) {
              await tx
                .delete(schema.providerSyncJobs)
                .where(inArray(schema.providerSyncJobs.id, redundantQueuedJobIds));
            }

            return { id: queuedJob.id, status: "queued" };
          }

          const runningJob = activeLaneJobs.find((job) => job.status === "running");
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
            .select({ id: schema.providerSyncJobs.id, status: schema.providerSyncJobs.status })
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
            if (existing.status === "queued") {
              await tx
                .update(schema.providerSyncJobs)
                .set(desiredQueuedValues)
                .where(eq(schema.providerSyncJobs.id, existing.id));
            }

            return {
              id: existing.id,
              status: existing.status as ProviderSyncJobRecord["status"],
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
          status: created.status as ProviderSyncJobRecord["status"],
        };
      });
    },

    async claimDueJobs({ jobTypes, limit, now, workerId, lockExpiresAt, provider }) {
      return db.transaction(async (tx) => {
        const result = await tx.execute(sql<ProviderSyncJobSqlRow>`
          with candidate_rows as (
            select provider_sync_jobs.*
            from provider_sync_jobs
            where (${provider ?? null}::text is null or provider = ${provider ?? null}::integration_provider)
              and ${
                jobTypes?.length
                  ? sql`job_type = any(array[${sql.join(jobTypes, sql`, `)}]::text[])`
                  : sql`true`
              }
              and status in ('queued', 'failed', 'running')
              and run_at <= ${new Date(now)}
              and (lock_expires_at is null or lock_expires_at <= ${new Date(now)})
              and (
                sync_lane_key is null
                or not exists (
                  select 1
                  from provider_sync_jobs earlier_provider_sync_jobs
                  where earlier_provider_sync_jobs.sync_lane_key = provider_sync_jobs.sync_lane_key
                    and earlier_provider_sync_jobs.status in ('queued', 'failed', 'running')
                    and earlier_provider_sync_jobs.queue_sequence < provider_sync_jobs.queue_sequence
                )
              )
              and (
                sync_lane_key is null
                or not exists (
                  select 1
                  from provider_sync_jobs running_provider_sync_jobs
                  where running_provider_sync_jobs.sync_lane_key = provider_sync_jobs.sync_lane_key
                    and running_provider_sync_jobs.status = 'running'
                    and running_provider_sync_jobs.lock_expires_at > ${new Date(now)}
                )
              )
            order by priority asc, run_at asc
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
          update provider_sync_jobs
          set
            attempt = provider_sync_jobs.attempt + 1,
            lock_expires_at = ${new Date(lockExpiresAt)},
            locked_at = ${new Date(now)},
            locked_by = ${workerId},
            status = 'running',
            updated_at = ${new Date(now)}
          from selected_rows
          where provider_sync_jobs.id = selected_rows.id
          returning
            provider_sync_jobs.attempt,
            provider_sync_jobs.dedupe_key as "dedupeKey",
            provider_sync_jobs.id,
            provider_sync_jobs.integration_id as "integrationId",
            provider_sync_jobs.internal_resource_id as "internalResourceId",
            provider_sync_jobs.job_type as "jobType",
            provider_sync_jobs.last_error as "lastError",
            provider_sync_jobs.max_attempts as "maxAttempts",
            provider_sync_jobs.operation,
            provider_sync_jobs.payload,
            provider_sync_jobs.payload_hash as "payloadHash",
            provider_sync_jobs.profile_id as "profileId",
            provider_sync_jobs.provider,
            selected_rows.queue_sequence as "queueSequence",
            provider_sync_jobs.resource_kind as "resourceKind",
            provider_sync_jobs.run_at as "runAt",
            selected_rows.stale_lock_recovered as "staleLockRecovered",
            provider_sync_jobs.status,
            provider_sync_jobs.supersedes_job_id as "supersedesJobId",
            provider_sync_jobs.sync_lane_key as "syncLaneKey"
        `);

        return getSqlRows<ProviderSyncJobSqlRow>(result).map(mapProviderSyncJobRow);
      });
    },

    async markJobSucceeded(id, workerId) {
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
            last_error: input.lastError ?? null,
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
            last_error: input.lastError ?? null,
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
      if (input.providerEventId && input.providerAccountId) {
        const [existing] = await db
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
          return { id: existing.id, inserted: false };
        }
      }

      const [created] = await db
        .insert(schema.providerWebhookReceipts)
        .values({
          event_type: input.eventType,
          integration_id: input.integrationId,
          object_id: input.objectId,
          object_type: input.objectType,
          payload: input.payload,
          payload_hash: input.payloadHash,
          processing_status: "pending",
          provider: input.provider,
          provider_account_id: input.providerAccountId,
          provider_event_id: input.providerEventId,
        })
        .returning({ id: schema.providerWebhookReceipts.id });

      if (!created) {
        throw new Error("Failed to store provider webhook receipt");
      }

      return { id: created.id, inserted: true };
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
        .where(eq(schema.providerWebhookReceipts.id, id))
        .limit(1);

      return receipt
        ? {
            ...receipt,
            createdAt: toIsoString(receipt.createdAt),
            receivedAt: toIsoString(receipt.receivedAt),
          }
        : null;
    },

    async listJobs({
      internalResourceId,
      limit,
      order = "oldest_run_at",
      profileId,
      provider,
      statuses,
    }) {
      const rows = await db
        .select({
          attempt: schema.providerSyncJobs.attempt,
          dedupeKey: schema.providerSyncJobs.dedupe_key,
          id: schema.providerSyncJobs.id,
          integrationId: schema.providerSyncJobs.integration_id,
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
            provider ? eq(schema.providerSyncJobs.provider, provider) : undefined,
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

      return rows.map(mapProviderSyncJobRow);
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
        .where(inArray(schema.providerSyncState.integration_id, integrationIds));

      return rows.map((row) => ({
        ...row,
        highWatermark: toIsoString(row.highWatermark),
        lastSyncFailedAt: toIsoString(row.lastSyncFailedAt),
        lastSyncStartedAt: toIsoString(row.lastSyncStartedAt),
        lastSyncSucceededAt: toIsoString(row.lastSyncSucceededAt),
        nextSyncAt: toIsoString(row.nextSyncAt),
      }));
    },

    async listWebhookReceipts({ limit, provider, statuses }) {
      const rows = await db
        .select({
          createdAt: schema.providerWebhookReceipts.created_at,
          eventType: schema.providerWebhookReceipts.event_type,
          id: schema.providerWebhookReceipts.id,
          integrationId: schema.providerWebhookReceipts.integration_id,
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
            provider ? eq(schema.providerWebhookReceipts.provider, provider) : undefined,
            statuses?.length
              ? inArray(schema.providerWebhookReceipts.processing_status, statuses)
              : undefined,
          ),
        )
        .orderBy(asc(schema.providerWebhookReceipts.received_at))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        createdAt: toIsoString(row.createdAt),
        receivedAt: toIsoString(row.receivedAt),
      }));
    },

    async retryJob(id) {
      const [job] = await db
        .select({ status: schema.providerSyncJobs.status })
        .from(schema.providerSyncJobs)
        .where(eq(schema.providerSyncJobs.id, id))
        .limit(1);

      if (!job || (job.status !== "failed" && job.status !== "dead_lettered")) {
        return false;
      }

      await db
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
        .where(eq(schema.providerSyncJobs.id, id));

      return true;
    },

    async retryWebhookReceipt(id) {
      const [receipt] = await db
        .select({
          jobId: schema.providerWebhookReceipts.job_id,
          status: schema.providerWebhookReceipts.processing_status,
        })
        .from(schema.providerWebhookReceipts)
        .where(eq(schema.providerWebhookReceipts.id, id))
        .limit(1);

      if (!receipt || receipt.status !== "failed") {
        return false;
      }

      await db
        .update(schema.providerWebhookReceipts)
        .set({
          last_error: null,
          processed_at: null,
          processing_status: "pending",
        })
        .where(eq(schema.providerWebhookReceipts.id, id));

      if (receipt.jobId) {
        await db
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
          .where(eq(schema.providerSyncJobs.id, receipt.jobId));
      }

      return true;
    },

    async markWebhookReceiptProcessed({ id, lastError, status }) {
      await db
        .update(schema.providerWebhookReceipts)
        .set({
          last_error: lastError ?? null,
          processed_at: status === "processed" ? new Date() : null,
          processing_status: status,
        })
        .where(eq(schema.providerWebhookReceipts.id, id));
    },

    async markJobFailed({ id, lastError, nextRunAt, status, workerId }) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: lastError,
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
      await db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integrationId,
          provider,
          resource,
          sync_mode: "push_windowed",
          next_sync_at: nextSyncAt ? new Date(nextSyncAt) : null,
          last_error: lastError,
          consecutive_failures: 1,
          last_sync_failed_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            consecutive_failures: sql`${schema.providerSyncState.consecutive_failures} + 1`,
            last_error: lastError,
            last_sync_failed_at: new Date(),
            next_sync_at: nextSyncAt ? new Date(nextSyncAt) : schema.providerSyncState.next_sync_at,
            updated_at: new Date(),
          },
        });
    },
  };
}
