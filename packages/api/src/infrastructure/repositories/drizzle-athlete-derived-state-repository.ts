import {
  type ActivityTrainingEffect,
  type AthleteRecalculationQueueItem,
  type AthleteRecalculationRequest,
  activityTrainingEffectSchema,
  athleteRecalculationQueueItemSchema,
  athleteRecalculationQueueTransitionInputSchema,
  athleteRecalculationRequestSchema,
  canonicalizeAthleteRecalculationReasons,
  coalesceAthleteRecalculationRequests,
  type DailyTrainingLoad,
  dailyTrainingLoadSchema,
  type PersistedThresholdEvidence,
  persistedThresholdEvidenceSchema,
} from "@repo/core/athlete-derived-state";
import {
  type ActivityTrainingEffectRow,
  type AthleteRecalculationQueueRow,
  activities,
  activityAnalysisRevisions,
  activityTrainingEffects,
  athleteRecalculationQueue,
  type DailyTrainingLoadRow,
  dailyTrainingLoad,
  profileAthleteState,
  profilePerformanceEstimates,
  profiles,
  type ThresholdEvidenceRow,
  thresholdEvidence,
} from "@repo/db";
import { and, asc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { TransitionAthleteRecalculationResult } from "../../contracts/athlete-derived-state";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import type {
  ActivityTrainingEffectWriteResult,
  AthleteDailyPublicationState,
  AthleteDerivedStateRepositoryPort,
  AthletePublicationState,
  RevisionFencedPublicationResult,
} from "../../repositories/athlete-derived-state-repository-port";

const athleteLeaseTokenSchema = z.string().uuid();
const publicationStateSchema = z
  .object({
    computedAt: z.string().datetime({ offset: true }),
    fitness: z.number().finite().nonnegative(),
    fatigue: z.number().finite().nonnegative(),
    evidenceConfidence: z.number().finite().min(0).max(1),
    coverageStartAt: z.string().datetime({ offset: true }).nullable(),
    coverageEndAt: z.string().datetime({ offset: true }).nullable(),
    lastActivityAt: z.string().datetime({ offset: true }).nullable(),
    calculationVersion: z.string().min(1).max(64),
    capabilities: z.array(
      z.object({
        activityCategory: z.enum(["bike", "other", "run", "strength", "swim"]),
        longestDistanceMeters: z.number().finite().nonnegative().nullable(),
        longestDurationMinutes: z.number().finite().nonnegative().nullable(),
        observedAt: z.string().datetime({ offset: true }),
        evidenceConfidence: z.number().finite().min(0).max(1),
      }),
    ),
  })
  .strict();

async function inTransaction<T>(
  db: DrizzleQueryExecutor,
  work: (tx: DrizzleTransactionClient) => Promise<T>,
): Promise<T> {
  if ("$client" in db) return db.transaction(work);
  return work(db);
}

function finiteNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid finite database number: ${field}`);
  return number;
}

function toInstant(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid database timestamp: ${field}`);
  return date.toISOString();
}

export function mapActivityTrainingEffectRow(
  row: ActivityTrainingEffectRow,
): ActivityTrainingEffect {
  return activityTrainingEffectSchema.parse({
    contractVersion: row.contract_version,
    profileId: row.profile_id,
    activityId: row.activity_id,
    activityAnalysisRevision: row.activity_analysis_revision,
    effectiveAt: toInstant(row.effective_at, "effective_at"),
    planningDate: row.planning_date,
    sourceRevision: finiteNumber(row.source_revision, "source_revision"),
    calculationVersion: row.calculation_version,
    inputFingerprint: row.input_fingerprint,
    stimulus: {
      kind: "observed",
      sourceId: row.activity_id,
      occurredAt: toInstant(row.effective_at, "effective_at"),
      activityCategory: row.activity_category,
      commonLoad: finiteNumber(row.common_load, "common_load"),
      evidenceConfidence: finiteNumber(row.evidence_confidence, "evidence_confidence"),
      capabilityObservation: row.capability_observation,
    },
  });
}

export function mapDailyTrainingLoadRow(row: DailyTrainingLoadRow): DailyTrainingLoad {
  return dailyTrainingLoadSchema.parse({
    contractVersion: row.contract_version,
    profileId: row.profile_id,
    planningDate: row.planning_date,
    sourceRevision: finiteNumber(row.source_revision, "source_revision"),
    commonLoad: finiteNumber(row.common_load, "common_load"),
    fitness: finiteNumber(row.fitness, "fitness"),
    fatigue: finiteNumber(row.fatigue, "fatigue"),
    form: finiteNumber(row.form, "form"),
    readiness: row.readiness === null ? null : finiteNumber(row.readiness, "readiness"),
    coverage: {
      status: row.coverage_status,
      contributingActivityCount: row.contributing_activity_count,
      omittedActivityCount: row.omitted_activity_count,
    },
    calculationVersion: row.calculation_version,
  });
}

