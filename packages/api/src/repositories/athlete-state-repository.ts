import { ianaTimezoneSchema } from "@repo/core";
import {
  activities,
  activityEfforts,
  activityImportRuns,
  profileAthleteState,
  profilePerformanceEstimates,
  profiles,
  thresholds,
} from "@repo/db";
import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  type DrizzleQueryExecutor,
  type DrizzleTransactionClient,
  type getRequiredDb,
  withRepeatableReadSnapshot,
} from "../db";

type DbClient = ReturnType<typeof getRequiredDb>;

const athleteStateClaimRowSchema = z
  .object({
    profile_id: z.string().uuid(),
    source_revision: z.coerce.number().int().nonnegative(),
    planning_timezone: z.string().nullable(),
    dirty_from_at: z.coerce.date().nullable(),
    activity_analysis_cursor_started_at: z.coerce.date().nullable(),
    activity_analysis_cursor_activity_id: z.string().uuid().nullable(),
  })
  .strict();

const publishedAthleteStateRowSchema = z
  .object({
    profile_id: z.string().uuid(),
    source_revision: z.coerce.number().int().nonnegative(),
    published_revision: z.coerce.number().int().nonnegative(),
    dirty_from_at: z.coerce.date().nullable(),
    activity_analysis_cursor_started_at: z.coerce.date().nullable().optional(),
    activity_analysis_cursor_activity_id: z.string().uuid().nullable().optional(),
    fitness: z.coerce.number().nonnegative(),
    fatigue: z.coerce.number().nonnegative(),
    evidence_confidence: z.coerce.number().min(0).max(1),
    coverage_start_at: z.coerce.date().nullable(),
    coverage_end_at: z.coerce.date().nullable(),
    last_activity_at: z.coerce.date().nullable(),
    algorithm_version: z.string().min(1),
    computed_at: z.coerce.date().nullable(),
    lease_token: z.string().nullable(),
    lease_expires_at: z.coerce.date().nullable(),
    retry_after: z.coerce.date().nullable(),
    consecutive_failures: z.coerce.number().int().nonnegative(),
    last_failure_code: z.string().nullable(),
    updated_at: z.coerce.date(),
  })
  .strict();

const publishedPerformanceEstimateRowSchema = z
  .object({
    profile_id: z.string().uuid(),
    capability_kind: z.string().min(1),
    activity_category: z.enum(["bike", "other", "run", "strength", "swim"]),
    value: z.coerce.number().nonnegative(),
    unit: z.string().min(1),
    confidence: z.coerce.number().min(0).max(1),
    effective_at: z.coerce.date(),
    evidence_window_start_at: z.coerce.date().nullable(),
    evidence_window_end_at: z.coerce.date().nullable(),
    algorithm_version: z.string().min(1),
    source_revision: z.coerce.number().int().nonnegative(),
    target_fact: z.unknown().nullable().optional(),
    computed_at: z.coerce.date(),
  })
  .strict();

const publishedSnapshotReadRowSchema = z
  .object({
    planning_timezone: z.string().nullable(),
    state: z.unknown().nullable(),
    estimates: z.array(z.unknown()),
    blocking_import: z.enum(["active", "failed"]).nullable(),
  })
  .strict();

const claimState = alias(profileAthleteState, "state");
const claimProfile = alias(profiles, "profile");
const claimImportRun = alias(activityImportRuns, "run");
const snapshotProfile = alias(profiles, "profile");
const snapshotState = alias(profileAthleteState, "state");
const snapshotImportRun = alias(activityImportRuns, "run");
const snapshotEstimate = alias(profilePerformanceEstimates, "estimate");

export type AthleteStateClaim = {
  profileId: string;
  sourceRevision: number;
  leaseToken: string;
  planningTimezone: string;
  dirtyFromAt: Date | null;
  activityAnalysisCursor: { startedAt: Date; activityId: string } | null;
};

export type PublishedAthleteStateRead = {
  planningTimezone: string | null;
  current: {
    state: z.output<typeof publishedAthleteStateRowSchema>;
    estimates: Array<z.output<typeof publishedPerformanceEstimateRowSchema>>;
  } | null;
  blockingImport: "active" | "failed" | null;
};

class AthleteStatePublishFenceLostError extends Error {}

function parseDatabaseTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function earliestTimestamp(...values: Array<Date | null>) {
  const instants = values.filter((value): value is Date => value !== null);
  return instants.length === 0
    ? null
    : new Date(Math.min(...instants.map((value) => value.getTime())));
}

export async function markAthleteStateDirty(
  tx: DrizzleTransactionClient,
  input: { profileId: string; effectiveAt: Date; now?: Date },
) {
  const now = input.now ?? new Date();
  const [row] = await tx
    .insert(profileAthleteState)
    .values({
      profile_id: input.profileId,
      source_revision: 1,
      published_revision: 0,
      dirty_from_at: input.effectiveAt,
      activity_analysis_cursor_started_at: null,
      activity_analysis_cursor_activity_id: null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: profileAthleteState.profile_id,
      set: {
        source_revision: sql`${profileAthleteState.source_revision} + 1`,
        dirty_from_at: sql`least(coalesce(${profileAthleteState.dirty_from_at}, ${input.effectiveAt}), ${input.effectiveAt})`,
        activity_analysis_cursor_started_at: null,
        activity_analysis_cursor_activity_id: null,
        lease_token: null,
        lease_expires_at: null,
        retry_after: null,
        updated_at: now,
      },
    })
    .returning({ sourceRevision: profileAthleteState.source_revision });
  if (!row) throw new Error("Athlete state revision update failed");
  return row.sourceRevision;
}

/**
 * Publishes one already-materialized chronological contribution while the
 * caller holds the profile advisory fence. The conditional state update is the
 * revision fence; estimate revisions move only after that fence succeeds.
 */
export async function publishIncrementalAthleteStateContribution(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    expectedRevision: number;
    expectedComputedAt: Date;
    state: {
      fitness: number;
      fatigue: number;
      evidenceConfidence: number;
      coverageStartAt: Date;
      coverageEndAt: Date;
      lastActivityAt: Date;
      algorithmVersion: string;
      capabilities: Array<{
        activityCategory: "bike" | "other" | "run" | "strength" | "swim";
        longestDistanceMeters: number | null;
        longestDurationMinutes: number | null;
        observedAt: Date;
        evidenceConfidence: number;
      }>;
    };
    now: Date;
  },
) {
  const nextRevision = input.expectedRevision + 1;
  const [published] = await tx
    .update(profileAthleteState)
    .set({
      source_revision: nextRevision,
      published_revision: nextRevision,
      dirty_from_at: null,
      activity_analysis_cursor_started_at: null,
      activity_analysis_cursor_activity_id: null,
      fitness: input.state.fitness,
      fatigue: input.state.fatigue,
      evidence_confidence: input.state.evidenceConfidence,
      coverage_start_at: input.state.coverageStartAt,
      coverage_end_at: input.state.coverageEndAt,
      last_activity_at: input.state.lastActivityAt,
      algorithm_version: input.state.algorithmVersion,
      computed_at: input.state.lastActivityAt,
      retry_after: null,
      consecutive_failures: 0,
      last_failure_code: null,
      updated_at: input.now,
    })
    .where(
      and(
        eq(profileAthleteState.profile_id, input.profileId),
        eq(profileAthleteState.source_revision, input.expectedRevision),
        eq(profileAthleteState.published_revision, input.expectedRevision),
        eq(profileAthleteState.computed_at, input.expectedComputedAt),
        eq(profileAthleteState.algorithm_version, input.state.algorithmVersion),
        isNull(profileAthleteState.dirty_from_at),
        isNull(profileAthleteState.lease_token),
      ),
    )
    .returning({ profileId: profileAthleteState.profile_id });
  if (!published) return false;

  await tx
    .update(profilePerformanceEstimates)
    .set({ source_revision: nextRevision })
    .where(
      and(
        eq(profilePerformanceEstimates.profile_id, input.profileId),
        eq(profilePerformanceEstimates.source_revision, input.expectedRevision),
      ),
    );

  const capabilityRows = input.state.capabilities.flatMap((capability) => {
    const base = {
      profile_id: input.profileId,
      activity_category: capability.activityCategory,
      confidence: capability.evidenceConfidence,
      effective_at: capability.observedAt,
      evidence_window_start_at: null,
      evidence_window_end_at: input.state.lastActivityAt,
      algorithm_version: input.state.algorithmVersion,
      source_revision: nextRevision,
      computed_at: input.now,
    };
    return [
      ...(capability.longestDistanceMeters !== null && capability.longestDistanceMeters > 0
        ? [
            {
              ...base,
              capability_kind: "longest_distance",
              value: capability.longestDistanceMeters,
              unit: "meters",
            },
          ]
        : []),
      ...(capability.longestDurationMinutes !== null && capability.longestDurationMinutes > 0
        ? [
            {
              ...base,
              capability_kind: "longest_duration",
              value: capability.longestDurationMinutes,
              unit: "minutes",
            },
          ]
        : []),
    ];
  });
  if (capabilityRows.length > 0) {
    await tx
      .insert(profilePerformanceEstimates)
      .values(capabilityRows)
      .onConflictDoUpdate({
        target: [
          profilePerformanceEstimates.profile_id,
          profilePerformanceEstimates.capability_kind,
          profilePerformanceEstimates.activity_category,
        ],
        set: {
          value: sql`excluded.value`,
          unit: sql`excluded.unit`,
          confidence: sql`excluded.confidence`,
          effective_at: sql`excluded.effective_at`,
          evidence_window_end_at: sql`excluded.evidence_window_end_at`,
          algorithm_version: sql`excluded.algorithm_version`,
          source_revision: sql`excluded.source_revision`,
          computed_at: sql`excluded.computed_at`,
        },
      });
  }
  return true;
}

