import { createHash, randomUUID } from "node:crypto";
import type { WahooSyncJobRecord, WahooSyncRepository } from "../../repositories";

export const WAHOO_STAGING_CLEANUP_JOB = "wahoo.staging_cleanup";
// Lower queue values run first. Cleanup is recoverable background maintenance,
// so keep it behind user-visible planned-workout publication and removal.
export const WAHOO_STAGING_CLEANUP_PRIORITY = 100;
/**
 * The production drain lease is capped at 30 minutes. Keep reservation cleanup
 * unavailable for 45 minutes so a normally bounded import cannot lose its
 * cleanup authority before its staging upload. Storage transport and response
 * body work are actively aborted within the runtime's 8–9 second request bound.
 * A possible late server commit is handled by the durable `uncertain` outcome,
 * not by a stronger timing claim.
 */
export const WAHOO_STAGING_CLEANUP_GRACE_MS = 45 * 60_000;

export type WahooStagingUploadOutcome = "uncertain" | "committed" | "not_started";
export type WahooStagingCleanupPayload = {
  path: string;
  uploadOutcome: WahooStagingUploadOutcome;
};

export interface WahooStagingCleanupReservation {
  reserve(input: {
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
    summaryId: number;
  }): Promise<{
    path: string;
    recordOutcome(outcome: Exclude<WahooStagingUploadOutcome, "uncertain">): Promise<boolean>;
  }>;
}

function hashIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stagingPath(input: {
  attemptId: string;
  integrationGeneration: number;
  integrationId: string;
  profileId: string;
  summaryId: number;
}) {
  return `activities/${input.profileId}/providers/wahoo/staging/${input.integrationId}/${input.integrationGeneration}/${input.summaryId}/${input.attemptId}.fit`;
}

export function createWahooStagingCleanupReservation(input: {
  providerSyncRepository: Pick<WahooSyncRepository, "enqueueJob">;
  createAttemptId?: () => string;
  now?: () => Date;
}): WahooStagingCleanupReservation {
  return {
    async reserve({ integrationGeneration, integrationId, profileId, summaryId }) {
      if (!Number.isSafeInteger(summaryId) || summaryId < 0) {
        throw new Error("Invalid Wahoo activity summary identifier");
      }
      const path = stagingPath({
        attemptId: (input.createAttemptId ?? randomUUID)(),
        integrationGeneration,
        integrationId,
        profileId,
        summaryId,
      });
      const identity = hashIdentity(path);
      const runAt = new Date(
        (input.now?.() ?? new Date()).getTime() + WAHOO_STAGING_CLEANUP_GRACE_MS,
      ).toISOString();
      const enqueue = (uploadOutcome: WahooStagingUploadOutcome) =>
        input.providerSyncRepository.enqueueJob({
          dedupeKey: `wahoo.staging_cleanup:${identity}`,
          integrationGeneration,
          integrationId,
          jobType: WAHOO_STAGING_CLEANUP_JOB,
          operation: "cleanup",
          payload: { path, uploadOutcome },
          payloadHash: identity,
          priority: WAHOO_STAGING_CLEANUP_PRIORITY,
          profileId,
          provider: "wahoo",
          resourceKind: "activity",
          runAt,
          // A cleanup lane must be per attempt: sharing an integration lane would
          // coalesce queued paths and lose deletion authority for an earlier upload.
          syncLaneKey: `wahoo.staging_cleanup:${identity}`,
        });
      const reservationJob = await enqueue("uncertain");
      return {
        path,
        async recordOutcome(outcome) {
          try {
            // Only an update to this exact queued reservation is known to have
            // changed its outcome in place. enqueueJob may create a successor
            // beside a running original; that successor is durable, but the
            // importer must fail closed with the original still uncertain.
            const outcomeJob = await enqueue(outcome);
            return outcomeJob.status === "queued" && outcomeJob.id === reservationJob.id;
          } catch {
            // Retain the original uncertain reservation if a fence or durable
            // update race prevents recording a known outcome.
            return false;
          }
        },
      };
    },
  };
}

/** Validate both the durable payload and the claimed job's ownership fields. */
export function isWahooStagingCleanupPayload(
  value: unknown,
  job: Pick<WahooSyncJobRecord, "integrationGeneration" | "integrationId" | "profileId">,
): value is WahooStagingCleanupPayload {
  if (
    !value ||
    typeof value !== "object" ||
    !("path" in value) ||
    typeof value.path !== "string" ||
    !("uploadOutcome" in value) ||
    (value.uploadOutcome !== "uncertain" &&
      value.uploadOutcome !== "committed" &&
      value.uploadOutcome !== "not_started")
  ) {
    return false;
  }
  const generation = job.integrationGeneration;
  if (!Number.isSafeInteger(generation) || !generation || !job.profileId || !job.integrationId)
    return false;
  const prefix = `activities/${job.profileId}/providers/wahoo/staging/${job.integrationId}/${generation}/`;
  const suffix = ".fit";
  if (!value.path.startsWith(prefix) || !value.path.endsWith(suffix)) return false;
  const remainder = value.path.slice(prefix.length, -suffix.length).split("/");
  return (
    remainder.length === 2 &&
    /^\d+$/.test(remainder[0] ?? "") &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      remainder[1] ?? "",
    )
  );
}