export function mapAthleteRecalculationRequestRow(
  row: AthleteRecalculationQueueRow,
): AthleteRecalculationRequest {
  return athleteRecalculationRequestSchema.parse({
    contractVersion: row.contract_version,
    profileId: row.profile_id,
    idempotencyKey: row.idempotency_key,
    earliestAffectedAt: toInstant(row.earliest_affected_at, "earliest_affected_at"),
    earliestAffectedPlanningDate: row.earliest_affected_planning_date,
    sourceRevision: finiteNumber(row.source_revision, "source_revision"),
    reasons: canonicalizeAthleteRecalculationReasons(row.reasons),
    requestedAt: toInstant(row.requested_at, "requested_at"),
  });
}

export function mapThresholdEvidenceRow(row: ThresholdEvidenceRow): PersistedThresholdEvidence {
  return persistedThresholdEvidenceSchema.parse({
    contractVersion: row.contract_version,
    profileId: row.profile_id,
    calculationVersion: row.calculation_version,
    confidence: finiteNumber(row.confidence, "confidence"),
    evidence: {
      evidenceId: row.id,
      activityId: row.activity_id,
      activityCategory: row.activity_category,
      metric: row.metric,
      unit: row.unit,
      method: row.method,
      value: finiteNumber(row.value, "value"),
      sourceSeriesId: row.source_series_id,
      sourceSeriesMetric: row.source_series_metric,
      startTimestampSeconds: finiteNumber(row.start_timestamp_seconds, "start_timestamp_seconds"),
      endTimestampSeconds: finiteNumber(row.end_timestamp_seconds, "end_timestamp_seconds"),
      exactWindowSeconds: row.exact_window_seconds,
      conversionFactor: finiteNumber(row.conversion_factor, "conversion_factor"),
      policyVersion: row.policy_version,
      plausibilityVersion: row.plausibility_version,
      observedAt: toInstant(row.observed_at, "observed_at"),
    },
    lifecycle:
      row.status === "active"
        ? { status: row.status, invalidatedAt: null }
        : {
            status: row.status,
            invalidatedAt: toInstant(row.invalidated_at as Date, "invalidated_at"),
          },
  });
}

function mapPublicationState(
  row: typeof profileAthleteState.$inferSelect,
  planningTimezone: string | null,
): AthletePublicationState {
  return {
    profileId: row.profile_id,
    planningTimezone: planningTimezone ?? "UTC",
    sourceRevision: finiteNumber(row.source_revision, "source_revision"),
    publishedRevision: finiteNumber(row.published_revision, "published_revision"),
    dirtyFromAt: row.dirty_from_at ? toInstant(row.dirty_from_at, "dirty_from_at") : null,
    fitness: finiteNumber(row.fitness, "fitness"),
    fatigue: finiteNumber(row.fatigue, "fatigue"),
    evidenceConfidence: finiteNumber(row.evidence_confidence, "evidence_confidence"),
    coverageStartAt: row.coverage_start_at
      ? toInstant(row.coverage_start_at, "coverage_start_at")
      : null,
    coverageEndAt: row.coverage_end_at ? toInstant(row.coverage_end_at, "coverage_end_at") : null,
    lastActivityAt: row.last_activity_at
      ? toInstant(row.last_activity_at, "last_activity_at")
      : null,
    calculationVersion: row.algorithm_version,
    computedAt: row.computed_at ? toInstant(row.computed_at, "computed_at") : null,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at
      ? toInstant(row.lease_expires_at, "lease_expires_at")
      : null,
  };
}

type QueueWithWorkerRow = AthleteRecalculationQueueRow & {
  lease_token: string | null;
  lease_expires_at: Date | null;
  retry_after: Date | null;
  consecutive_failures: number;
  last_failure_code: string | null;
  state_updated_at: Date;
};

