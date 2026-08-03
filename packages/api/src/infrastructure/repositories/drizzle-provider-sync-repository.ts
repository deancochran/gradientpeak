import { schema } from "@repo/db";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { decryptProviderToken } from "../../lib/provider-token-crypto";
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

/** Only durable, provider-neutral failure categories may cross the job/state boundary. */
function toBoundedProviderSyncError(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "activity_history_failed") return "activity_history_failed";
  if (normalized === "activity_history_budget_exceeded") return "activity_history_budget_exceeded";
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
  return "provider_sync_failed";
}

type ProviderSyncJobSqlRow = {
  attempt: number;
  dedupeKey: string | null;
  id: string;
  integrationId: string;
  integrationGeneration: number;
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
        const boundedError = toBoundedProviderSyncError(lastError);
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
      return db.transaction((tx) => this.enqueueJobInTransaction(tx, input));
    },

    async enqueueJobInTransaction(tx, input) {
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
          const queuedJob = coalescibleQueuedJobs[0];

          if (queuedJob) {
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
      })();
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
            provider_sync_jobs.integration_generation as "integrationGeneration",
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
            last_error: input.lastError ? toBoundedProviderSyncError(input.lastError) : null,
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
            last_error: input.lastError ? toBoundedProviderSyncError(input.lastError) : null,
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
          last_error: lastError ? toBoundedProviderSyncError(lastError) : null,
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
          last_error: toBoundedProviderSyncError(lastError),
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
      const boundedError = toBoundedProviderSyncError(lastError);
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
}
