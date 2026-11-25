import { createHash, randomUUID } from "node:crypto";
import {
  activityPlanStructureSchema,
  formatDateOnlyInTimeZone,
  ianaTimezoneSchema,
} from "@repo/core";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { resolveGarminCredentials } from "../../application/integrations/garmin-credentials";
import type { DrizzleTransactionClient } from "../../db";
import { GarminTrainingClient } from "../../lib/integrations/garmin/training-client";
import { projectGarminTrainingActivityPlan } from "../../lib/integrations/garmin/training-mapper";
import {
  executeGarminTrainingSyncJob,
  type GarminTrainingRecoveryPhase,
  type GarminTrainingSyncJob,
  type GarminTrainingSyncState,
  type GarminTrainingSyncStore,
} from "../../lib/provider-sync/planned-activities/garmin-training-sync";
import { createGarminCredentialRepository } from "../../repositories/garmin-credential-repository";

const GARMIN_TRAINING_JOB_TYPE = "garmin.training_planned_session";
const DEFAULT_LEASE_MS = 60_000;
const GARMIN_WINDOW_SESSION_LIMIT = 50;
const GARMIN_ADMISSION_PROFILE_LIMIT = 10;
const GARMIN_ADMISSION_SESSION_PAGE_SIZE = 5;
const GARMIN_ADMISSION_STATE_RESOURCE = "garmin.training_planned_session.admission";

function addCivilDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const metadataState = (value: unknown): GarminTrainingSyncState => {
  if (!value || typeof value !== "object") return { kind: "none" };
  const g = (value as { garminTraining?: unknown }).garminTraining;
  if (!g || typeof g !== "object") return { kind: "none" };
  const v = g as Record<string, unknown>;
  if (
    v.recoveryPhase === "workout_create" ||
    v.recoveryPhase === "schedule_create" ||
    v.recoveryPhase === "workout_update" ||
    v.recoveryPhase === "schedule_update" ||
    v.recoveryPhase === "schedule_delete" ||
    v.recoveryPhase === "workout_delete"
  )
    return { kind: "recovery_required", phase: v.recoveryPhase };
  if (typeof v.workoutId !== "number" || typeof v.ownerId !== "number") return { kind: "none" };
  return typeof v.scheduleId === "number" && typeof v.date === "string"
    ? {
        kind: "scheduled",
        workoutId: v.workoutId,
        ownerId: v.ownerId,
        scheduleId: v.scheduleId,
        date: v.date,
        ...(typeof v.appliedProjectionHash === "string"
          ? { appliedProjectionHash: v.appliedProjectionHash }
          : {}),
      }
    : {
        kind: "activityPlan",
        workoutId: v.workoutId,
        ownerId: v.ownerId,
        ...(typeof v.appliedProjectionHash === "string"
          ? { appliedProjectionHash: v.appliedProjectionHash }
          : {}),
      };
};

type GarminTrainingPhase = GarminTrainingRecoveryPhase;

function receiptMetadata(
  job: GarminTrainingSyncJob,
  phase: GarminTrainingPhase,
  outcome?: Record<string, number | string | null>,
) {
  // The projection hash is a digest, never the provider payload or credential.
  return {
    operationId: job.id,
    jobId: job.id,
    attempt: job.attempt ?? null,
    integrationGeneration: job.integrationGeneration,
    phase,
    payloadHash: job.desiredProjectionHash ?? null,
    ...(outcome ? { outcome } : {}),
  };
}