function mapQueueItem(row: QueueWithWorkerRow): AthleteRecalculationQueueItem {
  const lifecycle =
    row.lease_token !== null && row.lease_expires_at !== null
      ? {
          state: "processing" as const,
          claimToken: row.lease_token,
          claimedAt: toInstant(row.state_updated_at, "state_updated_at"),
          leaseExpiresAt: toInstant(row.lease_expires_at, "lease_expires_at"),
        }
      : row.retry_after !== null && row.last_failure_code !== null
        ? {
            state: "retry_wait" as const,
            failureCode: row.last_failure_code,
            failedAt: toInstant(row.state_updated_at, "state_updated_at"),
            nextAttemptAt: toInstant(row.retry_after, "retry_after"),
          }
        : {
            state: "pending" as const,
            availableAt: toInstant(row.retry_after ?? row.requested_at, "available_at"),
          };
  return athleteRecalculationQueueItemSchema.parse({
    request: mapAthleteRecalculationRequestRow(row),
    attemptCount: row.consecutive_failures,
    lifecycle,
  });
}

function effectValues(effect: ActivityTrainingEffect) {
  return {
    profile_id: effect.profileId,
    activity_id: effect.activityId,
    activity_analysis_revision: effect.activityAnalysisRevision,
    contract_version: effect.contractVersion,
    effective_at: new Date(effect.effectiveAt),
    planning_date: effect.planningDate,
    source_revision: effect.sourceRevision,
    calculation_version: effect.calculationVersion,
    input_fingerprint: effect.inputFingerprint,
    activity_category: effect.stimulus.activityCategory,
    common_load: effect.stimulus.commonLoad,
    evidence_confidence: effect.stimulus.evidenceConfidence,
    capability_observation: effect.stimulus.capabilityObservation,
  };
}

function dailyValues(day: DailyTrainingLoad) {
  return {
    profile_id: day.profileId,
    planning_date: day.planningDate,
    contract_version: day.contractVersion,
    common_load: day.commonLoad,
    fitness: day.fitness,
    fatigue: day.fatigue,
    form: day.form,
    readiness: day.readiness,
    coverage_status: day.coverage.status,
    contributing_activity_count: day.coverage.contributingActivityCount,
    omitted_activity_count: day.coverage.omittedActivityCount,
    source_revision: day.sourceRevision,
    calculation_version: day.calculationVersion,
  };
}

function thresholdValues(record: PersistedThresholdEvidence) {
  return {
    id: record.evidence.evidenceId,
    profile_id: record.profileId,
    activity_id: record.evidence.activityId,
    contract_version: record.contractVersion,
    activity_category: record.evidence.activityCategory,
    metric: record.evidence.metric,
    unit: record.evidence.unit,
    method: record.evidence.method,
    value: record.evidence.value,
    source_series_id: record.evidence.sourceSeriesId,
    source_series_metric: record.evidence.sourceSeriesMetric,
    start_timestamp_seconds: record.evidence.startTimestampSeconds,
    end_timestamp_seconds: record.evidence.endTimestampSeconds,
    exact_window_seconds: record.evidence.exactWindowSeconds,
    conversion_factor: record.evidence.conversionFactor,
    policy_version: record.evidence.policyVersion,
    plausibility_version: record.evidence.plausibilityVersion,
    observed_at: new Date(record.evidence.observedAt),
    calculation_version: record.calculationVersion,
    confidence: record.confidence,
    status: record.lifecycle.status,
    invalidated_at:
      record.lifecycle.invalidatedAt === null ? null : new Date(record.lifecycle.invalidatedAt),
  };
}

async function loadQueueItem(
  db: DrizzleQueryExecutor,
  profileId: string,
): Promise<AthleteRecalculationQueueItem | null> {
  const [row] = await db
    .select({
      queue: athleteRecalculationQueue,
      lease_token: profileAthleteState.lease_token,
      lease_expires_at: profileAthleteState.lease_expires_at,
      retry_after: profileAthleteState.retry_after,
      consecutive_failures: profileAthleteState.consecutive_failures,
      last_failure_code: profileAthleteState.last_failure_code,
      state_updated_at: profileAthleteState.updated_at,
    })
    .from(athleteRecalculationQueue)
    .innerJoin(
      profileAthleteState,
      eq(profileAthleteState.profile_id, athleteRecalculationQueue.profile_id),
    )
    .where(eq(athleteRecalculationQueue.profile_id, profileId))
    .limit(1);
  return row ? mapQueueItem({ ...row.queue, ...row }) : null;
}

async function queueTransitionMiss(
  db: DrizzleQueryExecutor,
  profileId: string,
  claimToken: string,
): Promise<TransitionAthleteRecalculationResult> {
  const item = await loadQueueItem(db, profileId);
  if (!item) return { status: "not_found" };
  if (item.lifecycle.state !== "processing" || item.lifecycle.claimToken !== claimToken) {
    return { status: "lease_lost" };
  }
  if (Date.parse(item.lifecycle.leaseExpiresAt) <= Date.now()) return { status: "lease_lost" };
  return { status: "state_conflict", item };
}