/** Fences analysis publication to the same durable claim that will rebuild athlete state. */
export async function verifyAthleteStateClaimForAnalysisRefresh(
  tx: DrizzleTransactionClient,
  input: { claim: AthleteStateClaim },
) {
  const [owned] = await tx
    .select({ profileId: profileAthleteState.profile_id })
    .from(profileAthleteState)
    .where(
      and(
        eq(profileAthleteState.profile_id, input.claim.profileId),
        eq(profileAthleteState.source_revision, input.claim.sourceRevision),
        eq(profileAthleteState.lease_token, input.claim.leaseToken),
        input.claim.dirtyFromAt === null
          ? sql`${profileAthleteState.dirty_from_at} is null`
          : eq(profileAthleteState.dirty_from_at, input.claim.dirtyFromAt),
        input.claim.activityAnalysisCursor === null
          ? and(
              sql`${profileAthleteState.activity_analysis_cursor_started_at} is null`,
              sql`${profileAthleteState.activity_analysis_cursor_activity_id} is null`,
            )
          : and(
              eq(
                profileAthleteState.activity_analysis_cursor_started_at,
                input.claim.activityAnalysisCursor.startedAt,
              ),
              eq(
                profileAthleteState.activity_analysis_cursor_activity_id,
                input.claim.activityAnalysisCursor.activityId,
              ),
            ),
        sql`${profileAthleteState.lease_expires_at} > clock_timestamp()`,
        sql`not exists (
          select 1 from ${activityImportRuns} run
          where run.profile_id = ${input.claim.profileId}
            and run.kind in ('onboarding', 'history_sync', 'manual_sync')
            and run.status in ('queued', 'running')
        )`,
      ),
    )
    .limit(1)
    .for("update");
  return Boolean(owned);
}

/** Commits one bounded analysis batch and makes its continuation immediately claimable. */
export async function advanceClaimedActivityAnalysisRefresh(
  tx: DrizzleTransactionClient,
  input: {
    claim: AthleteStateClaim;
    nextCursor: { startedAt: Date; activityId: string };
    now: Date;
  },
) {
  const [advanced] = await tx
    .update(profileAthleteState)
    .set({
      activity_analysis_cursor_started_at: input.nextCursor.startedAt,
      activity_analysis_cursor_activity_id: input.nextCursor.activityId,
      lease_token: null,
      lease_expires_at: null,
      retry_after: null,
      updated_at: input.now,
    })
    .where(
      and(
        eq(profileAthleteState.profile_id, input.claim.profileId),
        eq(profileAthleteState.source_revision, input.claim.sourceRevision),
        eq(profileAthleteState.lease_token, input.claim.leaseToken),
        input.claim.dirtyFromAt === null
          ? sql`${profileAthleteState.dirty_from_at} is null`
          : eq(profileAthleteState.dirty_from_at, input.claim.dirtyFromAt),
        sql`${profileAthleteState.lease_expires_at} > clock_timestamp()`,
        sql`not exists (
          select 1 from ${activityImportRuns} run
          where run.profile_id = ${input.claim.profileId}
            and run.kind in ('onboarding', 'history_sync', 'manual_sync')
            and run.status in ('queued', 'running')
        )`,
      ),
    )
    .returning({ profileId: profileAthleteState.profile_id });
  return Boolean(advanced);
}