/** Production persistence for Garmin's one-activityPlan/one-schedule planned-session link. */
export function createDrizzleGarminTrainingSyncRepository(
  db: DrizzleDbClient,
  workerId: string,
): GarminTrainingSyncStore {
  const owned = (job: GarminTrainingSyncJob) =>
    and(
      eq(schema.providerSyncJobs.id, job.id),
      eq(schema.providerSyncJobs.provider, "garmin"),
      eq(schema.providerSyncJobs.integration_id, job.integrationId),
      eq(schema.providerSyncJobs.integration_generation, job.integrationGeneration),
      eq(schema.providerSyncJobs.profile_id, job.profileId),
      eq(schema.providerSyncJobs.status, "running"),
      eq(schema.providerSyncJobs.locked_by, workerId),
      ...(job.attempt === undefined ? [] : [eq(schema.providerSyncJobs.attempt, job.attempt)]),
      gt(schema.providerSyncJobs.lock_expires_at, new Date()),
    );
  // A returned response may arrive after the lease timestamp. It is still safe to
  // record if this worker remains the row's holder for the same immutable attempt;
  // a reclaimer increments attempt and replaces locked_by before it can write.
  const ownedAttempt = (job: GarminTrainingSyncJob) =>
    and(
      eq(schema.providerSyncJobs.id, job.id),
      eq(schema.providerSyncJobs.provider, "garmin"),
      eq(schema.providerSyncJobs.integration_id, job.integrationId),
      eq(schema.providerSyncJobs.integration_generation, job.integrationGeneration),
      eq(schema.providerSyncJobs.profile_id, job.profileId),
      eq(schema.providerSyncJobs.status, "running"),
      eq(schema.providerSyncJobs.locked_by, workerId),
      ...(job.attempt === undefined ? [] : [eq(schema.providerSyncJobs.attempt, job.attempt)]),
    );
  const active = (job: GarminTrainingSyncJob) =>
    sql`exists (select 1 from integrations i join integration_credentials c on c.integration_id = i.id where i.id = ${job.integrationId} and i.profile_id = ${job.profileId} and i.provider = 'garmin' and i.lifecycle_status = 'active' and i.generation = ${job.integrationGeneration} and c.reconnect_required_at is null)`;
  async function write(
    job: GarminTrainingSyncJob,
    state: GarminTrainingSyncState,
    receiptEvidence?: Record<string, number | string | null>,
  ) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const [claimed] = await tx
        .select({ id: schema.providerSyncJobs.id })
        .from(schema.providerSyncJobs)
        .where(and(owned(job), active(job)))
        .limit(1)
        .for("update");
      if (!claimed) return false;
      const metadata = {
        garminTraining:
          state.kind === "recovery_required"
            ? {
                recoveryPhase: state.phase,
                receipt: receiptMetadata(job, state.phase, receiptEvidence),
              }
            : state.kind === "none"
              ? {}
              : { ...state, integrationGeneration: job.integrationGeneration },
      };
      if (state.kind !== "none" && state.kind !== "recovery_required") {
        await tx
          .insert(schema.integrationResourceLinks)
          .values({
            id: randomUUID(),
            profile_id: job.profileId,
            integration_id: job.integrationId,
            provider: "garmin",
            resource_kind: "planned_session",
            internal_resource_id: job.plannedSessionId,
            external_id: String(state.workoutId),
            provider_metadata: metadata,
            synced_at: now,
            updated_at: now,
          })
          .onConflictDoUpdate({
            target: [
              schema.integrationResourceLinks.integration_id,
              schema.integrationResourceLinks.resource_kind,
              schema.integrationResourceLinks.internal_resource_id,
            ],
            set: {
              external_id: String(state.workoutId),
              provider_metadata: metadata,
              synced_at: now,
              updated_at: now,
            },
          });
      } else if (state.kind === "none") {
        await tx
          .delete(schema.integrationResourceLinks)
          .where(
            and(
              eq(schema.integrationResourceLinks.integration_id, job.integrationId),
              eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
              eq(schema.integrationResourceLinks.internal_resource_id, job.plannedSessionId),
            ),
          );
      }
      const [updated] = await tx
        .update(schema.providerSyncJobs)
        .set({
          payload: {
            plannedSessionId: job.plannedSessionId,
            garminTraining: metadata.garminTraining,
          },
          updated_at: now,
        })
        .where(and(owned(job), active(job)))
        .returning({ id: schema.providerSyncJobs.id });
      // The marker/link and receipt must commit together. If the lease elapsed
      // after the initial lock, throwing rolls back the link instead of allowing
      // a later worker to issue an unmarked create POST.
      if (!updated) throw new Error("garmin_training_lease_or_generation_lost");
      return true;
    });
  }
  /**
   * Authorization gates new provider I/O, not the durable evidence for I/O that
   * already completed. The claimed lease and immutable attempt number fence a
   * stale worker from overwriting a later claim's receipt.
   */
  async function writeCreateOutcome(
    job: GarminTrainingSyncJob,
    phase: "workout_create" | "schedule_create",
    outcome: Record<string, number | string>,
  ) {
    const [updated] = await db
      .update(schema.providerSyncJobs)
      .set({
        payload: {
          plannedSessionId: job.plannedSessionId,
          garminTraining: {
            recoveryPhase: phase,
            receipt: receiptMetadata(job, phase, outcome),
          },
        },
        updated_at: new Date(),
      })
      .where(ownedAttempt(job))
      .returning({ id: schema.providerSyncJobs.id });
    if (!updated) throw new Error("garmin_training_lease_or_attempt_lost");
  }
  return {
    async load(job) {
      // A pre-write receipt is authoritative over a stale link.  In particular,
      // schedule-create recovery must never be bypassed by a persisted activityPlan link.
      const [receipt] = await db
        .select({ payload: schema.providerSyncJobs.payload })
        .from(schema.providerSyncJobs)
        .where(eq(schema.providerSyncJobs.id, job.id))
        .limit(1);
      const receiptState = metadataState(receipt?.payload);
      if (receiptState.kind === "recovery_required") return receiptState;
      const [link] = await db
        .select({ providerMetadata: schema.integrationResourceLinks.provider_metadata })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.integration_id, job.integrationId),
            eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
            eq(schema.integrationResourceLinks.internal_resource_id, job.plannedSessionId),
          ),
        )
        .limit(1);
      // A link is evidence only for the generation that wrote it. Reconnects do
      // not inherit an old remote resource and blindly update/delete it.
      const linkGeneration =
        link?.providerMetadata && typeof link.providerMetadata === "object"
          ? (link.providerMetadata as { garminTraining?: { integrationGeneration?: unknown } })
              .garminTraining?.integrationGeneration
          : undefined;
      if (link && linkGeneration !== job.integrationGeneration) {
        // A previous connection may have created this remote resource. Its IDs
        // cannot safely be adopted, deleted, or overwritten by the new
        // generation, and treating it as `none` could issue a duplicate create.
        return { kind: "recovery_required", phase: "workout_update" };
      }
      return link ? metadataState(link.providerMetadata) : receiptState;
    },
    async isActiveAndGranted(job) {
      const [row] = await db
        .select({ id: schema.integrations.id })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, job.integrationId),
            eq(schema.integrations.profile_id, job.profileId),
            eq(schema.integrations.provider, "garmin"),
            eq(schema.integrations.generation, job.integrationGeneration),
            eq(schema.integrations.lifecycle_status, "active"),
            active(job),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
    async requireRecovery(job, phase, evidence) {
      if (!(await write(job, { kind: "recovery_required", phase }, evidence)))
        throw new Error("garmin_training_lease_or_generation_lost");
    },
    async recordActivityPlanOutcome(job, outcome) {
      await writeCreateOutcome(job, "workout_create", outcome);
    },
    async recordScheduleOutcome(job, outcome) {
      await writeCreateOutcome(job, "schedule_create", outcome);
    },
    async saveActivityPlan(job, link) {
      if (!(await write(job, { kind: "activityPlan", ...link })))
        throw new Error("garmin_training_lease_or_generation_lost");
    },
    async saveSchedule(job, link) {
      if (!(await write(job, { kind: "scheduled", ...link })))
        throw new Error("garmin_training_lease_or_generation_lost");
    },
    async clear(job) {
      if (!(await write(job, { kind: "none" })))
        throw new Error("garmin_training_lease_or_generation_lost");
    },
    async complete(job) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          status: "completed",
          last_error: null,
          locked_at: null,
          locked_by: null,
          lock_expires_at: null,
          updated_at: new Date(),
        })
        .where(and(owned(job), active(job)))
        .returning({ id: schema.providerSyncJobs.id });
      if (!updated) throw new Error("garmin_training_lease_or_generation_lost");
    },
    async fail(job, reason) {
      const [updated] = await db
        .update(schema.providerSyncJobs)
        .set({
          // A receipt proves an operation may have reached Garmin. Never make it
          // an automatic retry lane, even when the immediate error was a stale
          // authorization response rather than a transport exception.
          status: sql`case
            when coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') <> ''
              or ${reason === "recovery_required"}
              or ${job.attempt !== undefined && job.maxAttempts !== undefined && job.attempt >= job.maxAttempts}
            then 'dead_lettered'
            else 'failed'
          end`,
          last_error: reason,
          run_at:
            reason === "recovery_required"
              ? sql`${schema.providerSyncJobs.run_at}`
              : new Date(
                  Date.now() + 1_000 * 2 ** Math.min(6, Math.max(0, (job.attempt ?? 1) - 1)),
                ),
          // Retain immutable receipt ownership so an in-flight original response
          // can still be written after the lease timestamp. Terminal recovery is
          // manual, not a cleared lease for another worker to reinterpret.
          locked_at: sql`case when coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') <> '' then ${schema.providerSyncJobs.locked_at} else null end`,
          locked_by: sql`case when coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') <> '' then ${schema.providerSyncJobs.locked_by} else null end`,
          lock_expires_at: sql`case when coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') <> '' then ${schema.providerSyncJobs.lock_expires_at} else null end`,
          updated_at: new Date(),
        })
        .where(owned(job))
        .returning({ id: schema.providerSyncJobs.id });
      if (!updated) throw new Error("garmin_training_lease_lost");
    },
  };
}

