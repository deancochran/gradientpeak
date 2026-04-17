import { type DrizzleDbClient, schema } from "@repo/db";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type {
  CreateProviderSyncRepositoryOptions,
  ProviderSyncJobRecord,
  ProviderSyncRepository,
} from "../../repositories/provider-sync-repository";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function createProviderSyncRepository({ db }: CreateProviderSyncRepositoryOptions): ProviderSyncRepository {
  return {
    async enqueueJob(input) {
      if (input.dedupeKey) {
        const [existing] = await db
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
          .limit(1);

        if (existing) {
          return {
            id: existing.id,
            status: existing.status as ProviderSyncJobRecord["status"],
          };
        }
      }

      const [created] = await db
        .insert(schema.providerSyncJobs)
        .values({
          dedupe_key: input.dedupeKey,
          integration_id: input.integrationId,
          internal_resource_id: input.internalResourceId,
          job_type: input.jobType,
          max_attempts: input.maxAttempts,
          payload: input.payload,
          profile_id: input.profileId,
          provider: input.provider,
          resource_kind: input.resourceKind,
          run_at: new Date(input.runAt),
          status: "queued",
        })
        .returning({ id: schema.providerSyncJobs.id, status: schema.providerSyncJobs.status });

      if (!created) {
        throw new Error("Failed to enqueue provider sync job");
      }

      return {
        id: created.id,
        status: created.status as ProviderSyncJobRecord["status"],
      };
    },

    async claimDueJobs({ jobTypes, limit, now, workerId, lockExpiresAt, provider }) {
      return db.transaction(async (tx) => {
        const dueJobs = await tx
          .select({
            attempt: schema.providerSyncJobs.attempt,
            dedupeKey: schema.providerSyncJobs.dedupe_key,
            id: schema.providerSyncJobs.id,
            integrationId: schema.providerSyncJobs.integration_id,
            internalResourceId: schema.providerSyncJobs.internal_resource_id,
            jobType: schema.providerSyncJobs.job_type,
            maxAttempts: schema.providerSyncJobs.max_attempts,
            payload: schema.providerSyncJobs.payload,
            profileId: schema.providerSyncJobs.profile_id,
            provider: schema.providerSyncJobs.provider,
            resourceKind: schema.providerSyncJobs.resource_kind,
            runAt: schema.providerSyncJobs.run_at,
            status: schema.providerSyncJobs.status,
          })
          .from(schema.providerSyncJobs)
          .where(
            and(
              provider ? eq(schema.providerSyncJobs.provider, provider) : undefined,
              jobTypes?.length ? inArray(schema.providerSyncJobs.job_type, jobTypes) : undefined,
              or(
                eq(schema.providerSyncJobs.status, "queued"),
                eq(schema.providerSyncJobs.status, "failed"),
              ),
              lte(schema.providerSyncJobs.run_at, new Date(now)),
              or(
                isNull(schema.providerSyncJobs.lock_expires_at),
                lte(schema.providerSyncJobs.lock_expires_at, new Date(now)),
              ),
            ),
          )
          .orderBy(asc(schema.providerSyncJobs.priority), asc(schema.providerSyncJobs.run_at))
          .limit(limit);

        for (const job of dueJobs) {
          await tx
            .update(schema.providerSyncJobs)
            .set({
              attempt: job.attempt + 1,
              lock_expires_at: new Date(lockExpiresAt),
              locked_at: new Date(now),
              locked_by: workerId,
              status: "running",
              updated_at: new Date(now),
            })
            .where(eq(schema.providerSyncJobs.id, job.id));
        }

        return dueJobs.map((job) => ({
          ...job,
          runAt: job.runAt.toISOString(),
          status: "running" as const,
        }));
      });
    },

    async markJobSucceeded(id) {
      await db
        .update(schema.providerSyncJobs)
        .set({
          last_error: null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          status: "completed",
          updated_at: new Date(),
        })
        .where(eq(schema.providerSyncJobs.id, id));
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

    async listJobs({ limit, provider, statuses }) {
      const rows = await db
        .select({
          attempt: schema.providerSyncJobs.attempt,
          dedupeKey: schema.providerSyncJobs.dedupe_key,
          id: schema.providerSyncJobs.id,
          integrationId: schema.providerSyncJobs.integration_id,
          internalResourceId: schema.providerSyncJobs.internal_resource_id,
          jobType: schema.providerSyncJobs.job_type,
          maxAttempts: schema.providerSyncJobs.max_attempts,
          payload: schema.providerSyncJobs.payload,
          profileId: schema.providerSyncJobs.profile_id,
          provider: schema.providerSyncJobs.provider,
          resourceKind: schema.providerSyncJobs.resource_kind,
          runAt: schema.providerSyncJobs.run_at,
          status: schema.providerSyncJobs.status,
        })
        .from(schema.providerSyncJobs)
        .where(
          and(
            provider ? eq(schema.providerSyncJobs.provider, provider) : undefined,
            statuses?.length ? inArray(schema.providerSyncJobs.status, statuses) : undefined,
          ),
        )
        .orderBy(asc(schema.providerSyncJobs.run_at))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        runAt: row.runAt.toISOString(),
        status: row.status as ProviderSyncJobRecord["status"],
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

    async markJobFailed({ id, lastError, nextRunAt, status }) {
      await db
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
        .where(eq(schema.providerSyncJobs.id, id));
    },

    async touchSyncState({ integrationId, metadata, nextSyncAt, provider, publishHorizonDays, resource, syncMode }) {
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
            metadata: metadata ? sql`${schema.providerSyncState.metadata} || ${JSON.stringify(metadata)}::jsonb` : schema.providerSyncState.metadata,
            next_sync_at: nextSyncAt ? new Date(nextSyncAt) : schema.providerSyncState.next_sync_at,
            provider,
            publish_horizon_days: publishHorizonDays ?? schema.providerSyncState.publish_horizon_days,
            sync_mode: syncMode,
            updated_at: new Date(),
          },
        });
    },

    async updateSyncStateAfterRun({ integrationId, nextSyncAt, provider, resource, succeeded }) {
      await db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integrationId,
          provider,
          resource,
          sync_mode: "push_windowed",
          next_sync_at: nextSyncAt ? new Date(nextSyncAt) : null,
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            consecutive_failures: succeeded ? 0 : sql`${schema.providerSyncState.consecutive_failures}`,
            last_error: succeeded ? null : schema.providerSyncState.last_error,
            last_sync_failed_at: succeeded ? schema.providerSyncState.last_sync_failed_at : new Date(),
            last_sync_started_at: new Date(),
            last_sync_succeeded_at: succeeded ? new Date() : schema.providerSyncState.last_sync_succeeded_at,
            next_sync_at: nextSyncAt ? new Date(nextSyncAt) : schema.providerSyncState.next_sync_at,
            updated_at: new Date(),
          },
        });
    },

    async updateSyncStateAfterFailure({ integrationId, lastError, nextSyncAt, provider, resource }) {
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