/** Releases only the still-current token; a successor claim is never disturbed. */
export async function releaseAthleteStateClaim(
  db: DrizzleQueryExecutor,
  input: { claim: AthleteStateClaim; now: Date },
) {
  const [released] = await db
    .update(profileAthleteState)
    .set({ lease_token: null, lease_expires_at: null, updated_at: input.now })
    .where(
      and(
        eq(profileAthleteState.profile_id, input.claim.profileId),
        eq(profileAthleteState.lease_token, input.claim.leaseToken),
      ),
    )
    .returning({ profileId: profileAthleteState.profile_id });
  return Boolean(released);
}

export async function claimNextAthleteState(
  db: DbClient,
  input: { now: Date; leaseMilliseconds: number; profileId?: string },
): Promise<AthleteStateClaim | null> {
  const leaseToken = crypto.randomUUID();
  const result = await db.execute(sql`
    with candidate as (
      select ${claimState.profile_id}
      from ${profileAthleteState} state
       where ${claimState.source_revision} > ${claimState.published_revision}
         and (${input.profileId ?? null}::uuid is null or ${claimState.profile_id} = ${input.profileId ?? null}::uuid)
         and (${claimState.dirty_from_at} is null or ${claimState.dirty_from_at} <= ${input.now})
         and (${claimState.retry_after} is null or ${claimState.retry_after} <= clock_timestamp())
         and (${claimState.lease_token} is null or ${claimState.lease_expires_at} <= clock_timestamp())
         and not exists (
          select 1 from ${activityImportRuns} run
          where ${claimImportRun.profile_id} = ${claimState.profile_id}
            and ${claimImportRun.kind} in ('onboarding', 'history_sync', 'manual_sync')
            and ${claimImportRun.status} in ('queued', 'running')
        )
      order by ${claimState.dirty_from_at} nulls first, ${claimState.updated_at}, ${claimState.profile_id}
      limit 1
      for update skip locked
    )
    update ${profileAthleteState} state
    set lease_token = ${leaseToken},
        lease_expires_at = clock_timestamp() + (${input.leaseMilliseconds} * interval '1 millisecond'),
        updated_at = clock_timestamp()
    from candidate, ${profiles} profile
    where ${claimState.profile_id} = candidate.profile_id and ${claimProfile.id} = ${claimState.profile_id}
    returning ${claimState.profile_id},
      ${claimState.source_revision},
      ${claimProfile.planning_timezone},
      ${claimState.dirty_from_at},
      ${claimState.activity_analysis_cursor_started_at},
      ${claimState.activity_analysis_cursor_activity_id}
  `);
  const row = athleteStateClaimRowSchema.safeParse(result.rows[0]);
  if (!row.success) return null;
  const cursor =
    row.data.activity_analysis_cursor_started_at !== null &&
    row.data.activity_analysis_cursor_activity_id !== null
      ? {
          startedAt: row.data.activity_analysis_cursor_started_at,
          activityId: row.data.activity_analysis_cursor_activity_id,
        }
      : null;
  return {
    profileId: row.data.profile_id,
    sourceRevision: row.data.source_revision,
    leaseToken,
    planningTimezone: ianaTimezoneSchema.safeParse(row.data.planning_timezone).data ?? "UTC",
    dirtyFromAt: row.data.dirty_from_at,
    activityAnalysisCursor: cursor,
  };
}

/** Extend an unexpired claim with database time; any changed fence fails closed. */
export async function renewAthleteStateClaim(
  db: DrizzleQueryExecutor,
  input: { claim: AthleteStateClaim; leaseMilliseconds: number },
) {
  const [renewed] = await db
    .update(profileAthleteState)
    .set({
      lease_expires_at: sql`clock_timestamp() + (${input.leaseMilliseconds} * interval '1 millisecond')`,
      updated_at: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(profileAthleteState.profile_id, input.claim.profileId),
        eq(profileAthleteState.source_revision, input.claim.sourceRevision),
        eq(profileAthleteState.lease_token, input.claim.leaseToken),
        sql`${profileAthleteState.lease_expires_at} > clock_timestamp()`,
      ),
    )
    .returning({ profileId: profileAthleteState.profile_id });
  return Boolean(renewed);
}