type GarminTrainingCurrentSession = {
  planningDate: string;
  activityPlan: {
    name: string;
    description: string | null;
    structure: ReturnType<typeof activityPlanStructureSchema.parse>;
  };
};

type GarminTrainingAdmissionCursor = { planningDate: string; sessionId: string };

function admissionCursor(metadata: unknown): GarminTrainingAdmissionCursor | null {
  if (!metadata || typeof metadata !== "object") return null;
  const admission = (metadata as { garminTrainingAdmission?: unknown }).garminTrainingAdmission;
  if (!admission || typeof admission !== "object") return null;
  const cursor = (admission as { cursor?: unknown }).cursor;
  if (!cursor || typeof cursor !== "object") return null;
  const value = cursor as { planningDate?: unknown; sessionId?: unknown };
  return typeof value.planningDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.planningDate) &&
    typeof value.sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.sessionId,
    )
    ? { planningDate: value.planningDate, sessionId: value.sessionId }
    : null;
}

/**
 * Claims only active, granted Garmin training jobs. The row lock and conditional
 * update make a claimed lease exclusive even when multiple worker processes poll
 * concurrently. Provider I/O is deliberately performed after this transaction.
 */
export async function claimDueGarminTrainingSyncJobs(input: {
  db: DrizzleDbClient;
  workerId: string;
  limit?: number;
  leaseMs?: number;
  now?: Date;
}): Promise<GarminTrainingSyncJob[]> {
  const now = input.now ?? new Date();
  const lockExpiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS));
  const limit = Math.min(10, Math.max(1, Math.floor(input.limit ?? 1)));
  return input.db.transaction(async (tx) => {
    // Do not leave exhausted retry lanes eligible forever.  Terminal lanes are
    // intentionally excluded from both claim and later automatic admission.
    await tx
      .update(schema.providerSyncJobs)
      .set({ status: "dead_lettered", last_error: "max_attempts_exhausted", updated_at: now })
      .where(
        and(
          eq(schema.providerSyncJobs.provider, "garmin"),
          eq(schema.providerSyncJobs.job_type, GARMIN_TRAINING_JOB_TYPE),
          inArray(schema.providerSyncJobs.status, ["queued", "failed"]),
          sql`${schema.providerSyncJobs.attempt} >= ${schema.providerSyncJobs.max_attempts}`,
          // An obsolete generation is not an exhausted retry lane for the
          // current connection. Leave it inspectable instead of turning it
          // into a stale dead-letter blocker.
          sql`exists (
            select 1 from integrations i
            where i.id = ${schema.providerSyncJobs.integration_id}
              and i.generation = ${schema.providerSyncJobs.integration_generation}
          )`,
        ),
      );
    const rows = await tx
      .select({
        id: schema.providerSyncJobs.id,
        integrationGeneration: schema.providerSyncJobs.integration_generation,
        integrationId: schema.providerSyncJobs.integration_id,
        plannedSessionId: schema.providerSyncJobs.internal_resource_id,
        profileId: schema.providerSyncJobs.profile_id,
        operation: schema.providerSyncJobs.operation,
        payload: schema.providerSyncJobs.payload,
        attempt: schema.providerSyncJobs.attempt,
        maxAttempts: schema.providerSyncJobs.max_attempts,
      })
      .from(schema.providerSyncJobs)
      .where(
        and(
          eq(schema.providerSyncJobs.provider, "garmin"),
          eq(schema.providerSyncJobs.job_type, GARMIN_TRAINING_JOB_TYPE),
          lte(schema.providerSyncJobs.run_at, now),
          sql`${schema.providerSyncJobs.attempt} < ${schema.providerSyncJobs.max_attempts}`,
          or(
            inArray(schema.providerSyncJobs.status, ["queued", "failed"]),
            and(
              eq(schema.providerSyncJobs.status, "running"),
              or(
                isNull(schema.providerSyncJobs.lock_expires_at),
                lte(schema.providerSyncJobs.lock_expires_at, now),
              ),
              // A pre-effect receipt may still receive its original provider
              // response. Reclaiming would replace that immutable attempt.
              sql`coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') = ''`,
            ),
          ),
          sql`exists (
            select 1 from integrations i
            join integration_credentials c on c.integration_id = i.id
            where i.id = ${schema.providerSyncJobs.integration_id}
              and i.profile_id = ${schema.providerSyncJobs.profile_id}
              and i.provider = 'garmin'
              and i.lifecycle_status = 'active'
              and i.generation = ${schema.providerSyncJobs.integration_generation}
              and c.reconnect_required_at is null
              and coalesce(c.scope, '') ~ '(^|\\s)WORKOUT_IMPORT(\\s|$)'
          )`,
          sql`not exists (
            select 1 from provider_sync_jobs earlier
            where earlier.sync_lane_key = ${schema.providerSyncJobs.sync_lane_key}
               and (
                 earlier.integration_generation = ${schema.providerSyncJobs.integration_generation}
                 -- A durable pre-effect receipt remains a recovery fence even
                 -- after reconnect; a clean old retry must not block the new
                 -- generation forever.
                 or coalesce(earlier.payload #>> '{garminTraining,recoveryPhase}', '') <> ''
               )
               and earlier.status in ('queued', 'failed', 'running', 'dead_lettered')
               and earlier.queue_sequence < ${schema.providerSyncJobs.queue_sequence}
          )`,
          sql`not exists (
            select 1 from provider_sync_jobs running
            where running.sync_lane_key = ${schema.providerSyncJobs.sync_lane_key}
              and running.status = 'running'
              and (
                running.integration_generation = ${schema.providerSyncJobs.integration_generation}
                or coalesce(running.payload #>> '{garminTraining,recoveryPhase}', '') <> ''
              )
              and running.lock_expires_at > ${now}
              and running.id <> ${schema.providerSyncJobs.id}
          )`,
        ),
      )
      .orderBy(asc(schema.providerSyncJobs.priority), asc(schema.providerSyncJobs.queue_sequence))
      .limit(limit)
      .for("update", { skipLocked: true });

    const claimed: GarminTrainingSyncJob[] = [];
    for (const row of rows) {
      const payload = row.payload as { planningDate?: unknown; plannedSessionId?: unknown };
      if (
        !row.plannedSessionId ||
        (row.operation !== "publish" && row.operation !== "cancel") ||
        typeof payload.planningDate !== "string" ||
        payload.plannedSessionId !== row.plannedSessionId
      ) {
        await tx
          .update(schema.providerSyncJobs)
          .set({
            status: "dead_lettered",
            last_error: "invalid_garmin_training_payload",
            updated_at: now,
          })
          .where(eq(schema.providerSyncJobs.id, row.id));
        continue;
      }
      const [updated] = await tx
        .update(schema.providerSyncJobs)
        .set({
          attempt: sql`${schema.providerSyncJobs.attempt} + 1`,
          last_error: null,
          locked_at: now,
          locked_by: input.workerId,
          lock_expires_at: lockExpiresAt,
          status: "running",
          updated_at: now,
        })
        .where(
          and(
            eq(schema.providerSyncJobs.id, row.id),
            // Re-fence the claim at update time. A reconnect can advance the
            // integration generation after candidate selection but before the
            // lease is written.
            sql`exists (
              select 1 from integrations i
              join integration_credentials c on c.integration_id = i.id
              where i.id = ${schema.providerSyncJobs.integration_id}
                and i.profile_id = ${schema.providerSyncJobs.profile_id}
                and i.provider = 'garmin'
                and i.lifecycle_status = 'active'
                and i.generation = ${schema.providerSyncJobs.integration_generation}
                and c.reconnect_required_at is null
                and coalesce(c.scope, '') ~ '(^|\\s)WORKOUT_IMPORT(\\s|$)'
            )`,
          ),
        )
        .returning({ id: schema.providerSyncJobs.id });
      if (updated) {
        claimed.push({
          id: row.id,
          attempt: row.attempt + 1,
          maxAttempts: row.maxAttempts,
          integrationGeneration: row.integrationGeneration,
          integrationId: row.integrationId,
          plannedSessionId: row.plannedSessionId,
          profileId: row.profileId,
          operation: row.operation,
          planningDate: payload.planningDate,
        });
      }
    }
    return claimed;
  });
}