export function createDrizzleAthleteDerivedStateRepository(
  db: DrizzleQueryExecutor,
): AthleteDerivedStateRepositoryPort {
  return {
    async lockPublicationState(input) {
      const [profile] = await db
        .select({ planningTimezone: profiles.planning_timezone })
        .from(profiles)
        .where(eq(profiles.id, input.profileId))
        .limit(1);
      if (!profile) return null;
      await db
        .insert(profileAthleteState)
        .values({ profile_id: input.profileId })
        .onConflictDoNothing({ target: profileAthleteState.profile_id });
      const [state] = await db
        .select()
        .from(profileAthleteState)
        .where(eq(profileAthleteState.profile_id, input.profileId))
        .limit(1)
        .for("update");
      return state ? mapPublicationState(state, profile.planningTimezone) : null;
    },

    async upsertActivityTrainingEffect(input): Promise<ActivityTrainingEffectWriteResult> {
      const effect = activityTrainingEffectSchema.parse(input.effect);
      if (effect.profileId !== input.profileId) return { status: "identity_conflict" };
      const [created] = await db
        .insert(activityTrainingEffects)
        .values(effectValues(effect))
        .onConflictDoNothing({
          target: [
            activityTrainingEffects.activity_id,
            activityTrainingEffects.activity_analysis_revision,
          ],
        })
        .returning();
      if (created) return { status: "created", effect: mapActivityTrainingEffectRow(created) };
      const [existingRow] = await db
        .select()
        .from(activityTrainingEffects)
        .where(
          and(
            eq(activityTrainingEffects.profile_id, input.profileId),
            eq(activityTrainingEffects.activity_id, effect.activityId),
            eq(activityTrainingEffects.activity_analysis_revision, effect.activityAnalysisRevision),
          ),
        )
        .limit(1);
      if (!existingRow) return { status: "identity_conflict" };
      const existing = mapActivityTrainingEffectRow(existingRow);
      return JSON.stringify(existing) === JSON.stringify(effect)
        ? { status: "unchanged", effect: existing }
        : { status: "identity_conflict" };
    },

    async listActivityTrainingEffects(input) {
      const rows = await db
        .select()
        .from(activityTrainingEffects)
        .where(
          and(
            eq(activityTrainingEffects.profile_id, input.profileId),
            gte(activityTrainingEffects.effective_at, new Date(input.fromEffectiveAt)),
            lte(activityTrainingEffects.source_revision, input.throughSourceRevision),
            sql`${activityTrainingEffects.activity_analysis_revision} = (
              select max(revision.revision)
              from ${activityAnalysisRevisions} revision
              where revision.activity_id = ${activityTrainingEffects.activity_id}
                and revision.profile_id = ${activityTrainingEffects.profile_id}
            )`,
            input.after
              ? sql`(${activityTrainingEffects.effective_at}, ${activityTrainingEffects.activity_id}, ${activityTrainingEffects.activity_analysis_revision}) > (${new Date(input.after.effectiveAt)}, ${input.after.activityId}::uuid, ${input.after.activityAnalysisRevision})`
              : undefined,
          ),
        )
        .orderBy(
          asc(activityTrainingEffects.effective_at),
          asc(activityTrainingEffects.activity_id),
          asc(activityTrainingEffects.activity_analysis_revision),
        )
        .limit(input.limit + 1);
      return {
        items: rows.slice(0, input.limit).map(mapActivityTrainingEffectRow),
        hasMore: rows.length > input.limit,
      };
    },

    async publishDailyTrainingLoad(input): Promise<RevisionFencedPublicationResult> {
      const claimToken =
        input.claimToken === undefined
          ? undefined
          : athleteLeaseTokenSchema.parse(input.claimToken);
      const days = input.days.map((day) => dailyTrainingLoadSchema.parse(day));
      const publication = publicationStateSchema.parse(input.state) as AthleteDailyPublicationState;
      if (
        days.some(
          (day) =>
            day.profileId !== input.profileId ||
            day.sourceRevision !== input.targetPublishedRevision ||
            day.planningDate < input.fromPlanningDate,
        )
      ) {
        throw new Error("Daily publication rows do not match the publication fence");
      }
      return inTransaction(db, async (tx) => {
        const [state] = await tx
          .select({
            sourceRevision: profileAthleteState.source_revision,
            publishedRevision: profileAthleteState.published_revision,
            leaseToken: profileAthleteState.lease_token,
            leaseExpiresAt: profileAthleteState.lease_expires_at,
          })
          .from(profileAthleteState)
          .where(eq(profileAthleteState.profile_id, input.profileId))
          .limit(1)
          .for("update");
        const expectedSourceRevision =
          claimToken === undefined
            ? input.expectedPublishedRevision
            : input.targetPublishedRevision;
        if (
          !state ||
          state.publishedRevision !== input.expectedPublishedRevision ||
          state.sourceRevision !== expectedSourceRevision
        ) {
          return {
            status: "stale_revision" as const,
            currentPublishedRevision: state?.publishedRevision ?? 0,
          };
        }
        if (
          claimToken !== undefined &&
          (state.leaseToken !== claimToken || state.leaseExpiresAt === null)
        ) {
          return { status: "lease_lost" as const };
        }
        if (claimToken === undefined && state.leaseToken !== null) {
          return { status: "lease_lost" as const };
        }
        const [published] = await tx
          .update(profileAthleteState)
          .set({
            source_revision: input.targetPublishedRevision,
            published_revision: input.targetPublishedRevision,
            dirty_from_at: null,
            fitness: publication.fitness,
            fatigue: publication.fatigue,
            evidence_confidence: publication.evidenceConfidence,
            coverage_start_at: publication.coverageStartAt
              ? new Date(publication.coverageStartAt)
              : null,
            coverage_end_at: publication.coverageEndAt ? new Date(publication.coverageEndAt) : null,
            last_activity_at: publication.lastActivityAt
              ? new Date(publication.lastActivityAt)
              : null,
            algorithm_version: publication.calculationVersion,
            computed_at: new Date(publication.computedAt),
            updated_at: new Date(),
          })
          .where(
            and(
              eq(profileAthleteState.profile_id, input.profileId),
              eq(profileAthleteState.source_revision, expectedSourceRevision),
              eq(profileAthleteState.published_revision, input.expectedPublishedRevision),
              claimToken === undefined
                ? isNull(profileAthleteState.lease_token)
                : eq(profileAthleteState.lease_token, claimToken),
              claimToken === undefined
                ? isNull(profileAthleteState.dirty_from_at)
                : gt(profileAthleteState.lease_expires_at, sql`clock_timestamp()`),
            ),
          )
          .returning({ publishedRevision: profileAthleteState.published_revision });
        if (!published) return { status: "lease_lost" as const };

        await tx
          .delete(dailyTrainingLoad)
          .where(
            and(
              eq(dailyTrainingLoad.profile_id, input.profileId),
              eq(dailyTrainingLoad.source_revision, input.targetPublishedRevision),
            ),
          );
        if (input.expectedPublishedRevision !== input.targetPublishedRevision) {
          await tx.execute(sql`
            insert into daily_training_load (
              profile_id, planning_date, contract_version, common_load, fitness, fatigue,
              form, readiness, coverage_status, contributing_activity_count,
              omitted_activity_count, source_revision, calculation_version, published_at
            )
            select profile_id, planning_date, contract_version, common_load, fitness, fatigue,
              form, readiness, coverage_status, contributing_activity_count,
              omitted_activity_count, ${input.targetPublishedRevision}, calculation_version,
              clock_timestamp()
            from daily_training_load
            where profile_id = ${input.profileId}::uuid
              and source_revision = ${input.expectedPublishedRevision}
              and planning_date < ${input.fromPlanningDate}::date
            on conflict do nothing
          `);
        }
        if (days.length > 0) await tx.insert(dailyTrainingLoad).values(days.map(dailyValues));

        await tx
          .update(profilePerformanceEstimates)
          .set({ source_revision: input.targetPublishedRevision })
          .where(
            and(
              eq(profilePerformanceEstimates.profile_id, input.profileId),
              eq(profilePerformanceEstimates.source_revision, input.expectedPublishedRevision),
            ),
          );
        const capabilityRows = publication.capabilities.flatMap((capability) => {
          const base = {
            profile_id: input.profileId,
            activity_category: capability.activityCategory,
            confidence: capability.evidenceConfidence,
            effective_at: new Date(capability.observedAt),
            evidence_window_start_at: null,
            evidence_window_end_at: publication.coverageEndAt
              ? new Date(publication.coverageEndAt)
              : null,
            algorithm_version: publication.calculationVersion,
            source_revision: input.targetPublishedRevision,
            computed_at: new Date(publication.computedAt),
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
        return {
          status: "published" as const,
          publishedRevision: published.publishedRevision,
        };
      });
    },

    async readDailyTrainingLoadRange(input) {
      const rows = await db
        .select()
        .from(dailyTrainingLoad)
        .where(
          and(
            eq(dailyTrainingLoad.profile_id, input.profileId),
            eq(dailyTrainingLoad.source_revision, input.publishedRevision),
            gte(dailyTrainingLoad.planning_date, input.startDate),
            lte(dailyTrainingLoad.planning_date, input.endDate),
          ),
        )
        .orderBy(asc(dailyTrainingLoad.planning_date));
      return rows.map(mapDailyTrainingLoadRow);
    },

    async readPublishedDailyTrainingLoadRange(input) {
      const rows = await db
        .select({
          publishedRevision: profileAthleteState.published_revision,
          day: dailyTrainingLoad,
        })
        .from(profileAthleteState)
        .leftJoin(
          dailyTrainingLoad,
          and(
            eq(dailyTrainingLoad.profile_id, profileAthleteState.profile_id),
            eq(dailyTrainingLoad.source_revision, profileAthleteState.published_revision),
            gte(dailyTrainingLoad.planning_date, input.startDate),
            lte(dailyTrainingLoad.planning_date, input.endDate),
          ),
        )
        .where(eq(profileAthleteState.profile_id, input.profileId))
        .orderBy(asc(dailyTrainingLoad.planning_date));
      const first = rows[0];
      if (!first) return null;
      return {
        publishedRevision: finiteNumber(first.publishedRevision, "published_revision"),
        days: rows.flatMap(({ day }) => (day ? [mapDailyTrainingLoadRow(day)] : [])),
      };
    },

    async coalesceRecalculationRequest(input) {
      const request = athleteRecalculationRequestSchema.parse(input.request);
      if (request.profileId !== input.profileId) throw new Error("Recalculation owner mismatch");
      return inTransaction(db, async (tx) => {
        const [state] = await tx
          .insert(profileAthleteState)
          .values({
            profile_id: input.profileId,
            source_revision: request.sourceRevision,
            published_revision: 0,
            dirty_from_at: new Date(request.earliestAffectedAt),
            updated_at: new Date(request.requestedAt),
          })
          .onConflictDoUpdate({
            target: profileAthleteState.profile_id,
            set: {
              source_revision: sql`greatest(${profileAthleteState.source_revision}, ${request.sourceRevision})`,
              dirty_from_at: sql`least(coalesce(${profileAthleteState.dirty_from_at}, ${new Date(request.earliestAffectedAt)}), ${new Date(request.earliestAffectedAt)})`,
              lease_token: null,
              lease_expires_at: null,
              retry_after: null,
              updated_at: new Date(request.requestedAt),
            },
          })
          .returning({ profileId: profileAthleteState.profile_id });
        if (!state) throw new Error("Athlete-state publication fence could not be prepared");

        const [existing] = await tx
          .select()
          .from(athleteRecalculationQueue)
          .where(eq(athleteRecalculationQueue.profile_id, input.profileId))
          .limit(1)
          .for("update");
        const coalesced = existing
          ? coalesceAthleteRecalculationRequests(
              mapAthleteRecalculationRequestRow(existing),
              request,
            )
          : request;
        const [row] = await tx
          .insert(athleteRecalculationQueue)
          .values({
            profile_id: coalesced.profileId,
            contract_version: coalesced.contractVersion,
            idempotency_key: coalesced.idempotencyKey,
            earliest_affected_at: new Date(coalesced.earliestAffectedAt),
            earliest_affected_planning_date: coalesced.earliestAffectedPlanningDate,
            source_revision: coalesced.sourceRevision,
            reasons: coalesced.reasons,
            requested_at: new Date(coalesced.requestedAt),
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: athleteRecalculationQueue.profile_id,
            set: {
              earliest_affected_at: new Date(coalesced.earliestAffectedAt),
              earliest_affected_planning_date: coalesced.earliestAffectedPlanningDate,
              source_revision: coalesced.sourceRevision,
              reasons: coalesced.reasons,
              requested_at: new Date(coalesced.requestedAt),
              updated_at: new Date(),
            },
          })
          .returning();
        if (!row) throw new Error("Recalculation request could not be coalesced");
        return mapAthleteRecalculationRequestRow(row);
      });
    },

    async readPendingRecalculation(input) {
      const [row] = await db
        .select()
        .from(athleteRecalculationQueue)
        .where(eq(athleteRecalculationQueue.profile_id, input.profileId))
        .limit(1);
      return row ? mapAthleteRecalculationRequestRow(row) : null;
    },

    async claimNextRecalculation(input) {
      const claimToken = athleteLeaseTokenSchema.parse(input.claimToken);
      const claimedAt = new Date(input.claimedAt);
      const leaseExpiresAt = new Date(input.leaseExpiresAt);
      return inTransaction(db, async (tx) => {
        const [candidate] = await tx
          .select({ profileId: athleteRecalculationQueue.profile_id })
          .from(athleteRecalculationQueue)
          .innerJoin(
            profileAthleteState,
            eq(profileAthleteState.profile_id, athleteRecalculationQueue.profile_id),
          )
          .where(
            and(
              or(
                sql`${profileAthleteState.lease_token} is null`,
                lte(profileAthleteState.lease_expires_at, claimedAt),
              ),
              or(
                sql`${profileAthleteState.retry_after} is null`,
                lte(profileAthleteState.retry_after, claimedAt),
              ),
            ),
          )
          .orderBy(
            asc(athleteRecalculationQueue.requested_at),
            asc(athleteRecalculationQueue.profile_id),
          )
          .limit(1)
          .for("update", { skipLocked: true });
        if (!candidate) return null;
        const [claimed] = await tx
          .update(profileAthleteState)
          .set({
            lease_token: claimToken,
            lease_expires_at: leaseExpiresAt,
            retry_after: null,
            last_failure_code: null,
            updated_at: claimedAt,
          })
          .where(
            and(
              eq(profileAthleteState.profile_id, candidate.profileId),
              or(
                sql`${profileAthleteState.lease_token} is null`,
                lte(profileAthleteState.lease_expires_at, claimedAt),
              ),
            ),
          )
          .returning({ profileId: profileAthleteState.profile_id });
        return claimed ? loadQueueItem(tx, candidate.profileId) : null;
      });
    },

    async transitionRecalculation(input) {
      const transition = athleteRecalculationQueueTransitionInputSchema.parse(input.transition);
      const claimToken = athleteLeaseTokenSchema.parse(transition.claimToken);
      if (transition.action === "claim") {
        const [claimed] = await db
          .update(profileAthleteState)
          .set({
            lease_token: claimToken,
            lease_expires_at: new Date(transition.leaseExpiresAt),
            retry_after: null,
            last_failure_code: null,
            updated_at: new Date(transition.claimedAt),
          })
          .where(
            and(
              eq(profileAthleteState.profile_id, input.profileId),
              or(
                sql`${profileAthleteState.lease_token} is null`,
                lte(profileAthleteState.lease_expires_at, new Date(transition.claimedAt)),
              ),
              sql`exists (select 1 from ${athleteRecalculationQueue} queue where queue.profile_id = ${input.profileId}::uuid)`,
            ),
          )
          .returning({ profileId: profileAthleteState.profile_id });
        const item = claimed ? await loadQueueItem(db, input.profileId) : null;
        return item ? { status: "updated", item } : { status: "not_found" };
      }

      if (transition.action === "renew") {
        const [renewed] = await db
          .update(profileAthleteState)
          .set({
            lease_expires_at: new Date(transition.leaseExpiresAt),
            updated_at: new Date(transition.renewedAt),
          })
          .where(
            and(
              eq(profileAthleteState.profile_id, input.profileId),
              eq(profileAthleteState.lease_token, claimToken),
              gt(profileAthleteState.lease_expires_at, sql`clock_timestamp()`),
            ),
          )
          .returning({ profileId: profileAthleteState.profile_id });
        const item = renewed ? await loadQueueItem(db, input.profileId) : null;
        return item
          ? { status: "updated", item }
          : queueTransitionMiss(db, input.profileId, claimToken);
      }

      if (transition.action === "retry") {
        const [retried] = await db
          .update(profileAthleteState)
          .set({
            lease_token: null,
            lease_expires_at: null,
            retry_after: new Date(transition.nextAttemptAt),
            consecutive_failures: sql`${profileAthleteState.consecutive_failures} + 1`,
            last_failure_code: transition.failureCode,
            updated_at: new Date(transition.failedAt),
          })
          .where(
            and(
              eq(profileAthleteState.profile_id, input.profileId),
              eq(profileAthleteState.lease_token, claimToken),
              gt(profileAthleteState.lease_expires_at, sql`clock_timestamp()`),
            ),
          )
          .returning({ profileId: profileAthleteState.profile_id });
        const item = retried ? await loadQueueItem(db, input.profileId) : null;
        return item
          ? { status: "updated", item }
          : queueTransitionMiss(db, input.profileId, claimToken);
      }

      return inTransaction(db, async (tx) => {
        const [owned] = await tx
          .select({ publishedRevision: profileAthleteState.published_revision })
          .from(profileAthleteState)
          .where(
            and(
              eq(profileAthleteState.profile_id, input.profileId),
              eq(profileAthleteState.lease_token, claimToken),
              gt(profileAthleteState.lease_expires_at, sql`clock_timestamp()`),
              transition.action === "complete"
                ? eq(profileAthleteState.published_revision, transition.resultingPublishedRevision)
                : undefined,
            ),
          )
          .limit(1)
          .for("update");
        if (!owned) return queueTransitionMiss(db, input.profileId, claimToken);
        await tx
          .delete(athleteRecalculationQueue)
          .where(eq(athleteRecalculationQueue.profile_id, input.profileId));
        await tx
          .update(profileAthleteState)
          .set({
            lease_token: null,
            lease_expires_at: null,
            retry_after: null,
            last_failure_code:
              transition.action === "fail_terminal" ? transition.failureCode : null,
            consecutive_failures:
              transition.action === "complete"
                ? 0
                : sql`${profileAthleteState.consecutive_failures} + 1`,
            updated_at: new Date(transition.completedAt),
          })
          .where(eq(profileAthleteState.profile_id, input.profileId));
        return { status: "completed" };
      });
    },

    async replaceThresholdEvidenceForActivity(input) {
      const evidence = input.evidence.map((record) =>
        persistedThresholdEvidenceSchema.parse(record),
      );
      if (
        evidence.some(
          (record) =>
            record.profileId !== input.profileId || record.evidence.activityId !== input.activityId,
        )
      ) {
        throw new Error("Threshold evidence owner or activity mismatch");
      }
      const categories = evidence.map((record) => record.evidence.activityCategory);
      if (new Set(categories).size !== categories.length) {
        throw new Error("Threshold evidence replacement contains a duplicate category");
      }
      await inTransaction(db, async (tx) => {
        const [ownedActivity] = await tx
          .select({ id: activities.id })
          .from(activities)
          .where(
            and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)),
          )
          .limit(1)
          .for("update");
        if (!ownedActivity) throw new Error("Threshold evidence activity is not owned by profile");
        await tx
          .delete(thresholdEvidence)
          .where(
            and(
              eq(thresholdEvidence.profile_id, input.profileId),
              eq(thresholdEvidence.activity_id, input.activityId),
            ),
          );
        if (evidence.length > 0)
          await tx.insert(thresholdEvidence).values(evidence.map(thresholdValues));
      });
    },

    async invalidateThresholdEvidenceForActivity(input) {
      const invalidatedAt = new Date(input.invalidatedAt);
      const rows = await db
        .update(thresholdEvidence)
        .set({ status: input.status, invalidated_at: invalidatedAt })
        .where(
          and(
            eq(thresholdEvidence.profile_id, input.profileId),
            eq(thresholdEvidence.activity_id, input.activityId),
            eq(thresholdEvidence.status, "active"),
            lte(thresholdEvidence.observed_at, invalidatedAt),
          ),
        )
        .returning({ id: thresholdEvidence.id });
      return rows.length;
    },

    async deleteThresholdEvidenceForActivity(input) {
      const rows = await db
        .delete(thresholdEvidence)
        .where(
          and(
            eq(thresholdEvidence.profile_id, input.profileId),
            eq(thresholdEvidence.activity_id, input.activityId),
          ),
        )
        .returning({ id: thresholdEvidence.id });
      return rows.length;
    },

    async listActiveThresholdEvidence(input) {
      const rows = await db
        .select()
        .from(thresholdEvidence)
        .where(
          and(
            eq(thresholdEvidence.profile_id, input.profileId),
            eq(thresholdEvidence.status, "active"),
            gte(thresholdEvidence.observed_at, new Date(input.fromObservedAt)),
            input.after
              ? sql`(${thresholdEvidence.observed_at}, ${thresholdEvidence.id}) > (${new Date(input.after.observedAt)}, ${input.after.evidenceId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(asc(thresholdEvidence.observed_at), asc(thresholdEvidence.id))
        .limit(input.limit + 1);
      return {
        items: rows.slice(0, input.limit).map(mapThresholdEvidenceRow),
        hasMore: rows.length > input.limit,
      };
    },
  };
}