export type AthleteStateEvidenceRow = {
  id: string;
  finishedAt: Date;
  activityCategory: "bike" | "other" | "run" | "strength" | "swim";
  commonLoad: number;
  evidenceConfidence: number;
  capabilityDistanceMeters: number | null;
  capabilityDurationMinutes: number | null;
};

export async function readAthleteStateEvidencePage(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    cursor: { finishedAt: Date; id: string } | null;
    limit: number;
    notAfter: Date;
  },
): Promise<AthleteStateEvidenceRow[]> {
  return db
    .select({
      id: activities.id,
      finishedAt: activities.finished_at,
      activityCategory: activities.athlete_state_activity_category,
      commonLoad: activities.athlete_state_common_load,
      evidenceConfidence: activities.athlete_state_evidence_confidence,
      capabilityDistanceMeters: activities.athlete_state_capability_distance_meters,
      capabilityDurationMinutes: activities.athlete_state_capability_duration_minutes,
    })
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        sql`${activities.athlete_state_common_load} is not null`,
        sql`${activities.athlete_state_activity_category} is not null`,
        sql`${activities.athlete_state_evidence_confidence} is not null`,
        sql`${activities.athlete_state_input_version} is not null`,
        sql`${activities.athlete_state_computed_at} is not null`,
        lte(activities.finished_at, input.notAfter),
        input.cursor
          ? sql`(${activities.finished_at}, ${activities.id}) > (${input.cursor.finishedAt}, ${input.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(activities.finished_at), asc(activities.id))
    .limit(input.limit) as Promise<AthleteStateEvidenceRow[]>;
}

export async function readPerformanceEffortPage(
  db: DrizzleQueryExecutor,
  input: { profileId: string; cursorId: string | null; limit: number; notAfter: Date },
) {
  return db
    .select({
      id: activityEfforts.id,
      activity_category: activityEfforts.activity_category,
      effort_type: activityEfforts.effort_type,
      duration_seconds: activityEfforts.duration_seconds,
      value: activityEfforts.value,
      quality_score: activityEfforts.quality_score,
      recorded_at: activityEfforts.recorded_at,
    })
    .from(activityEfforts)
    .innerJoin(
      activities,
      and(
        eq(activities.id, activityEfforts.activity_id),
        eq(activities.profile_id, activityEfforts.profile_id),
      ),
    )
    .where(
      and(
        eq(activityEfforts.profile_id, input.profileId),
        sql`${activityEfforts.activity_id} is not null`,
        lte(activityEfforts.recorded_at, input.notAfter),
        lte(activities.finished_at, input.notAfter),
        input.cursorId ? gt(activityEfforts.id, input.cursorId) : undefined,
      ),
    )
    .orderBy(asc(activityEfforts.id))
    .limit(input.limit);
}

export async function publishAthleteState(
  db: DbClient,
  input: {
    claim: AthleteStateClaim;
    state: {
      fitness: number;
      fatigue: number;
      evidenceConfidence: number;
      coverageStartAt: Date | null;
      coverageEndAt: Date | null;
      lastActivityAt: Date | null;
      algorithmVersion: string;
    };
    estimates:
      | Array<typeof profilePerformanceEstimates.$inferInsert>
      | ((
          tx: DrizzleTransactionClient,
        ) => Promise<Array<typeof profilePerformanceEstimates.$inferInsert>>);
    now: Date;
    afterPublishInTransaction?: (tx: DrizzleTransactionClient) => Promise<void>;
  },
) {
  try {
    const publish = async (tx: DrizzleTransactionClient) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.claim.profileId}, 0))`,
      );
      const [futureActivityEvidence] = await tx
        .select({ dirtyFromAt: sql<Date | string | null>`min(${activities.finished_at})` })
        .from(activities)
        .where(
          and(
            eq(activities.profile_id, input.claim.profileId),
            gt(activities.finished_at, input.now),
            sql`${activities.athlete_state_common_load} is not null`,
            sql`${activities.athlete_state_activity_category} is not null`,
            sql`${activities.athlete_state_evidence_confidence} is not null`,
            sql`${activities.athlete_state_input_version} is not null`,
            sql`${activities.athlete_state_computed_at} is not null`,
          ),
        );
      const [futureEffortEvidence] = await tx
        .select({
          dirtyFromAt: sql<
            Date | string | null
          >`min(greatest(${activities.finished_at}, ${activityEfforts.recorded_at}))`,
        })
        .from(activityEfforts)
        .innerJoin(
          activities,
          and(
            eq(activities.id, activityEfforts.activity_id),
            eq(activities.profile_id, activityEfforts.profile_id),
          ),
        )
        .where(
          and(
            eq(activityEfforts.profile_id, input.claim.profileId),
            sql`${activityEfforts.activity_id} is not null`,
            sql`greatest(${activities.finished_at}, ${activityEfforts.recorded_at}) > ${input.now}`,
          ),
        );
      const [futureCalibrationChange] = await tx
        .select({
          dirtyFromAt: sql<Date | string | null>`min(${thresholds.effective_at})`,
        })
        .from(thresholds)
        .where(
          and(
            eq(thresholds.profile_id, input.claim.profileId),
            gt(thresholds.effective_at, input.now),
          ),
        );
      const futureDirtyFromAt = earliestTimestamp(
        parseDatabaseTimestamp(futureActivityEvidence?.dirtyFromAt),
        parseDatabaseTimestamp(futureEffortEvidence?.dirtyFromAt),
        parseDatabaseTimestamp(futureCalibrationChange?.dirtyFromAt),
      );
      const [owned] = await tx
        .select({ profileId: profileAthleteState.profile_id })
        .from(profileAthleteState)
        .where(
          and(
            eq(profileAthleteState.profile_id, input.claim.profileId),
            eq(profileAthleteState.source_revision, input.claim.sourceRevision),
            eq(profileAthleteState.lease_token, input.claim.leaseToken),
            sql`${profileAthleteState.lease_expires_at} > clock_timestamp()`,
            sql`not exists (
            select 1 from ${activityImportRuns} run
            where run.profile_id = ${input.claim.profileId}
              and run.kind in ('onboarding', 'history_sync', 'manual_sync')
              and run.status in ('queued', 'running')
          )`,
          ),
        )
        .limit(1)
        .for("update");
      if (!owned) return false;
      const estimates =
        typeof input.estimates === "function" ? await input.estimates(tx) : input.estimates;
      await tx
        .delete(profilePerformanceEstimates)
        .where(eq(profilePerformanceEstimates.profile_id, input.claim.profileId));
      if (estimates.length > 0) await tx.insert(profilePerformanceEstimates).values(estimates);
      const [published] = await tx
        .update(profileAthleteState)
        .set({
          source_revision: futureDirtyFromAt
            ? input.claim.sourceRevision + 1
            : input.claim.sourceRevision,
          published_revision: input.claim.sourceRevision,
          dirty_from_at: futureDirtyFromAt,
          activity_analysis_cursor_started_at: null,
          activity_analysis_cursor_activity_id: null,
          fitness: input.state.fitness,
          fatigue: input.state.fatigue,
          evidence_confidence: input.state.evidenceConfidence,
          coverage_start_at: input.state.coverageStartAt,
          coverage_end_at: input.state.coverageEndAt,
          last_activity_at: input.state.lastActivityAt,
          algorithm_version: input.state.algorithmVersion,
          computed_at: input.now,
          lease_token: null,
          lease_expires_at: null,
          retry_after: null,
          consecutive_failures: 0,
          last_failure_code: null,
          updated_at: input.now,
        })
        .where(
          and(
            eq(profileAthleteState.profile_id, input.claim.profileId),
            eq(profileAthleteState.source_revision, input.claim.sourceRevision),
            eq(profileAthleteState.lease_token, input.claim.leaseToken),
            sql`${profileAthleteState.lease_expires_at} > clock_timestamp()`,
            sql`not exists (
            select 1 from ${activityImportRuns} run
            where run.profile_id = ${input.claim.profileId}
              and run.kind in ('onboarding', 'history_sync', 'manual_sync')
              and run.status in ('queued', 'running')
          )`,
          ),
        )
        .returning({ profileId: profileAthleteState.profile_id });
      if (!published) throw new AthleteStatePublishFenceLostError();
      await input.afterPublishInTransaction?.(tx);
      return true;
    };
    return await withRepeatableReadSnapshot(db, publish, { accessMode: "read write" });
  } catch (error) {
    if (error instanceof AthleteStatePublishFenceLostError) return false;
    throw error;
  }
}