async function loadCurrentGarminTrainingSession(
  db: DrizzleDbClient,
  job: GarminTrainingSyncJob,
): Promise<GarminTrainingCurrentSession | null> {
  const [row] = await db
    .select({
      planningDate: schema.plannedSessions.planning_date,
      name: schema.activityPlans.name,
      description: schema.activityPlans.description,
      structure: schema.activityPlans.structure,
    })
    .from(schema.plannedSessions)
    .innerJoin(
      schema.activityPlans,
      and(
        eq(schema.activityPlans.id, schema.plannedSessions.activity_plan_id),
        or(
          eq(schema.activityPlans.profile_id, job.profileId),
          eq(schema.activityPlans.is_system_template, true),
        ),
      ),
    )
    .where(
      and(
        eq(schema.plannedSessions.id, job.plannedSessionId),
        eq(schema.plannedSessions.profile_id, job.profileId),
        eq(schema.plannedSessions.status, "scheduled"),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    planningDate: row.planningDate,
    activityPlan: {
      name: row.name,
      description: row.description,
      structure: activityPlanStructureSchema.parse(row.structure),
    },
  };
}

function projectionHash(session: GarminTrainingCurrentSession): string {
  return createHash("sha256")
    .update(JSON.stringify(projectGarminTrainingActivityPlan(session.activityPlan)))
    .digest("hex");
}

/**
 * Production entry point for the unregistered Garmin planned-session worker.
 * It is intentionally injectable for deterministic worker tests; callers pass
 * only a DB and stable worker id in production.
 */
export async function runGarminPlannedSessionSyncJobs(input: {
  db: DrizzleDbClient;
  workerId: string;
  fetchImpl?: typeof fetch;
  limit?: number;
  leaseMs?: number;
  now?: Date;
  claimDueJobs?: (input: {
    db: DrizzleDbClient;
    workerId: string;
    limit?: number;
    leaseMs?: number;
    now?: Date;
  }) => Promise<GarminTrainingSyncJob[]>;
  createStore?: (input: { db: DrizzleDbClient; workerId: string }) => GarminTrainingSyncStore;
  loadCurrentSession?: (
    db: DrizzleDbClient,
    job: GarminTrainingSyncJob,
  ) => Promise<GarminTrainingCurrentSession | null>;
  resolveCredentials?: (profileId: string) => Promise<string>;
}): Promise<{ claimed: number; completed: number; failed: number; recoveryRequired: number }> {
  const jobs = await (input.claimDueJobs ?? claimDueGarminTrainingSyncJobs)({
    db: input.db,
    workerId: input.workerId,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.leaseMs === undefined ? {} : { leaseMs: input.leaseMs }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  const store = (
    input.createStore ??
    ((value) => createDrizzleGarminTrainingSyncRepository(value.db, value.workerId))
  )({
    db: input.db,
    workerId: input.workerId,
  });
  const resolveCredentials =
    input.resolveCredentials ??
    ((profileId: string) =>
      resolveGarminCredentials({
        profileId,
        repository: createGarminCredentialRepository(input.db),
      }));
  let completed = 0;
  let failed = 0;
  let recoveryRequired = 0;
  for (const job of jobs) {
    // Re-read the current session for every queued publish. A stale publish whose
    // session was cancelled converges as a cancel; a stale date converges to the
    // current date instead of trusting the queued payload.
    let current: GarminTrainingCurrentSession | null = null;
    try {
      current =
        job.operation === "publish"
          ? await (input.loadCurrentSession ?? loadCurrentGarminTrainingSession)(input.db, job)
          : null;
    } catch {
      await store.fail(job, "provider_failure");
      failed += 1;
      continue;
    }
    const currentJob =
      job.operation === "publish"
        ? current
          ? {
              ...job,
              planningDate: current.planningDate,
              desiredProjectionHash: projectionHash(current),
            }
          : { ...job, operation: "cancel" as const }
        : job;
    let accessToken: string;
    try {
      accessToken = await resolveCredentials(job.profileId);
    } catch {
      await store.fail(job, "provider_failure");
      failed += 1;
      continue;
    }
    try {
      const client = new GarminTrainingClient({
        accessToken,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      });
      const result = await executeGarminTrainingSyncJob({
        job: currentJob,
        store,
        remote: {
          async createActivityPlan() {
            if (!current) throw new Error("garmin_training_current_session_missing");
            const created = await client.createActivityPlan(
              projectGarminTrainingActivityPlan(current.activityPlan),
            );
            const activityPlan = await client.getActivityPlan(created.workoutId);
            if (!activityPlan.ownerId) throw new Error("garmin_training_owner_missing");
            return { workoutId: created.workoutId, ownerId: activityPlan.ownerId };
          },
          async updateActivityPlan(value) {
            if (!current) throw new Error("garmin_training_current_session_missing");
            // On an unknown PUT, safely reread the known resource before retaining
            // the terminal recovery receipt; never fall through to a blind create.
            try {
              await client.updateActivityPlan(value.workoutId, {
                ...projectGarminTrainingActivityPlan(current.activityPlan),
                workoutId: value.workoutId,
                ownerId: value.ownerId,
              });
            } catch (error) {
              try {
                await client.getActivityPlan(value.workoutId);
              } catch {}
              throw error;
            }
          },
          async createSchedule(value) {
            return client.createSchedule(value);
          },
          async updateSchedule(value) {
            await client.updateSchedule(value.scheduleId, value);
          },
          async deleteSchedule(scheduleId) {
            await client.deleteSchedule(scheduleId);
          },
          async deleteActivityPlan(value) {
            await client.deleteActivityPlan(value.workoutId);
          },
        },
      });
      if (result === "completed") completed += 1;
      else if (result === "recovery_required") recoveryRequired += 1;
      else failed += 1;
    } catch {
      // A lost lease/generation cannot be safely finalized by this worker.
      failed += 1;
    }
  }
  return { claimed: jobs.length, completed, failed, recoveryRequired };
}

/** Transaction-safe admission.  It queues identity/date only; the worker re-resolves the mutable plan. */
export async function enqueueGarminPlannedSessionSync(input: {
  db: DrizzleDbClient;
  transaction?: DrizzleTransactionClient;
  plannedSessionId: string;
  profileId: string;
  planningDate: string;
  operation: "publish" | "cancel";
  now?: Date;
}): Promise<{ id: string; queued: boolean } | null> {
  const now = input.now ?? new Date();
  const enqueue = async (tx: DrizzleTransactionClient) => {
    const [row] = await tx
      .select({
        integrationId: schema.integrations.id,
        generation: schema.integrations.generation,
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
          eq(schema.integrations.provider, "garmin"),
          eq(schema.integrations.lifecycle_status, "active"),
        ),
      )
      .limit(1)
      .for("update");
    if (!row || !row.scope?.split(/\s+/).includes("WORKOUT_IMPORT")) return null;
    const [session] = await tx
      .select({
        id: schema.plannedSessions.id,
        status: schema.plannedSessions.status,
        date: schema.plannedSessions.planning_date,
      })
      .from(schema.plannedSessions)
      .where(
        and(
          eq(schema.plannedSessions.id, input.plannedSessionId),
          eq(schema.plannedSessions.profile_id, input.profileId),
        ),
      )
      .limit(1)
      .for("update");
    if (!session || (input.operation === "publish" && session.status !== "scheduled")) return null;
    if (input.operation === "publish") {
      const [profile] = await tx
        .select({ planningTimezone: schema.profiles.planning_timezone })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, input.profileId))
        .limit(1)
        .for("update");
      const timezone = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
      // Civil planning dates must never be admitted against the worker host's
      // UTC date. An unconfigured/invalid timezone fails closed.
      if (!timezone.success) return null;
      const today = formatDateOnlyInTimeZone(now, timezone.data);
      const max = addCivilDays(today, 14);
      if (session.date < today || session.date > max) return null;
    }
    const lane = `garmin:${row.integrationId}:planned_session:${session.id}`;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`garmin-training-lane:${lane}`}, 0))`,
    );
    const existing = await tx
      .select({
        id: schema.providerSyncJobs.id,
        status: schema.providerSyncJobs.status,
        payload: schema.providerSyncJobs.payload,
      })
      .from(schema.providerSyncJobs)
      .where(
        and(
          eq(schema.providerSyncJobs.sync_lane_key, lane),
          or(
            and(
              eq(schema.providerSyncJobs.integration_generation, row.generation),
              inArray(schema.providerSyncJobs.status, [
                "queued",
                "running",
                "failed",
                "dead_lettered",
              ]),
            ),
            // Reconnects may not erase or bypass a pre-effect receipt from an
            // earlier generation. It remains a manual recovery fence, while
            // clean old jobs are deliberately excluded from this lane.
            sql`coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') <> ''`,
          ),
        ),
      )
      .orderBy(asc(schema.providerSyncJobs.queue_sequence))
      .for("update");
    const payload = {
      plannedSessionId: session.id,
      planningDate: session.date,
      operation: input.operation,
    };
    // An active attempt's pre-effect receipt must not be overwritten, but it also
    // must not discard the latest desired operation. Coalesce that operation into
    // a successor behind the running row. A dead-lettered lane remains explicitly
    // manual-recovery-only.
    const terminalRecovery = existing.some(
      // A currently-running receipt can still receive its original response;
      // retain the existing successor/coalescing behavior. Any non-running
      // receipt (including one retained from an older generation) is manual
      // recovery and cannot be bypassed by a fresh publish.
      (job) =>
        job.status === "dead_lettered" ||
        (job.status !== "running" && metadataState(job.payload).kind === "recovery_required"),
    );
    if (terminalRecovery) return null;
    const queued = existing.find((job) => job.status === "queued");
    if (queued) {
      await tx
        .update(schema.providerSyncJobs)
        .set({
          operation: input.operation,
          payload,
          integration_generation: row.generation,
          run_at: now,
          updated_at: now,
        })
        .where(eq(schema.providerSyncJobs.id, queued.id));
      return { id: queued.id, queued: true };
    }
    const [job] = await tx
      .insert(schema.providerSyncJobs)
      .values({
        profile_id: input.profileId,
        integration_id: row.integrationId,
        provider: "garmin",
        integration_generation: row.generation,
        job_type: "garmin.training_planned_session",
        operation: input.operation,
        resource_kind: "planned_session",
        internal_resource_id: session.id,
        sync_lane_key: lane,
        dedupe_key: lane,
        payload,
        priority: 50,
        run_at: now,
        max_attempts: 3,
        status: "queued",
      })
      .returning({ id: schema.providerSyncJobs.id });
    return job ? { id: job.id, queued: true } : null;
  };
  return input.transaction ? enqueue(input.transaction) : input.db.transaction(enqueue);
}

