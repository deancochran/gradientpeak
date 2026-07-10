import {
  type AthleteIntelligenceRecomputeJobRow,
  athleteIntelligencePredictions,
  athleteIntelligenceSnapshots,
  type DrizzleDbClient,
} from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { AthleteIntelligenceStore } from "../../application/athlete-intelligence/repository";

type SqlResult<Row> = { rows: Row[] };

function firstRow<Row>(result: unknown): Row | null {
  return ((result as SqlResult<Row>).rows ?? [])[0] ?? null;
}

function json(value: unknown) {
  return sql`${JSON.stringify(value)}::jsonb`;
}

export function createDrizzleAthleteIntelligenceRepository(
  db: DrizzleDbClient,
): AthleteIntelligenceStore {
  return {
    async getOrCreateSnapshot(input) {
      const [created] = await db
        .insert(athleteIntelligenceSnapshots)
        .values({
          input_fingerprint: input.inputFingerprint,
          payload: input.payload,
          profile_id: input.profileId,
          schema_version: input.schemaVersion,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return created;

      const [existing] = await db
        .select()
        .from(athleteIntelligenceSnapshots)
        .where(
          and(
            eq(athleteIntelligenceSnapshots.profile_id, input.profileId),
            eq(athleteIntelligenceSnapshots.input_fingerprint, input.inputFingerprint),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Snapshot idempotency conflict did not return a row");
      return existing;
    },

    async getOrCreatePrediction(input) {
      const [created] = await db
        .insert(athleteIntelligencePredictions)
        .values({
          model_version: input.modelVersion,
          payload: input.payload,
          prediction_kind: input.predictionKind,
          profile_id: input.profileId,
          scenario_key: input.scenarioKey,
          schema_version: input.schemaVersion,
          snapshot_id: input.snapshotId,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return created;

      const [existing] = await db
        .select()
        .from(athleteIntelligencePredictions)
        .where(
          and(
            eq(athleteIntelligencePredictions.profile_id, input.profileId),
            eq(athleteIntelligencePredictions.snapshot_id, input.snapshotId),
            eq(athleteIntelligencePredictions.model_version, input.modelVersion),
            eq(athleteIntelligencePredictions.prediction_kind, input.predictionKind),
            eq(athleteIntelligencePredictions.scenario_key, input.scenarioKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Prediction idempotency conflict did not return a row");
      return existing;
    },

    async coalesceRecomputeJob(input) {
      const result = await db.execute(sql<AthleteIntelligenceRecomputeJobRow>`
        INSERT INTO athlete_intelligence_recompute_jobs (
          profile_id, target_input_fingerprint, reason_codes, status, run_at, created_at, updated_at
        ) VALUES (
          ${input.profileId}, ${input.inputFingerprint}, ${json(input.reasonCodes)}, 'queued',
          ${input.now}, ${input.now}, ${input.now}
        )
        ON CONFLICT (profile_id) WHERE status IN ('queued', 'running') DO UPDATE SET
          target_input_fingerprint = EXCLUDED.target_input_fingerprint,
          reason_codes = (
            SELECT COALESCE(jsonb_agg(DISTINCT reason_code ORDER BY reason_code), '[]'::jsonb)
            FROM jsonb_array_elements_text(
              athlete_intelligence_recompute_jobs.reason_codes || EXCLUDED.reason_codes
            ) AS reason_code
          ),
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `);
      const row = firstRow<AthleteIntelligenceRecomputeJobRow>(result);
      if (!row) throw new Error("Failed to create or coalesce recompute job");
      return row;
    },

    async claimNextRecomputeJob(input) {
      await db.execute(sql`
        UPDATE athlete_intelligence_recompute_jobs
        SET status = 'failed', locked_at = NULL, lock_expires_at = NULL, locked_by = NULL,
            last_error = 'lease_expired_max_attempts', updated_at = ${input.now}
        WHERE status = 'running' AND lock_expires_at < ${input.now}
          AND attempt_count >= max_attempts
      `);
      const result = await db.execute(sql<AthleteIntelligenceRecomputeJobRow>`
        WITH candidate AS (
          SELECT id
          FROM athlete_intelligence_recompute_jobs
          WHERE attempt_count < max_attempts AND (
            (status = 'queued' AND run_at <= ${input.now}) OR
            (status = 'running' AND lock_expires_at < ${input.now})
          )
          ORDER BY run_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE athlete_intelligence_recompute_jobs AS job
        SET status = 'running', attempt_count = job.attempt_count + 1,
            locked_at = ${input.now}, lock_expires_at = ${input.leaseExpiresAt},
            locked_by = ${input.workerId}, last_error = NULL, updated_at = ${input.now}
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.*
      `);
      return firstRow<AthleteIntelligenceRecomputeJobRow>(result);
    },

    async completeRecomputeJob(input) {
      const completed = await db.execute(sql<AthleteIntelligenceRecomputeJobRow>`
        UPDATE athlete_intelligence_recompute_jobs
        SET status = 'completed', locked_at = NULL, lock_expires_at = NULL, locked_by = NULL,
            last_error = NULL, updated_at = ${input.now}
        WHERE id = ${input.jobId} AND profile_id = ${input.profileId}
          AND status = 'running' AND locked_by = ${input.workerId}
          AND lock_expires_at = ${input.expectedLeaseExpiresAt}
          AND lock_expires_at > ${input.now}
          AND target_input_fingerprint = ${input.expectedInputFingerprint}
        RETURNING *
      `);
      if (firstRow<AthleteIntelligenceRecomputeJobRow>(completed)) return "completed";

      const superseded = await db.execute(sql<AthleteIntelligenceRecomputeJobRow>`
        UPDATE athlete_intelligence_recompute_jobs
        SET status = 'queued', locked_at = NULL, lock_expires_at = NULL, locked_by = NULL,
            run_at = ${input.now}, updated_at = ${input.now}
        WHERE id = ${input.jobId} AND profile_id = ${input.profileId}
          AND status = 'running' AND locked_by = ${input.workerId}
          AND lock_expires_at = ${input.expectedLeaseExpiresAt}
          AND lock_expires_at > ${input.now}
          AND target_input_fingerprint <> ${input.expectedInputFingerprint}
        RETURNING *
      `);
      return firstRow<AthleteIntelligenceRecomputeJobRow>(superseded) ? "superseded" : "not_owned";
    },

    async failRecomputeJob(input) {
      const failed = await db.execute(sql<AthleteIntelligenceRecomputeJobRow>`
        UPDATE athlete_intelligence_recompute_jobs
        SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
            locked_at = NULL, lock_expires_at = NULL, locked_by = NULL,
            last_error = ${input.error}, run_at = ${input.retryAt}, updated_at = ${input.now}
        WHERE id = ${input.jobId} AND profile_id = ${input.profileId}
          AND status = 'running' AND locked_by = ${input.workerId}
          AND lock_expires_at = ${input.expectedLeaseExpiresAt}
          AND lock_expires_at > ${input.now}
          AND target_input_fingerprint = ${input.expectedInputFingerprint}
        RETURNING *
      `);
      const row = firstRow<AthleteIntelligenceRecomputeJobRow>(failed);
      if (row) return row.status === "failed" ? "failed" : "requeued";

      const superseded = await db.execute(sql<AthleteIntelligenceRecomputeJobRow>`
        UPDATE athlete_intelligence_recompute_jobs
        SET status = 'queued', locked_at = NULL, lock_expires_at = NULL, locked_by = NULL,
            run_at = ${input.now}, updated_at = ${input.now}
        WHERE id = ${input.jobId} AND profile_id = ${input.profileId}
          AND status = 'running' AND locked_by = ${input.workerId}
          AND lock_expires_at = ${input.expectedLeaseExpiresAt}
          AND lock_expires_at > ${input.now}
          AND target_input_fingerprint <> ${input.expectedInputFingerprint}
        RETURNING *
      `);
      return firstRow<AthleteIntelligenceRecomputeJobRow>(superseded) ? "superseded" : "not_owned";
    },
  };
}