export async function failAthleteStateClaim(
  db: DbClient,
  input: { claim: AthleteStateClaim; now: Date; failureCode: string },
) {
  const [failed] = await db
    .update(profileAthleteState)
    .set({
      lease_token: null,
      lease_expires_at: null,
      retry_after: sql`${input.now}::timestamptz + least(60, power(2, least(10, ${profileAthleteState.consecutive_failures} + 1))) * interval '1 minute'`,
      consecutive_failures: sql`${profileAthleteState.consecutive_failures} + 1`,
      last_failure_code: input.failureCode.slice(0, 64),
      updated_at: input.now,
    })
    .where(
      and(
        eq(profileAthleteState.profile_id, input.claim.profileId),
        eq(profileAthleteState.source_revision, input.claim.sourceRevision),
        eq(profileAthleteState.lease_token, input.claim.leaseToken),
        sql`${profileAthleteState.lease_expires_at} > clock_timestamp()`,
      ),
    )
    .returning({ profileId: profileAthleteState.profile_id });
  return Boolean(failed);
}

/**
 * Reads profile preference, one published revision, its matching estimates, and
 * the import fence from one PostgreSQL statement snapshot. A locking caller
 * acquires the state-row lock inside the same statement without changing the DTO.
 */
export async function readPublishedAthleteStateSnapshotData(
  db: DrizzleQueryExecutor,
  input: { profileId: string; lockStateForUpdate?: boolean },
): Promise<PublishedAthleteStateRead | null> {
  const result = await db.execute(sql`
    with selected_profile as materialized (
      select ${snapshotProfile.id}, ${snapshotProfile.planning_timezone}
      from ${profiles} profile
      where ${snapshotProfile.id} = ${input.profileId}
    ),
    selected_state as materialized (
      select ${snapshotState.profile_id}, ${snapshotState.published_revision}, to_jsonb(state) as state
      from ${profileAthleteState} state
      where ${snapshotState.profile_id} = ${input.profileId}
      ${input.lockStateForUpdate ? sql`for update` : sql``}
    ),
    blocking_import as materialized (
      select case
        when bool_or(run.status = 'failed' and run.superseded_at is null) then 'failed'
        when bool_or(run.status in ('queued', 'running')) then 'active'
        else null
      end as status
      from ${activityImportRuns} run
      where ${snapshotImportRun.profile_id} = ${input.profileId}
        and ${snapshotImportRun.kind} in ('onboarding', 'history_sync', 'manual_sync')
        and ${snapshotImportRun.status} in ('queued', 'running', 'failed')
        and (${snapshotImportRun.status} <> 'failed' or ${snapshotImportRun.superseded_at} is null)
    )
    select profile.planning_timezone,
      state.state,
      estimates.estimates,
      blocking_import.status as blocking_import
    from selected_profile profile
    left join selected_state state on state.profile_id = profile.id
    cross join blocking_import
    left join lateral (
      select coalesce(
        jsonb_agg(to_jsonb(estimate) order by estimate.activity_category, estimate.capability_kind),
        '[]'::jsonb
      ) as estimates
      from ${profilePerformanceEstimates} estimate
      where ${snapshotEstimate.profile_id} = profile.id
        and ${snapshotEstimate.source_revision} = state.published_revision
    ) estimates on true
  `);
  const row = publishedSnapshotReadRowSchema.safeParse(result.rows[0]);
  if (!row.success) return null;
  if (row.data.state === null) {
    return {
      planningTimezone: row.data.planning_timezone,
      current: null,
      blockingImport: row.data.blocking_import,
    };
  }
  return {
    planningTimezone: row.data.planning_timezone,
    current: {
      state: publishedAthleteStateRowSchema.parse(row.data.state),
      estimates: row.data.estimates.map((estimate) =>
        publishedPerformanceEstimateRowSchema.parse(estimate),
      ),
    },
    blockingImport: row.data.blocking_import,
  };
}