/**
 * Refreshes only the bounded, Garmin-supported delivery window after a plan edit.
 * The caller's transaction owns both the edit and all admitted job rows.
 */
export async function enqueueGarminActivityPlanRefreshAfterMutation(input: {
  activityPlanId: string;
  db: DrizzleDbClient;
  now?: Date;
  profileId: string;
  transaction: DrizzleTransactionClient;
}): Promise<{ queued: number }> {
  const now = input.now ?? new Date();
  const [profile] = await input.transaction
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, input.profileId))
    .limit(1)
    .for("update");
  const timezone = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
  if (!timezone.success) return { queued: 0 };
  const today = formatDateOnlyInTimeZone(now, timezone.data);
  const sessions = await input.transaction
    .select({ id: schema.plannedSessions.id, planningDate: schema.plannedSessions.planning_date })
    .from(schema.plannedSessions)
    .where(
      and(
        eq(schema.plannedSessions.activity_plan_id, input.activityPlanId),
        eq(schema.plannedSessions.profile_id, input.profileId),
        eq(schema.plannedSessions.status, "scheduled"),
        sql`${schema.plannedSessions.planning_date} >= ${today}`,
        sql`${schema.plannedSessions.planning_date} <= ${addCivilDays(today, 14)}`,
      ),
    )
    .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
    .limit(GARMIN_WINDOW_SESSION_LIMIT);
  let queued = 0;
  for (const session of sessions) {
    if (
      await enqueueGarminPlannedSessionSync({
        db: input.db,
        transaction: input.transaction,
        plannedSessionId: session.id,
        planningDate: session.planningDate,
        operation: "publish",
        profileId: input.profileId,
        now,
      })
    )
      queued += 1;
  }
  return { queued };
}

/** Bounded rolling-window reconciliation, also used immediately after Garmin OAuth connect. */
export async function admitGarminPlannedSessionSyncWindow(input: {
  db: DrizzleDbClient;
  now?: Date;
  profileId?: string;
  profileLimit?: number;
  transaction?: DrizzleTransactionClient;
}): Promise<{ profiles: number; queued: number }> {
  const now = input.now ?? new Date();
  const profileBatchLimit = input.profileId
    ? 1
    : Math.min(GARMIN_ADMISSION_PROFILE_LIMIT, Math.max(1, input.profileLimit ?? 10));
  const admit = async (tx: DrizzleTransactionClient) => {
    // This is deliberately a bounded candidate query. State update time is a
    // round-robin priority: integrations least recently scanned are selected
    // first, including integrations whose prior page had no admissible work.
    const candidates = await tx
      .select({
        profileId: schema.integrations.profile_id,
        integrationId: schema.integrations.id,
        integrationGeneration: schema.integrations.generation,
        planningTimezone: schema.profiles.planning_timezone,
      })
      .from(schema.integrations)
      .innerJoin(
        schema.integrationCredentials,
        eq(schema.integrationCredentials.integration_id, schema.integrations.id),
      )
      .innerJoin(schema.profiles, eq(schema.profiles.id, schema.integrations.profile_id))
      .leftJoin(
        schema.providerSyncState,
        and(
          eq(schema.providerSyncState.integration_id, schema.integrations.id),
          eq(schema.providerSyncState.resource, GARMIN_ADMISSION_STATE_RESOURCE),
        ),
      )
      .where(
        and(
          eq(schema.integrations.provider, "garmin"),
          eq(schema.integrations.lifecycle_status, "active"),
          isNull(schema.integrationCredentials.reconnect_required_at),
          sql`coalesce(${schema.integrationCredentials.scope}, '') ~ '(^|\\s)WORKOUT_IMPORT(\\s|$)'`,
          ...(input.profileId ? [eq(schema.integrations.profile_id, input.profileId)] : []),
        ),
      )
      .orderBy(
        asc(
          sql`coalesce(${schema.providerSyncState.updated_at}, ${schema.integrations.created_at})`,
        ),
        asc(schema.integrations.id),
      )
      .limit(profileBatchLimit);
    if (!candidates.length) return { profiles: 0, queued: 0 };

    // Lock the integration before rereading its cursor. The first candidate
    // query can see a stale state while another drain holds this lock; the
    // reread below prevents that stale snapshot from rewinding keyset progress.
    const locked = await tx
      .select({ integrationId: schema.integrations.id })
      .from(schema.integrations)
      .where(
        inArray(
          schema.integrations.id,
          candidates.map((candidate) => candidate.integrationId),
        ),
      )
      .for("update", { skipLocked: true });
    const lockedIds = new Set(locked.map((row) => row.integrationId));
    const profiles = candidates.filter((candidate) => lockedIds.has(candidate.integrationId));
    if (!profiles.length) return { profiles: 0, queued: 0 };
    const states = await tx
      .select({
        integrationId: schema.providerSyncState.integration_id,
        metadata: schema.providerSyncState.metadata,
      })
      .from(schema.providerSyncState)
      .where(
        and(
          inArray(
            schema.providerSyncState.integration_id,
            profiles.map((profile) => profile.integrationId),
          ),
          eq(schema.providerSyncState.resource, GARMIN_ADMISSION_STATE_RESOURCE),
        ),
      );
    const stateByIntegration = new Map(
      states.map((state) => [state.integrationId, state.metadata]),
    );

    const admittedProfiles = new Set<string>();
    let queued = 0;
    for (const profile of profiles) {
      const timezone = ianaTimezoneSchema.safeParse(profile.planningTimezone);
      const cursor = admissionCursor(stateByIntegration.get(profile.integrationId));
      let sessions: Array<{
        id: string;
        planningDate: string;
        name: string;
        description: string | null;
        structure: unknown;
        linkMetadata: unknown;
      }> = [];
      if (timezone.success) {
        const today = formatDateOnlyInTimeZone(now, timezone.data);
        sessions = await tx
          .select({
            id: schema.plannedSessions.id,
            planningDate: schema.plannedSessions.planning_date,
            name: schema.activityPlans.name,
            description: schema.activityPlans.description,
            structure: schema.activityPlans.structure,
            linkMetadata: schema.integrationResourceLinks.provider_metadata,
          })
          .from(schema.plannedSessions)
          .innerJoin(
            schema.activityPlans,
            and(
              eq(schema.activityPlans.id, schema.plannedSessions.activity_plan_id),
              or(
                eq(schema.activityPlans.profile_id, profile.profileId),
                eq(schema.activityPlans.is_system_template, true),
              ),
            ),
          )
          .leftJoin(
            schema.integrationResourceLinks,
            and(
              eq(schema.integrationResourceLinks.integration_id, profile.integrationId),
              eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
              eq(schema.integrationResourceLinks.internal_resource_id, schema.plannedSessions.id),
            ),
          )
          .where(
            and(
              eq(schema.plannedSessions.profile_id, profile.profileId),
              eq(schema.plannedSessions.status, "scheduled"),
              sql`${schema.plannedSessions.planning_date} >= ${today}`,
              sql`${schema.plannedSessions.planning_date} <= ${addCivilDays(today, 14)}`,
              ...(cursor
                ? [
                    or(
                      gt(schema.plannedSessions.planning_date, cursor.planningDate),
                      and(
                        eq(schema.plannedSessions.planning_date, cursor.planningDate),
                        gt(schema.plannedSessions.id, cursor.sessionId),
                      ),
                    ),
                  ]
                : []),
            ),
          )
          .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
          .limit(GARMIN_ADMISSION_SESSION_PAGE_SIZE);
      }
      for (const session of sessions) {
        // Unsupported projections and recovery-owned links advance the cursor,
        // rather than creating a retry lane that would block later sessions.
        let hash: string;
        try {
          hash = projectionHash({
            planningDate: session.planningDate,
            activityPlan: {
              name: session.name,
              description: session.description,
              structure: activityPlanStructureSchema.parse(session.structure),
            },
          });
        } catch {
          continue;
        }
        const linkState = metadataState(session.linkMetadata);
        const linkGeneration =
          session.linkMetadata && typeof session.linkMetadata === "object"
            ? (session.linkMetadata as { garminTraining?: { integrationGeneration?: unknown } })
                .garminTraining?.integrationGeneration
            : undefined;
        if (
          linkState.kind === "recovery_required" ||
          (linkState.kind !== "none" && linkGeneration !== profile.integrationGeneration) ||
          (linkState.kind === "scheduled" &&
            linkState.date === session.planningDate &&
            linkState.appliedProjectionHash === hash)
        )
          continue;
        const admitted = await enqueueGarminPlannedSessionSync({
          db: input.db,
          transaction: tx,
          plannedSessionId: session.id,
          planningDate: session.planningDate,
          operation: "publish",
          profileId: profile.profileId,
          now,
        });
        if (admitted?.queued) {
          admittedProfiles.add(profile.profileId);
          queued += 1;
        }
      }
      const lastSession = sessions.at(-1);
      const nextCursor =
        lastSession && sessions.length === GARMIN_ADMISSION_SESSION_PAGE_SIZE
          ? { planningDate: lastSession.planningDate, sessionId: lastSession.id }
          : null;
      await tx
        .insert(schema.providerSyncState)
        .values({
          integration_id: profile.integrationId,
          provider: "garmin",
          resource: GARMIN_ADMISSION_STATE_RESOURCE,
          sync_mode: "push_windowed",
          metadata: { garminTrainingAdmission: { cursor: nextCursor } },
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            metadata: { garminTrainingAdmission: { cursor: nextCursor } },
            // Input `now` is deliberately deterministic for jobs/tests. Database
            // time makes the fair scheduling priority advance even when callers
            // use that same logical clock for several drains.
            updated_at: sql`clock_timestamp()`,
          },
        });
    }
    return { profiles: admittedProfiles.size, queued };
  };
  return input.transaction ? admit(input.transaction) : input.db.transaction(admit);
}
