import { randomUUID } from "node:crypto";

import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  advanceAthleteStateTo,
  advanceObservedAthleteState,
  athleteStateBaselineSchema,
} from "@repo/core";
import {
  BEST_EFFORT_CALCULATION_VERSION,
  calculateCyclingNormalizedPower,
} from "@repo/core/calculations";
import {
  selectThresholdCandidate,
  thresholdEvidenceSchema,
} from "@repo/core/performance-calibration";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityImportRuns,
  activitySegments,
  activitySourceReferences,
  athleteRecalculationQueue,
  dailyTrainingLoad,
  integrations,
  profileAthleteState,
  profileMetrics,
  profilePerformanceEstimates,
  profiles,
  providerSyncJobs,
  thresholds,
  users,
} from "@repo/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE,
  reprocessProfileActivityAnalysis,
} from "../application/activity-analysis/reprocess-profile-activity-analysis";
import { readAthleteReadModel } from "../application/athlete-intelligence/athlete-read-model";
import { materializeActivityAthleteStateEvidence } from "../application/athlete-intelligence/athlete-state-evidence";
import { AthleteStateWorkerService } from "../application/athlete-intelligence/athlete-state-worker";
import {
  readPublishedAthleteStateSnapshot,
  tryPublishIncrementalAthleteStateContribution,
} from "../application/athlete-intelligence/published-athlete-state";
import { withRepeatableReadSnapshot } from "../db";
import { createActivityImportRepository } from "./activity-import-repository";
import {
  attachActivitySourceReference,
  lockActivitySourceResolution,
  resolveCanonicalActivityReference,
} from "./activity-source-reference-repository";
import {
  claimNextAthleteState,
  failAthleteStateClaim,
  markAthleteStateDirty,
  publishAthleteState,
  readPerformanceEffortPage,
  readPublishedAthleteStateSnapshotData,
  renewAthleteStateClaim,
} from "./athlete-state-repository";
import {
  insertThresholdEvaluation,
  planThresholdChain,
  thresholdEffortId,
  thresholdEvaluationId,
} from "./threshold-repository";

const unavailableNormalizedPower = calculateCyclingNormalizedPower({ samples: [] });
const canonicalNormalizedPower = calculateCyclingNormalizedPower({
  samples: Array.from({ length: 361 }, (_, index) => ({
    timestampSeconds: index * 5,
    powerWatts: 200,
  })),
});

const seededProfileIds: string[] = [];

function performanceTargetSnapshot(profileId: string, capturedAt: Date, canonicalLoad = false) {
  return {
    contractVersion: "completed-activity-performance-target-snapshot-v2" as const,
    capturedAt: capturedAt.toISOString(),
    publishedRevision: null,
    publicationStatus: "unavailable" as const,
    targets: buildPerformanceTargetFactsFixture({
      athleteId: profileId,
      asOf: capturedAt.toISOString(),
      ...(canonicalLoad ? { bikeThresholdWatts: 250 } : {}),
    }),
  };
}

function readPublishedReadModel(profileId: string, now: Date, includeLoadHistory = false) {
  return readAthleteReadModel({
    db,
    profileId,
    now,
    sections: {
      publishedState: true,
      status: true,
      currentBaseline: { includePlanningContext: false },
      ...(includeLoadHistory ? { loadHistory: true } : {}),
    },
  });
}

async function waitForBlockedAdvisoryLock(key: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      `select exists (
         select 1 from pg_locks
         where locktype = 'advisory' and granted = false and classid = 0 and objid = $1
       ) as waiting`,
      [key],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Publisher did not reach the estimate insertion fence");
}

async function seedProfile(planningTimezone = "UTC") {
  const profileId = randomUUID();
  const email = `${profileId}@athlete-state.test`;
  const now = new Date("2026-01-01T00:00:00.000Z");
  await db.insert(users).values({
    id: profileId,
    name: "Athlete state test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    planning_timezone: planningTimezone,
    created_at: now,
    updated_at: now,
  });
  seededProfileIds.push(profileId);
  return profileId;
}

async function readDatabaseClock() {
  const result = await pool.query<{ now: Date }>("select clock_timestamp() as now");
  const now = result.rows[0]?.now;
  if (!now) throw new Error("Expected database clock timestamp");
  return now;
}

async function seedIntegration(
  profileId: string,
  provider: "garmin" | "strava" | "trainingpeaks" | "wahoo",
) {
  const id = randomUUID();
  await db.insert(integrations).values({
    id,
    profile_id: profileId,
    provider,
    external_id: `${provider}-${id}`,
  });
  return id;
}

async function seedActivity(input: {
  profileId: string;
  finishedAt: Date;
  commonLoad?: number;
  confidence?: number;
  durationMs?: number;
  canonicalLoad?: boolean;
}) {
  const activityId = randomUUID();
  const artifactId = randomUUID();
  const segmentId = randomUUID();
  const durationMs = input.durationMs ?? 60_000;
  const startedAt = new Date(input.finishedAt.getTime() - durationMs);
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: "Canonical activity",
      started_at: startedAt,
      finished_at: input.finishedAt,
      elapsed_ms: durationMs,
      active_ms: durationMs,
      moving_ms: durationMs,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "athlete-state-live-test-v1",
      decoded_contract_version: "athlete-state-live-test-v1",
      materializer_version: "athlete-state-live-test-v1",
      segments_generated_at: input.finishedAt,
      performance_target_snapshot: performanceTargetSnapshot(
        input.profileId,
        input.finishedAt,
        input.canonicalLoad,
      ),
      athlete_state_common_load: input.commonLoad ?? null,
      athlete_state_activity_category: input.commonLoad === undefined ? null : "run",
      athlete_state_evidence_confidence:
        input.commonLoad === undefined ? null : (input.confidence ?? 0.9),
      athlete_state_capability_distance_meters: input.commonLoad === undefined ? null : 1_000,
      athlete_state_capability_duration_minutes:
        input.commonLoad === undefined ? null : durationMs / 60_000,
      athlete_state_input_version:
        input.commonLoad === undefined ? null : "canonical-activity-state-v1",
      athlete_state_computed_at: input.commonLoad === undefined ? null : input.finishedAt,
      created_at: input.finishedAt,
      updated_at: input.finishedAt,
    });
    await tx.insert(activityArtifacts).values({
      id: artifactId,
      profile_id: input.profileId,
      digest_algorithm: "sha256",
      digest,
      byte_size: 1_024,
      bucket: "activity-files",
      path: `artifacts/sha256/${input.profileId}/${digest}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: input.finishedAt,
    });
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: input.profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: input.finishedAt,
    });
    await tx.insert(activitySegments).values({
      id: segmentId,
      activity_id: activityId,
      profile_id: input.profileId,
      ordinal: 0,
      role: "activity",
      activity_category: input.canonicalLoad ? "bike" : "run",
      start_offset_ms: 0,
      end_offset_ms: durationMs,
      source_artifact_id: artifactId,
      source_session_index: 0,
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: durationMs, movingMs: durationMs },
        distanceMeters: 1_000,
        ...(input.canonicalLoad ? { averagePowerWatts: 200 } : {}),
        normalizedPowerResult: input.canonicalLoad
          ? canonicalNormalizedPower
          : unavailableNormalizedPower,
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: durationMs,
      moving_ms: durationMs,
      segment_revision: 1,
      parser_version: "athlete-state-live-test-v1",
      materializer_version: "athlete-state-live-test-v1",
      created_at: input.finishedAt,
    });
  });
  return activityId;
}

/**
 * The history reprocessor resolves targets as-of each segment's start, rather
 * than using the completed activity's captured target snapshot. Seed a real,
 * effective-dated threshold before replaying canonical bike-load fixtures.
 */
async function seedHistoricalBikePowerThreshold(input: { profileId: string; observedAt: Date }) {
  const sourceActivityId = await seedActivity({
    profileId: input.profileId,
    finishedAt: input.observedAt,
    durationMs: 30 * 60_000,
    canonicalLoad: true,
  });
  const createdAt = new Date();
  await db.transaction(async (tx) => {
    const [sourceSegment] = await tx
      .select({
        id: activitySegments.id,
        sourceArtifactId: activitySegments.source_artifact_id,
        sourceRevision: activitySegments.segment_revision,
      })
      .from(activitySegments)
      .where(eq(activitySegments.activity_id, sourceActivityId))
      .limit(1);
    if (!sourceSegment?.sourceArtifactId) {
      throw new Error("Expected historical threshold source segment");
    }
    const rawPowerWatts = 250 / 0.95;
    const startTimestampSeconds = input.observedAt.getTime() / 1_000 - 1_800;
    const effortId = thresholdEffortId({
      activityId: sourceActivityId,
      segmentId: sourceSegment.id,
      sourceArtifactId: sourceSegment.sourceArtifactId,
      sourceRevision: sourceSegment.sourceRevision,
      effortType: "power",
      sourceSeries: "power",
      startOffsetMs: 0,
      endOffsetMs: 1_800_000,
      method: "activity_file_best_effort",
      calculationVersion: BEST_EFFORT_CALCULATION_VERSION,
    });
    const selection = selectThresholdCandidate({
      activityCategory: "bike",
      metric: "power",
      observations: [
        {
          evidenceId: effortId,
          activityId: sourceActivityId,
          seriesId: "power",
          metric: "power",
          sourceAccepted: true,
          ownershipVerified: true,
          availability: "available",
          durationSeconds: 1_800,
          value: rawPowerWatts,
          startTimestampSeconds,
          endTimestampSeconds: input.observedAt.getTime() / 1_000,
          windowCoverage: 1,
          maximumGapSeconds: 2,
        },
      ],
    });
    if (selection.status !== "qualified") {
      throw new Error("Expected canonical bike threshold selection");
    }
    const primaryAttempt = selection.attempts.find(
      (attempt) =>
        attempt.role === selection.selectedRole && attempt.evaluation.status === "qualified",
    );
    if (!primaryAttempt || primaryAttempt.evaluation.status !== "qualified") {
      throw new Error("Expected canonical qualified bike threshold evaluation");
    }
    const { candidate } = primaryAttempt.evaluation;
    const identity = {
      activityCategory: candidate.activityCategory,
      metric: candidate.metric,
    };
    const evaluationId = thresholdEvaluationId({
      profileId: input.profileId,
      sourceActivityId,
      sourceRevision: sourceSegment.sourceRevision,
      identity,
      method: candidate.method,
      policyVersion: candidate.policyVersion,
    });
    const evidence = thresholdEvidenceSchema.parse({
      ...candidate,
      evidenceId: evaluationId,
      activityId: sourceActivityId,
      observedAt: input.observedAt.toISOString(),
    });
    const plannedThreshold = planThresholdChain({
      profileId: input.profileId,
      identity,
      evidence: [evidence],
      now: createdAt,
    }).desired[0];
    if (!plannedThreshold) throw new Error("Expected canonical bike threshold publication");
    await tx.insert(activityEfforts).values({
      id: effortId,
      created_at: createdAt,
      profile_id: input.profileId,
      activity_id: sourceActivityId,
      segment_id: sourceSegment.id,
      recorded_at: input.observedAt,
      activity_category: "bike",
      effort_type: "power",
      source_series: "power",
      duration_seconds: 1_800,
      source_artifact_id: sourceSegment.sourceArtifactId,
      source_revision: sourceSegment.sourceRevision,
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      window_coverage: 1,
      max_gap_seconds: 2,
      unit: "watts",
      value: rawPowerWatts,
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: BEST_EFFORT_CALCULATION_VERSION,
      provenance: {
        observation_id: effortId,
        activity_id: sourceActivityId,
        segment_id: sourceSegment.id,
        derived_from: "activity_file_stream",
        source_series: "power",
        interval_convention: "current_sample_applies_to_preceding_interval",
        exact_window_start_timestamp_seconds: startTimestampSeconds,
        exact_window_end_timestamp_seconds: input.observedAt.getTime() / 1_000,
        exact_window_start_offset_seconds: 0,
        exact_window_end_offset_seconds: 1_800,
        duration_seconds: 1_800,
        contributing_duration_seconds: 1_800,
        window_coverage: 1,
        source_time_coverage: 1,
        extraction_status: "available",
        extraction_reason: null,
        persisted_start_offset_quantization: "nearest_millisecond_v1",
        calculation_version: BEST_EFFORT_CALCULATION_VERSION,
      },
    });
    await insertThresholdEvaluation(tx, {
      id: evaluationId,
      profileId: input.profileId,
      identity,
      evaluation: primaryAttempt.evaluation,
      selection,
      persistedValue: plannedThreshold.value,
      sourceActivityId,
      sourceRevision: sourceSegment.sourceRevision,
      observedAt: input.observedAt,
      effortLinks: [
        {
          effortId,
          activityId: sourceActivityId,
          sourceRevision: sourceSegment.sourceRevision,
          effortType: "power",
          sourceSeries: "power",
          role: "primary",
          ordinal: 0,
        },
      ],
      now: createdAt,
    });
    await tx.insert(thresholds).values(plannedThreshold);
  });
}

async function markRunMaterial(runId: string, effectiveAt: Date) {
  await db
    .update(activityImportRuns)
    .set({ material_change_count: 1, material_effective_from_at: effectiveAt })
    .where(eq(activityImportRuns.id, runId));
}

afterEach(async () => {
  const profileIds = seededProfileIds.splice(0);
  if (profileIds.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(activityEfforts).where(inArray(activityEfforts.profile_id, profileIds));
    await tx.delete(activities).where(inArray(activities.profile_id, profileIds));
    await tx.execute(
      sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
    );
    await tx
      .update(activityArtifacts)
      .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
      .where(inArray(activityArtifacts.profile_id, profileIds));
    await tx
      .update(activityArtifacts)
      .set({ availability: "deleted", deleted_at: new Date() })
      .where(inArray(activityArtifacts.profile_id, profileIds));
    await tx.execute(
      sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
    );
    await tx.delete(activityArtifacts).where(inArray(activityArtifacts.profile_id, profileIds));
    await tx.delete(profiles).where(inArray(profiles.id, profileIds));
    await tx.delete(users).where(inArray(users.id, profileIds));
  });
});

afterAll(async () => pool.end());

describe("athlete state persistence", () => {
  it("executes the published-state snapshot CTE for a synthetic profile", async () => {
    const profileId = await seedProfile("America/Los_Angeles");

    await expect(readPublishedAthleteStateSnapshotData(db, { profileId })).resolves.toEqual({
      planningTimezone: "America/Los_Angeles",
      current: null,
      blockingImport: null,
    });
  });

  it("publishes a chronological contribution incrementally and agrees with a fenced rebuild", async () => {
    const profileId = await seedProfile();
    const firstFinishedAt = new Date("2026-01-01T10:00:00.000Z");
    await seedHistoricalBikePowerThreshold({
      profileId,
      // The first segment starts at 09:30; history resolves targets at segment start.
      observedAt: new Date("2026-01-01T08:00:00.000Z"),
    });
    const firstActivityId = await seedActivity({
      profileId,
      finishedAt: firstFinishedAt,
      canonicalLoad: true,
      durationMs: 30 * 60_000,
    });
    const firstPublishAt = new Date("2026-01-01T12:00:00.000Z");
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: firstFinishedAt,
        now: firstPublishAt,
      }),
    );
    await new AthleteStateWorkerService({ db }).processDueJobs({
      limit: 1,
      now: firstPublishAt,
    });

    const secondFinishedAt = new Date("2026-01-02T10:00:00.000Z");
    const secondActivityId = await seedActivity({
      profileId,
      finishedAt: secondFinishedAt,
      canonicalLoad: true,
      durationMs: 30 * 60_000,
    });
    const secondPublishAt = new Date("2026-01-02T11:00:00.000Z");
    const secondEvidence = await db.transaction((tx) =>
      materializeActivityAthleteStateEvidence(tx, {
        profileId,
        activityId: secondActivityId,
        computedAt: secondPublishAt,
        contextDb: db,
        deferAthleteStateRefresh: true,
      }),
    );
    if (secondEvidence.commonLoad === null || secondEvidence.confidence === null) {
      throw new Error("Expected canonical second-activity athlete-state evidence");
    }
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
        return tryPublishIncrementalAthleteStateContribution({
          tx,
          profileId,
          contribution: {
            activityId: secondActivityId,
            finishedAt: secondFinishedAt,
            commonLoad: secondEvidence.commonLoad,
            activityCategory: "run",
            evidenceConfidence: secondEvidence.confidence,
            capabilityDistanceMeters: 1_000,
            capabilityDurationMinutes: 1,
          },
          now: secondPublishAt,
        });
      }),
    ).resolves.toBe(true);
    const [incremental] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(incremental).toMatchObject({
      source_revision: 2,
      published_revision: 2,
      dirty_from_at: null,
      computed_at: secondFinishedAt,
    });

    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: firstFinishedAt,
        now: secondPublishAt,
      }),
    );
    await new AthleteStateWorkerService({ db }).processDueJobs({
      limit: 1,
      now: secondPublishAt,
    });
    const [rebuilt] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(rebuilt).toMatchObject({
      source_revision: 3,
      published_revision: 3,
      dirty_from_at: null,
    });
    expect(rebuilt?.fitness).toBeCloseTo(incremental?.fitness ?? -1, 10);
    expect(rebuilt?.fatigue).toBeCloseTo(incremental?.fatigue ?? -1, 10);
    await expect(readPublishedReadModel(profileId, secondPublishAt)).resolves.toMatchObject({
      publishedRevision: 3,
      status: { freshness: "fresh", rebuildStatus: "fresh" },
    });
    expect(firstActivityId).not.toBe(secondActivityId);
  });

  it("renews only the current unexpired replay owner", async () => {
    const profileId = await seedProfile();
    const now = new Date();
    await db.transaction((tx) => markAthleteStateDirty(tx, { profileId, effectiveAt: now }));
    const claim = await claimNextAthleteState(db, { now, leaseMilliseconds: 60_000, profileId });
    if (!claim) throw new Error("Expected athlete-state claim");

    await expect(renewAthleteStateClaim(db, { claim, leaseMilliseconds: 60_000 })).resolves.toBe(
      true,
    );
    await db
      .update(profileAthleteState)
      .set({ lease_token: randomUUID() })
      .where(eq(profileAthleteState.profile_id, profileId));
    await expect(renewAthleteStateClaim(db, { claim, leaseMilliseconds: 60_000 })).resolves.toBe(
      false,
    );
  });

  it("makes a newer coalesced dirty revision immediately claimable while old work is fenced", async () => {
    const profileId = await seedProfile();
    const now = new Date();
    const firstDirtyFromAt = new Date(now.getTime() - 24 * 60 * 60_000);
    const newerEarliestDirtyFromAt = new Date(now.getTime() - 48 * 60 * 60_000);
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, { profileId, effectiveAt: firstDirtyFromAt, now }),
    );
    const staleClaim = await claimNextAthleteState(db, {
      now,
      leaseMilliseconds: 30 * 60_000,
      profileId,
    });
    if (!staleClaim) throw new Error("Expected initial analysis claim");

    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: newerEarliestDirtyFromAt,
        now,
      }),
    );
    const replacementClaim = await claimNextAthleteState(db, {
      now,
      leaseMilliseconds: 60_000,
      profileId,
    });

    expect(replacementClaim).toMatchObject({
      profileId,
      sourceRevision: staleClaim.sourceRevision + 1,
      dirtyFromAt: newerEarliestDirtyFromAt,
      activityAnalysisCursor: null,
    });
    expect(replacementClaim?.leaseToken).not.toBe(staleClaim.leaseToken);
  });

  it("backs off from the next consecutive failure count and fences changed revisions", async () => {
    const profileId = await seedProfile();
    const firstNow = new Date();
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, { profileId, effectiveAt: firstNow, now: firstNow }),
    );
    const firstClaim = await claimNextAthleteState(db, {
      now: firstNow,
      leaseMilliseconds: 60_000,
      profileId,
    });
    if (!firstClaim) throw new Error("Expected first athlete-state claim");
    await expect(
      failAthleteStateClaim(db, {
        claim: firstClaim,
        now: firstNow,
        failureCode: "first_failure",
      }),
    ).resolves.toBe(true);
    const [firstFailure] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(firstFailure).toMatchObject({
      consecutive_failures: 1,
      last_failure_code: "first_failure",
    });
    expect(firstFailure?.retry_after).toEqual(new Date(firstNow.getTime() + 2 * 60_000));

    await db
      .update(profileAthleteState)
      .set({ retry_after: null })
      .where(eq(profileAthleteState.profile_id, profileId));
    const secondClaim = await claimNextAthleteState(db, {
      now: firstNow,
      leaseMilliseconds: 60_000,
      profileId,
    });
    if (!secondClaim) throw new Error("Expected second athlete-state claim");
    const secondNow = new Date(firstNow.getTime() + 10_000);
    await expect(
      failAthleteStateClaim(db, {
        claim: secondClaim,
        now: secondNow,
        failureCode: "second_failure",
      }),
    ).resolves.toBe(true);
    const [secondFailure] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(secondFailure).toMatchObject({
      consecutive_failures: 2,
      last_failure_code: "second_failure",
    });
    expect(secondFailure?.retry_after).toEqual(new Date(secondNow.getTime() + 4 * 60_000));

    await db
      .update(profileAthleteState)
      .set({ retry_after: null })
      .where(eq(profileAthleteState.profile_id, profileId));
    const staleClaim = await claimNextAthleteState(db, {
      now: secondNow,
      leaseMilliseconds: 60_000,
      profileId,
    });
    if (!staleClaim) throw new Error("Expected stale athlete-state claim fixture");
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: secondNow,
        now: secondNow,
      }),
    );
    await expect(
      failAthleteStateClaim(db, {
        claim: staleClaim,
        now: secondNow,
        failureCode: "must_not_apply",
      }),
    ).resolves.toBe(false);
    const [fenced] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(fenced).toMatchObject({
      consecutive_failures: 2,
      last_failure_code: "second_failure",
      source_revision: staleClaim.sourceRevision + 1,
    });
  });

  it("excludes effort evidence from activities completed after the replay as-of", async () => {
    const profileId = await seedProfile();
    const asOf = new Date("2026-08-06T12:00:00.000Z");
    const pastActivityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-08-06T11:00:00.000Z"),
    });
    const futureActivityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-08-06T13:00:00.000Z"),
    });
    const segments = await db
      .select({
        activityId: activitySegments.activity_id,
        id: activitySegments.id,
        sourceArtifactId: activitySegments.source_artifact_id,
        sourceRevision: activitySegments.segment_revision,
      })
      .from(activitySegments)
      .where(inArray(activitySegments.activity_id, [pastActivityId, futureActivityId]));
    const segmentByActivity = new Map(segments.map((row) => [row.activityId, row.id]));
    const sourceByActivity = new Map(segments.map((row) => [row.activityId, row]));
    const pastSegmentId = segmentByActivity.get(pastActivityId);
    const futureSegmentId = segmentByActivity.get(futureActivityId);
    if (!pastSegmentId || !futureSegmentId) throw new Error("Expected seeded activity segments");
    const pastSource = sourceByActivity.get(pastActivityId);
    const futureSource = sourceByActivity.get(futureActivityId);
    if (!pastSource?.sourceArtifactId || !futureSource?.sourceArtifactId) {
      throw new Error("Expected seeded effort sources");
    }
    const pastEffortId = randomUUID();
    const futureEffortId = randomUUID();
    const futureRecordedEffortId = randomUUID();
    await db.insert(activityEfforts).values([
      {
        id: pastEffortId,
        created_at: new Date("2026-08-06T10:50:00.000Z"),
        profile_id: profileId,
        activity_id: pastActivityId,
        segment_id: pastSegmentId,
        recorded_at: new Date("2026-08-06T10:50:00.000Z"),
        activity_category: "run" as const,
        effort_type: "speed" as const,
        source_series: "raw_speed" as const,
        duration_seconds: 60,
        distance_meters: 240,
        source_artifact_id: pastSource.sourceArtifactId,
        source_revision: pastSource.sourceRevision,
        start_offset_ms: 0,
        end_offset_ms: 60_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "meters_per_second",
        value: 4,
        source: "test" as const,
        method: "athlete_state_read_test",
        calculation_version: "test-v1",
        provenance: { observation_id: pastEffortId },
      },
      {
        id: futureEffortId,
        created_at: new Date("2026-08-06T12:50:00.000Z"),
        profile_id: profileId,
        activity_id: futureActivityId,
        segment_id: futureSegmentId,
        recorded_at: new Date("2026-08-06T12:50:00.000Z"),
        activity_category: "run" as const,
        effort_type: "speed" as const,
        source_series: "raw_speed" as const,
        duration_seconds: 60,
        distance_meters: 300,
        source_artifact_id: futureSource.sourceArtifactId,
        source_revision: futureSource.sourceRevision,
        start_offset_ms: 0,
        end_offset_ms: 60_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "meters_per_second",
        value: 5,
        source: "test" as const,
        method: "athlete_state_read_test",
        calculation_version: "test-v1",
        provenance: { observation_id: futureEffortId },
      },
      {
        id: futureRecordedEffortId,
        created_at: new Date("2026-08-06T13:10:00.000Z"),
        profile_id: profileId,
        activity_id: pastActivityId,
        segment_id: pastSegmentId,
        recorded_at: new Date("2026-08-06T13:10:00.000Z"),
        activity_category: "run" as const,
        effort_type: "speed" as const,
        source_series: "raw_speed" as const,
        duration_seconds: 60,
        distance_meters: 270,
        source_artifact_id: pastSource.sourceArtifactId,
        source_revision: pastSource.sourceRevision,
        start_offset_ms: 0,
        end_offset_ms: 60_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "meters_per_second",
        value: 4.5,
        source: "test" as const,
        method: "athlete_state_late_read_test",
        calculation_version: "test-v1",
        provenance: { observation_id: futureRecordedEffortId },
      },
    ]);

    await expect(
      readPerformanceEffortPage(db, {
        profileId,
        cursorId: null,
        limit: 100,
        notAfter: asOf,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: pastEffortId })]);
  });

  it("converges trusted cross-provider identities while preserving direct source references", async () => {
    const profileId = await seedProfile();
    const canonicalActivityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-01-01T10:00:00.000Z"),
    });
    const unrelatedActivityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-01-02T10:00:00.000Z"),
    });
    const garminId = await seedIntegration(profileId, "garmin");
    const stravaId = await seedIntegration(profileId, "strava");
    const trainingPeaksId = await seedIntegration(profileId, "trainingpeaks");
    const wahooId = await seedIntegration(profileId, "wahoo");
    const origin = {
      originProvider: "fit-origin",
      originExternalId: "origin-activity-1",
      originTrust: "trusted_provider_origin" as const,
    };

    await db.transaction(async (tx) => {
      await lockActivitySourceResolution(tx, profileId);
      await attachActivitySourceReference(tx, {
        profileId,
        activityId: canonicalActivityId,
        integrationId: garminId,
        provider: "garmin",
        providerExternalId: "garmin-activity-1",
        ...origin,
      });
    });

    await expect(
      db.transaction(async (tx) => {
        await lockActivitySourceResolution(tx, profileId);
        return resolveCanonicalActivityReference(tx, {
          profileId,
          integrationId: stravaId,
          provider: "strava",
          providerExternalId: "untrusted-strava-activity",
          originProvider: origin.originProvider,
          originExternalId: origin.originExternalId,
        });
      }),
    ).rejects.toThrow("requires explicit trusted provenance");

    await Promise.all(
      [
        { integrationId: stravaId, provider: "strava", providerExternalId: "strava-activity-1" },
        {
          integrationId: trainingPeaksId,
          provider: "trainingpeaks",
          providerExternalId: "trainingpeaks-activity-1",
        },
      ].map((source) =>
        db.transaction(async (tx) => {
          await lockActivitySourceResolution(tx, profileId);
          const resolved = await resolveCanonicalActivityReference(tx, {
            profileId,
            ...source,
            ...origin,
          });
          expect(resolved).toBe(canonicalActivityId);
          await attachActivitySourceReference(tx, {
            profileId,
            activityId: resolved as string,
            ...source,
            ...origin,
          });
        }),
      ),
    );

    await db.transaction(async (tx) => {
      await attachActivitySourceReference(tx, {
        profileId,
        activityId: canonicalActivityId,
        integrationId: wahooId,
        provider: "wahoo",
        providerExternalId: "same-raw-id",
      });
      await attachActivitySourceReference(tx, {
        profileId,
        activityId: unrelatedActivityId,
        integrationId: stravaId,
        provider: "strava",
        providerExternalId: "same-raw-id",
      });
    });

    const references = await db
      .select()
      .from(activitySourceReferences)
      .where(eq(activitySourceReferences.profile_id, profileId));
    expect(
      references.filter((reference) => reference.activity_id === canonicalActivityId),
    ).toHaveLength(4);
    expect(
      references.find(
        (reference) =>
          reference.provider === "strava" && reference.provider_external_id === "same-raw-id",
      )?.activity_id,
    ).toBe(unrelatedActivityId);
  });

  it("rejects publication after the owned lease expires without a replacement claimant", async () => {
    const profileId = await seedProfile();
    const now = new Date("2026-08-06T12:00:00.000Z");
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
        now,
      }),
    );
    const claim = await claimNextAthleteState(db, { now, leaseMilliseconds: 60_000, profileId });
    if (!claim) throw new Error("Expected athlete-state claim");
    await db
      .update(profileAthleteState)
      .set({ lease_expires_at: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(profileAthleteState.profile_id, profileId));

    await expect(
      publishAthleteState(db, {
        claim,
        state: {
          fitness: 10,
          fatigue: 8,
          evidenceConfidence: 0.8,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        },
        estimates: [],
        now,
      }),
    ).resolves.toBe(false);
    const [state] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(state?.published_revision).toBe(0);
  });

  it("publishes a partial same-day replay without advancing through a future day-end", async () => {
    const profileId = await seedProfile("UTC");
    const finishedAt = new Date("2026-08-06T15:00:00.000Z");
    await seedHistoricalBikePowerThreshold({
      profileId,
      observedAt: new Date("2026-08-06T12:00:00.000Z"),
    });
    const activityId = await seedActivity({
      profileId,
      finishedAt,
      canonicalLoad: true,
      durationMs: 30 * 60_000,
    });
    const now = new Date("2026-08-06T16:00:00.000Z");
    await expect(
      reprocessProfileActivityAnalysis(db, {
        profileId,
        apply: false,
        from: finishedAt,
        now,
      }),
    ).resolves.toMatchObject({
      scopedActivities: 1,
      availableSegments: 1,
      partialSegments: 0,
      unavailableSegments: 0,
    });
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, { profileId, effectiveAt: finishedAt, now }),
    );

    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    await expect(
      db
        .select({ commonLoad: activities.athlete_state_common_load })
        .from(activities)
        .where(eq(activities.id, activityId)),
    ).resolves.toEqual([expect.objectContaining({ commonLoad: expect.any(Number) })]);
    const [state] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(state?.computed_at).toEqual(now);
    expect(state?.last_activity_at).toEqual(finishedAt);
  });

  it("publishes due evidence while retaining a future-due revision until it becomes observable", async () => {
    const profileId = await seedProfile("UTC");
    const currentFinishedAt = new Date("2026-08-06T10:00:00.000Z");
    const futureFinishedAt = new Date("2026-08-07T10:00:00.000Z");
    const futureEffortRecordedAt = new Date("2026-08-07T08:00:00.000Z");
    await seedHistoricalBikePowerThreshold({
      profileId,
      // The current segment starts at 09:30; history resolves targets at segment start.
      observedAt: new Date("2026-08-06T08:00:00.000Z"),
    });
    const currentActivityId = await seedActivity({
      profileId,
      finishedAt: currentFinishedAt,
      canonicalLoad: true,
      durationMs: 30 * 60_000,
    });
    await seedActivity({
      profileId,
      finishedAt: futureFinishedAt,
      canonicalLoad: true,
      durationMs: 30 * 60_000,
    });
    const currentNow = new Date("2026-08-06T12:00:00.000Z");
    const [currentSegment] = await db
      .select({
        id: activitySegments.id,
        sourceArtifactId: activitySegments.source_artifact_id,
        sourceRevision: activitySegments.segment_revision,
      })
      .from(activitySegments)
      .where(eq(activitySegments.activity_id, currentActivityId))
      .limit(1);
    if (!currentSegment?.sourceArtifactId) throw new Error("Expected current activity segment");
    await db.insert(activityEfforts).values({
      id: randomUUID(),
      created_at: currentNow,
      profile_id: profileId,
      activity_id: currentActivityId,
      segment_id: currentSegment.id,
      recorded_at: futureEffortRecordedAt,
      activity_category: "bike",
      effort_type: "speed",
      source_series: "raw_speed",
      duration_seconds: 60,
      distance_meters: 250,
      source_artifact_id: currentSegment.sourceArtifactId,
      source_revision: currentSegment.sourceRevision,
      start_offset_ms: 0,
      end_offset_ms: 60_000,
      window_coverage: 1,
      max_gap_seconds: 2,
      unit: "meters_per_second",
      value: 4.1667,
      source: "test",
      method: "athlete_state_dirty_test",
      calculation_version: "test-v1",
      provenance: { observation_id: "future-effort" },
    });
    await db.transaction(async (tx) => {
      await markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: currentFinishedAt,
        now: currentNow,
      });
      await markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: futureFinishedAt,
        now: currentNow,
      });
    });

    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now: currentNow }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    const [pending] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(pending).toMatchObject({
      source_revision: 3,
      published_revision: 2,
      dirty_from_at: futureEffortRecordedAt,
      last_activity_at: currentFinishedAt,
    });
    await expect(readPublishedReadModel(profileId, currentNow, true)).resolves.toMatchObject({
      publishedRevision: 2,
      status: { freshness: "fresh", rebuildStatus: "fresh" },
      currentBaseline: { baseline: expect.objectContaining({ stateRevision: 2 }) },
      loadHistory: expect.objectContaining({
        publishedRevision: 2,
        algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      }),
    });

    const futureNow = new Date("2026-08-07T12:00:00.000Z");
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now: futureNow }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    const [current] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(current).toMatchObject({
      source_revision: 3,
      published_revision: 3,
      dirty_from_at: null,
      last_activity_at: futureFinishedAt,
    });
    await expect(readPublishedReadModel(profileId, futureNow, true)).resolves.toMatchObject({
      publishedRevision: 3,
      algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      status: { freshness: "fresh", rebuildStatus: "fresh" },
      loadHistory: {
        publishedRevision: 3,
        algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      },
    });
  });

  it("retains a future effort on an old activity until its observation time becomes due", async () => {
    const profileId = await seedProfile("UTC");
    const databaseNow = await readDatabaseClock();
    const activityFinishedAt = new Date(databaseNow.getTime() - 5 * 86_400_000);
    const beforeDue = new Date(databaseNow.getTime() + 60_000);
    const effortRecordedAt = new Date(beforeDue.getTime() + 86_400_000);
    const activityId = await seedActivity({
      profileId,
      finishedAt: activityFinishedAt,
      durationMs: 30 * 60_000,
      canonicalLoad: true,
    });
    await db.transaction(async (tx) => {
      await materializeActivityAthleteStateEvidence(tx, {
        profileId,
        activityId,
        computedAt: beforeDue,
        contextDb: db,
        canonicalEvidenceMaterialChanged: true,
      });
    });
    const [initialState] = await db
      .select({
        sourceRevision: profileAthleteState.source_revision,
        publishedRevision: profileAthleteState.published_revision,
        dirtyFromAt: profileAthleteState.dirty_from_at,
        leaseToken: profileAthleteState.lease_token,
        failureCode: profileAthleteState.last_failure_code,
      })
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    const initialDailyLoads = await db
      .select({
        commonLoad: dailyTrainingLoad.common_load,
        sourceRevision: dailyTrainingLoad.source_revision,
      })
      .from(dailyTrainingLoad)
      .where(eq(dailyTrainingLoad.profile_id, profileId));
    const initialQueue = await db
      .select()
      .from(athleteRecalculationQueue)
      .where(eq(athleteRecalculationQueue.profile_id, profileId));
    expect(initialState).toEqual({
      sourceRevision: 1,
      publishedRevision: 1,
      dirtyFromAt: null,
      leaseToken: null,
      failureCode: null,
    });
    expect(initialDailyLoads).toEqual([
      expect.objectContaining({ commonLoad: expect.any(Number), sourceRevision: 1 }),
    ]);
    expect(initialDailyLoads[0]?.commonLoad).toBeGreaterThan(0);
    expect(initialQueue).toEqual([]);
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now: beforeDue }),
    ).resolves.toEqual({ completed: 0, failed: 0, processed: 0 });

    await db.transaction(async (tx) => {
      const [segment] = await tx
        .select({
          id: activitySegments.id,
          sourceArtifactId: activitySegments.source_artifact_id,
          sourceRevision: activitySegments.segment_revision,
        })
        .from(activitySegments)
        .where(eq(activitySegments.activity_id, activityId))
        .limit(1);
      if (!segment?.sourceArtifactId) throw new Error("Expected future-effort segment");
      await tx.insert(activityEfforts).values({
        id: randomUUID(),
        created_at: beforeDue,
        profile_id: profileId,
        activity_id: activityId,
        segment_id: segment.id,
        recorded_at: effortRecordedAt,
        activity_category: "bike",
        effort_type: "heart_rate",
        source_series: "heart_rate",
        duration_seconds: 1_200,
        source_artifact_id: segment.sourceArtifactId,
        source_revision: segment.sourceRevision,
        start_offset_ms: 0,
        end_offset_ms: 1_200_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "bpm",
        value: 178,
        source: "derived",
        method: "future_lthr_test",
        calculation_version: "test-v1",
        quality_score: 0.9,
        provenance: { observation_id: "future-lthr" },
      });
      await expect(
        materializeActivityAthleteStateEvidence(tx, {
          profileId,
          activityId,
          computedAt: beforeDue,
          contextDb: db,
          effortMaterialRecordedAt: effortRecordedAt,
        }),
      ).resolves.toMatchObject({ effectiveAt: effortRecordedAt, materialChanged: true });
    });

    const [pending] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(pending).toMatchObject({
      source_revision: 2,
      published_revision: 1,
      dirty_from_at: effortRecordedAt,
      lease_token: null,
      lease_expires_at: null,
    });
    const pendingQueue = await db
      .select()
      .from(athleteRecalculationQueue)
      .where(eq(athleteRecalculationQueue.profile_id, profileId));
    expect(pendingQueue).toEqual([
      expect.objectContaining({
        profile_id: profileId,
        source_revision: 2,
        earliest_affected_at: effortRecordedAt,
      }),
    ]);
    const pendingDailyLoads = await db
      .select({
        commonLoad: dailyTrainingLoad.common_load,
        sourceRevision: dailyTrainingLoad.source_revision,
      })
      .from(dailyTrainingLoad)
      .where(eq(dailyTrainingLoad.profile_id, profileId));
    expect(pendingDailyLoads).toEqual(initialDailyLoads);
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({
        limit: 1,
        now: new Date(beforeDue.getTime() + 6 * 60 * 60_000),
      }),
    ).resolves.toEqual({ completed: 0, failed: 0, processed: 0 });
    const [earlyState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(earlyState).toEqual(pending);
    const earlyQueue = await db
      .select()
      .from(athleteRecalculationQueue)
      .where(eq(athleteRecalculationQueue.profile_id, profileId));
    expect(earlyQueue).toEqual(pendingQueue);
    const earlyDailyLoads = await db
      .select({
        commonLoad: dailyTrainingLoad.common_load,
        sourceRevision: dailyTrainingLoad.source_revision,
      })
      .from(dailyTrainingLoad)
      .where(eq(dailyTrainingLoad.profile_id, profileId));
    expect(earlyDailyLoads).toEqual(pendingDailyLoads);
    expect(earlyDailyLoads[0]?.commonLoad).toBeGreaterThan(0);
    await expect(readPublishedReadModel(profileId, beforeDue)).resolves.toMatchObject({
      publishedRevision: 1,
      status: { freshness: "fresh", rebuildStatus: "fresh" },
    });
    await expect(
      db
        .select()
        .from(profilePerformanceEstimates)
        .where(
          and(
            eq(profilePerformanceEstimates.profile_id, profileId),
            eq(profilePerformanceEstimates.capability_kind, "run_lthr"),
          ),
        ),
    ).resolves.toEqual([]);

    const afterDue = new Date(effortRecordedAt.getTime() + 60 * 60_000);
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now: afterDue }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    await expect(
      db
        .select()
        .from(profilePerformanceEstimates)
        .where(
          and(
            eq(profilePerformanceEstimates.profile_id, profileId),
            eq(profilePerformanceEstimates.capability_kind, "run_lthr"),
          ),
        ),
    ).resolves.toEqual([]);
    await expect(readPublishedReadModel(profileId, afterDue)).resolves.toMatchObject({
      publishedRevision: 2,
      status: { freshness: "fresh", rebuildStatus: "fresh" },
    });
  });

  it("does not claim an early-recorded effort before its future parent activity finishes", async () => {
    const profileId = await seedProfile("UTC");
    const databaseNow = await readDatabaseClock();
    const beforeDue = new Date(databaseNow.getTime() + 60_000);
    const effortRecordedAt = new Date(beforeDue.getTime() + 86_400_000);
    const activityFinishedAt = new Date(effortRecordedAt.getTime() + 86_400_000);
    const activityId = await seedActivity({
      profileId,
      finishedAt: activityFinishedAt,
      durationMs: 30 * 60_000,
      canonicalLoad: true,
    });

    await db.transaction(async (tx) => {
      const [segment] = await tx
        .select({
          id: activitySegments.id,
          sourceArtifactId: activitySegments.source_artifact_id,
          sourceRevision: activitySegments.segment_revision,
        })
        .from(activitySegments)
        .where(eq(activitySegments.activity_id, activityId))
        .limit(1);
      if (!segment?.sourceArtifactId) throw new Error("Expected future parent segment");
      await tx.insert(activityEfforts).values({
        id: randomUUID(),
        created_at: beforeDue,
        profile_id: profileId,
        activity_id: activityId,
        segment_id: segment.id,
        recorded_at: effortRecordedAt,
        activity_category: "bike",
        effort_type: "heart_rate",
        source_series: "heart_rate",
        duration_seconds: 1_200,
        source_artifact_id: segment.sourceArtifactId,
        source_revision: segment.sourceRevision,
        start_offset_ms: 0,
        end_offset_ms: 1_200_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "bpm",
        value: 176,
        source: "derived",
        method: "future_parent_lthr_test",
        calculation_version: "test-v1",
        quality_score: 0.9,
        provenance: { observation_id: "future-parent-lthr" },
      });
      await expect(
        materializeActivityAthleteStateEvidence(tx, {
          profileId,
          activityId,
          computedAt: beforeDue,
          contextDb: db,
          effortMaterialRecordedAt: effortRecordedAt,
        }),
      ).resolves.toMatchObject({ effectiveAt: activityFinishedAt, materialChanged: true });
    });

    const [pending] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(pending).toMatchObject({
      source_revision: 1,
      published_revision: 0,
      dirty_from_at: activityFinishedAt,
      lease_token: null,
    });
    const pendingQueue = await db
      .select()
      .from(athleteRecalculationQueue)
      .where(eq(athleteRecalculationQueue.profile_id, profileId));
    expect(pendingQueue).toEqual([
      expect.objectContaining({
        profile_id: profileId,
        source_revision: 1,
        earliest_affected_at: activityFinishedAt,
      }),
    ]);
    const afterEffortBeforeActivity = new Date(effortRecordedAt.getTime() + 60 * 60_000);
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({
        limit: 1,
        now: afterEffortBeforeActivity,
      }),
    ).resolves.toEqual({ completed: 0, failed: 0, processed: 0 });
    const [earlyState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(earlyState).toEqual(pending);
    const earlyQueue = await db
      .select()
      .from(athleteRecalculationQueue)
      .where(eq(athleteRecalculationQueue.profile_id, profileId));
    expect(earlyQueue).toEqual(pendingQueue);
    await expect(
      db
        .select()
        .from(profilePerformanceEstimates)
        .where(eq(profilePerformanceEstimates.profile_id, profileId)),
    ).resolves.toEqual([]);

    const afterDue = new Date(activityFinishedAt.getTime() + 60 * 60_000);
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now: afterDue }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    await expect(
      db
        .select()
        .from(profilePerformanceEstimates)
        .where(
          and(
            eq(profilePerformanceEstimates.profile_id, profileId),
            eq(profilePerformanceEstimates.capability_kind, "run_lthr"),
          ),
        ),
    ).resolves.toEqual([]);
    await expect(readPublishedReadModel(profileId, afterDue)).resolves.toMatchObject({
      publishedRevision: 1,
      status: { freshness: "fresh", rebuildStatus: "fresh" },
    });
  });

  it("coalesces concurrent same-profile bulk creation and starts one effective run", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const now = new Date("2026-08-06T12:00:00.000Z");
    const runs = await Promise.all(
      Array.from({ length: 8 }, () =>
        imports.create({
          profileId,
          integrationId,
          integrationGeneration: 1,
          kind: "history_sync",
          nextPage: 1,
          now,
        }),
      ),
    );
    expect(new Set(runs.map(({ id }) => id))).toHaveLength(1);
    const started = await Promise.all(runs.map(({ id }) => imports.start(id, now)));
    expect(started.every((run) => run?.status === "running")).toBe(true);
    const persisted = await db
      .select()
      .from(activityImportRuns)
      .where(eq(activityImportRuns.profile_id, profileId));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ status: "running", failed_count: 0 });

    const otherIntegrationId = await seedIntegration(profileId, "garmin");
    const deferred = await imports.create({
      profileId,
      integrationId: otherIntegrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      nextPage: 1,
      now,
    });
    await expect(imports.start(deferred.id, now)).resolves.toBeNull();
    const allBulkRuns = await db
      .select()
      .from(activityImportRuns)
      .where(eq(activityImportRuns.profile_id, profileId));
    expect(allBulkRuns.map(({ status }) => status).sort()).toEqual(["queued", "running"]);
  });

  it.each([
    "queued",
    "running",
    "failed",
  ] as const)("does not reuse a %s import run for a different requested kind", async (status) => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const existing = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
    });
    if (status === "running" || status === "failed") {
      await imports.start(existing.id);
    }
    if (status === "failed") await imports.fail(existing.id, "provider_unavailable");

    const requested = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "manual_sync",
    });

    expect(requested).toMatchObject({ kind: "manual_sync", status: "queued" });
    expect(requested.id).not.toBe(existing.id);
    const persisted = await db
      .select({ id: activityImportRuns.id, kind: activityImportRuns.kind })
      .from(activityImportRuns)
      .where(eq(activityImportRuns.profile_id, profileId));
    expect(persisted).toEqual(
      expect.arrayContaining([
        { id: existing.id, kind: "history_sync" },
        { id: requested.id, kind: "manual_sync" },
      ]),
    );
  });

  it("reports failed import freshness before deferred pages create a state revision", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      nextPage: 1,
    });
    await imports.start(run.id);
    await imports.fail(run.id, "provider_unavailable");

    await expect(
      readPublishedReadModel(profileId, new Date("2026-08-06T12:00:00.000Z")),
    ).resolves.toMatchObject({
      publishedRevision: null,
      publishedState: null,
      status: { freshness: "unavailable", rebuildStatus: "failed", importStatus: "failed" },
      currentBaseline: { baseline: null },
    });
  });

  it.each([
    "manual_sync",
    "history_sync",
  ] as const)("supersedes a covered failed onboarding run only after a successful %s completes", async (successfulKind) => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const windowStart = new Date("1900-01-01T00:00:00.000Z");
    const windowEnd = new Date("2026-08-06T12:00:00.000Z");
    const failed = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "onboarding",
      windowStartAt: windowStart,
      windowEndAt: windowEnd,
      nextPage: 1,
    });
    await imports.start(failed.id);
    await imports.fail(failed.id, "provider_unavailable");

    const successful = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: successfulKind,
      windowStartAt: windowStart,
      windowEndAt: windowEnd,
      nextPage: 1,
    });
    await imports.start(successful.id);
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, { profileId, effectiveAt: windowEnd, now: windowEnd }),
    );
    await expect(
      claimNextAthleteState(db, {
        now: windowEnd,
        leaseMilliseconds: 60_000,
        profileId,
      }),
    ).resolves.toBeNull();
    await imports.recordPageCommitted({
      id: successful.id,
      discovered: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      earliestActivityAt: null,
      latestActivityAt: null,
      nextPage: null,
      now: windowEnd,
    });
    await imports.complete(successful.id, windowEnd);

    const [retainedFailure] = await db
      .select({
        status: activityImportRuns.status,
        lastErrorCode: activityImportRuns.last_error_code,
        supersededByRunId: activityImportRuns.superseded_by_run_id,
      })
      .from(activityImportRuns)
      .where(eq(activityImportRuns.id, failed.id));
    expect(retainedFailure).toEqual({
      status: "failed",
      lastErrorCode: "provider_unavailable",
      supersededByRunId: successful.id,
    });

    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now: windowEnd }),
    ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
    await expect(readPublishedReadModel(profileId, windowEnd)).resolves.toMatchObject({
      publishedRevision: 1,
      status: { freshness: "fresh", rebuildStatus: "fresh", importStatus: "complete" },
    });
  });

  it("does not supersede a failed import with incomplete coverage or a nonzero failure count", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const windowStart = new Date("1900-01-01T00:00:00.000Z");
    const windowEnd = new Date("2026-08-06T12:00:00.000Z");
    const failed = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "onboarding",
      windowStartAt: windowStart,
      windowEndAt: windowEnd,
      nextPage: 1,
    });
    await imports.start(failed.id);
    await imports.fail(failed.id, "provider_unavailable");

    const incomplete = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "manual_sync",
      windowStartAt: new Date("2020-01-01T00:00:00.000Z"),
      windowEndAt: windowEnd,
      nextPage: 1,
    });
    await imports.start(incomplete.id);
    await imports.complete(incomplete.id, windowEnd);

    const partialFailure = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      windowStartAt: windowStart,
      windowEndAt: windowEnd,
      nextPage: 1,
    });
    await imports.start(partialFailure.id);
    await imports.recordPageCommitted({
      id: partialFailure.id,
      discovered: 1,
      imported: 0,
      skipped: 0,
      failed: 1,
      earliestActivityAt: null,
      latestActivityAt: null,
      nextPage: null,
      now: windowEnd,
    });
    await imports.complete(partialFailure.id, windowEnd);

    const [retainedFailure] = await db
      .select({ supersededAt: activityImportRuns.superseded_at })
      .from(activityImportRuns)
      .where(eq(activityImportRuns.id, failed.id));
    expect(retainedFailure).toEqual({ supersededAt: null });
    await expect(readPublishedReadModel(profileId, windowEnd)).resolves.toMatchObject({
      status: { freshness: "unavailable", rebuildStatus: "failed", importStatus: "failed" },
    });
  });

  it("does not dirty state for direct or trusted cross-provider duplicate attachment", async () => {
    const profileId = await seedProfile();
    const garminId = await seedIntegration(profileId, "garmin");
    const stravaId = await seedIntegration(profileId, "strava");
    const activityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const imports = createActivityImportRepository(db);
    const origin = {
      originProvider: "fit-origin",
      originExternalId: "duplicate-origin",
      originTrust: "trusted_provider_origin" as const,
    };
    await db.transaction((tx) =>
      attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId: garminId,
        provider: "garmin",
        providerExternalId: "garmin-duplicate",
        ...origin,
      }),
    );

    const directRun = await imports.create({
      profileId,
      integrationId: garminId,
      integrationGeneration: 1,
      kind: "history_sync",
    });
    await imports.start(directRun.id);
    await db.transaction((tx) =>
      attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId: garminId,
        provider: "garmin",
        providerExternalId: "garmin-duplicate",
        importRunId: directRun.id,
        ...origin,
      }),
    );
    await imports.recordPageCommitted({
      id: directRun.id,
      discovered: 1,
      imported: 0,
      skipped: 1,
      failed: 0,
      earliestActivityAt: null,
      latestActivityAt: null,
    });
    await imports.complete(directRun.id);

    const crossProviderRun = await imports.create({
      profileId,
      integrationId: stravaId,
      integrationGeneration: 1,
      kind: "history_sync",
    });
    await imports.start(crossProviderRun.id);
    await db.transaction((tx) =>
      attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId: stravaId,
        provider: "strava",
        providerExternalId: "strava-duplicate",
        importRunId: crossProviderRun.id,
        ...origin,
      }),
    );
    await imports.recordPageCommitted({
      id: crossProviderRun.id,
      discovered: 1,
      imported: 0,
      skipped: 1,
      failed: 0,
      earliestActivityAt: null,
      latestActivityAt: null,
    });
    await imports.complete(crossProviderRun.id);

    await expect(
      db.select().from(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([]);
  });

  it("recovers a material page signal after activity commit and retry bookkeeping", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const activityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      nextPage: 1,
    });
    await imports.start(run.id);

    await db.transaction(async (tx) => {
      const [segment] = await tx
        .select({
          id: activitySegments.id,
          sourceArtifactId: activitySegments.source_artifact_id,
          sourceRevision: activitySegments.segment_revision,
        })
        .from(activitySegments)
        .where(eq(activitySegments.activity_id, activityId))
        .limit(1);
      if (!segment?.sourceArtifactId) throw new Error("Expected seeded activity segment");
      await tx.insert(activityEfforts).values({
        id: randomUUID(),
        created_at: new Date("2026-08-01T10:00:00.000Z"),
        profile_id: profileId,
        activity_id: activityId,
        segment_id: segment.id,
        recorded_at: new Date("2026-08-01T10:00:00.000Z"),
        activity_category: "run",
        effort_type: "speed",
        source_series: "raw_speed",
        duration_seconds: 60,
        distance_meters: 250,
        source_artifact_id: segment.sourceArtifactId,
        source_revision: segment.sourceRevision,
        start_offset_ms: 0,
        end_offset_ms: 60_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "meters_per_second",
        value: 4.1667,
        source: "derived",
        method: "test_effort",
        calculation_version: "test-v1",
        provenance: { observation_id: "replay-effort" },
      });
      const materialized = await materializeActivityAthleteStateEvidence(tx, {
        profileId,
        activityId,
        computedAt: new Date("2026-08-01T10:00:00.000Z"),
        contextDb: db,
        deferAthleteStateRefresh: true,
        effortMaterialRecordedAt: new Date("2026-08-01T10:00:00.000Z"),
      });
      expect(materialized.materialChanged).toBe(true);
      await attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId,
        provider: "wahoo",
        providerExternalId: "crash-retry-activity",
        importRunId: run.id,
      });
      await tx
        .update(activitySourceReferences)
        .set({
          last_material_import_run_id: run.id,
          last_material_effective_at: new Date("2026-08-01T10:00:00.000Z"),
        })
        .where(eq(activitySourceReferences.provider_external_id, "crash-retry-activity"));
    });
    expect((await imports.read(run.id))?.material_change_count).toBe(0);

    await imports.recordPageCommitted({
      id: run.id,
      discovered: 1,
      imported: 0,
      skipped: 1,
      failed: 0,
      earliestActivityAt: null,
      latestActivityAt: null,
    });
    const completed = await imports.complete(run.id);
    await imports.complete(run.id);
    expect(completed).toMatchObject({
      material_change_count: 1,
      material_effective_from_at: new Date("2026-08-01T10:00:00.000Z"),
    });
    const [state] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(state).toMatchObject({ source_revision: 1, published_revision: 0 });
  });

  it("does not refresh state for imported rows without material athlete evidence", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
    });
    await imports.start(run.id);
    await imports.recordPageCommitted({
      id: run.id,
      discovered: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
      earliestActivityAt: new Date("2026-08-01T10:00:00.000Z"),
      latestActivityAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    await imports.complete(run.id);

    await expect(
      db.select().from(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([]);
  });

  it("defers one state refresh for a material import while profile metrics remain neutral", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const effectiveAt = new Date("2026-08-01T10:00:00.000Z");
    await seedActivity({ profileId, finishedAt: effectiveAt });
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
    });
    await imports.start(run.id);
    await markRunMaterial(run.id, effectiveAt);

    await db.insert(profileMetrics).values({
      id: randomUUID(),
      profile_id: profileId,
      metric_type: "weight_kg",
      recorded_at: effectiveAt,
      unit: "kg",
      value: 70,
      source: "manual",
      method: "manual_entry",
      calculation_version: "profile-metric-v1",
    });
    await expect(
      db.select().from(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([]);

    await imports.complete(run.id);
    await imports.complete(run.id);
    const [completedState] = await db
      .select({ sourceRevision: profileAthleteState.source_revision })
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(completedState).toEqual({ sourceRevision: 1 });

    await db.insert(profileMetrics).values({
      id: randomUUID(),
      profile_id: profileId,
      metric_type: "max_hr",
      recorded_at: effectiveAt,
      unit: "bpm",
      value: 190,
    });
    await expect(
      db
        .select({ sourceRevision: profileAthleteState.source_revision })
        .from(profileAthleteState)
        .where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([{ sourceRevision: 1 }]);
  });

  it("does not install profile metric athlete-state triggers", async () => {
    const { rows } = await pool.query<{ tgname: string }>(
      `select tgname from pg_trigger
       where tgrelid = 'public.profile_metrics'::regclass
         and not tgisinternal
       order by tgname`,
    );
    expect(rows).not.toContainEqual({
      tgname: "profile_metrics_bump_athlete_state_source_revision",
    });
  });

  it("invalidates one revision for a summary-to-raw webhook correction with equal reduced evidence", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const activityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const effectiveAt = new Date("2026-08-01T10:00:00.000Z");
    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({ canonical_evidence_tier: "raw_samples", segments_revision: 2 })
        .where(eq(activities.id, activityId));
      await tx
        .update(activitySegments)
        .set({ segment_revision: 2 })
        .where(eq(activitySegments.activity_id, activityId));
      const materialized = await materializeActivityAthleteStateEvidence(tx, {
        profileId,
        activityId,
        computedAt: effectiveAt,
        contextDb: db,
        canonicalEvidenceMaterialChanged: true,
      });
      expect(materialized).toMatchObject({
        commonLoad: null,
        materialChanged: true,
      });
      await attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId,
        provider: "wahoo",
        providerExternalId: "webhook-direct-delta",
      });
    });
    const [afterCorrection] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(afterCorrection).toMatchObject({ source_revision: 1, published_revision: 0 });

    await db.transaction((tx) =>
      attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId,
        provider: "wahoo",
        providerExternalId: "webhook-direct-delta",
      }),
    );
    const [afterRetries] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(afterRetries?.source_revision).toBe(1);
    await expect(
      db.select().from(activityImportRuns).where(eq(activityImportRuns.profile_id, profileId)),
    ).resolves.toEqual([]);
  });

  it("reads either complete published estimate revision across a paused publication", async () => {
    const profileId = await seedProfile("UTC");
    const computedAt = new Date("2026-08-06T10:00:00.000Z");
    const publishAt = new Date("2026-08-06T11:00:00.000Z");
    await db.insert(profileAthleteState).values({
      profile_id: profileId,
      source_revision: 1,
      published_revision: 1,
      fitness: 20,
      fatigue: 15,
      evidence_confidence: 0.8,
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      computed_at: computedAt,
      updated_at: computedAt,
    });
    await db.insert(profilePerformanceEstimates).values({
      profile_id: profileId,
      capability_kind: "longest_distance",
      activity_category: "run",
      value: 1_000,
      unit: "meters",
      confidence: 0.8,
      effective_at: computedAt,
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      source_revision: 1,
      computed_at: computedAt,
    });
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, { profileId, effectiveAt: computedAt, now: publishAt }),
    );
    const claim = await claimNextAthleteState(db, {
      now: publishAt,
      leaseMilliseconds: 60_000,
      profileId,
    });
    if (!claim) throw new Error("Expected publication claim");

    const advisoryKey = 741_852;
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `pause_athlete_state_estimate_${suffix}`;
    const triggerName = `pause_athlete_state_estimate_${suffix}`;
    const lockClient = await pool.connect();
    let lockHeld = false;
    let publication: Promise<boolean> | undefined;
    try {
      await pool.query(`
        create function public."${functionName}"() returns trigger
        language plpgsql as $$
        begin
          if new.profile_id = '${profileId}'::uuid then
            perform pg_advisory_xact_lock(${advisoryKey});
          end if;
          return new;
        end
        $$
      `);
      await pool.query(`
        create trigger "${triggerName}"
        before insert on public.profile_performance_estimates
        for each row execute function public."${functionName}"()
      `);
      await lockClient.query("select pg_advisory_lock($1)", [advisoryKey]);
      lockHeld = true;
      publication = publishAthleteState(db, {
        claim,
        state: {
          fitness: 25,
          fatigue: 18,
          evidenceConfidence: 0.9,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        },
        estimates: [
          {
            profile_id: profileId,
            capability_kind: "longest_distance",
            activity_category: "run",
            value: 2_000,
            unit: "meters",
            confidence: 0.9,
            effective_at: publishAt,
            algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
            source_revision: claim.sourceRevision,
            computed_at: publishAt,
          },
        ],
        now: publishAt,
      });
      await waitForBlockedAdvisoryLock(advisoryKey);

      const oldSnapshot = await readPublishedAthleteStateSnapshot({
        db,
        profileId,
        now: publishAt,
      });
      expect(oldSnapshot).toMatchObject({
        revisions: { source: 2, published: 1 },
        baseline: {
          stateRevision: 1,
          capabilities: [expect.objectContaining({ longestDistanceMeters: 1_000 })],
        },
      });

      await lockClient.query("select pg_advisory_unlock($1)", [advisoryKey]);
      lockHeld = false;
      await expect(publication).resolves.toBe(true);
      const newSnapshot = await readPublishedAthleteStateSnapshot({
        db,
        profileId,
        now: publishAt,
      });
      expect(newSnapshot).toMatchObject({
        revisions: { source: 2, published: 2 },
        baseline: {
          stateRevision: 2,
          capabilities: [expect.objectContaining({ longestDistanceMeters: 2_000 })],
        },
      });
      await expect(
        withRepeatableReadSnapshot(
          db,
          (tx) =>
            readPublishedAthleteStateSnapshot({
              db: tx,
              profileId,
              now: publishAt,
              lockStateForUpdate: true,
            }),
          { accessMode: "read write" },
        ),
      ).resolves.toMatchObject({
        revisions: { source: 2, published: 2 },
        baseline: { stateRevision: 2 },
      });

      await db.insert(activityImportRuns).values({
        profile_id: profileId,
        kind: "history_sync",
        status: "failed",
        completed_at: publishAt,
        last_error_code: "provider_unavailable",
      });
      await expect(
        readPublishedAthleteStateSnapshot({ db, profileId, now: publishAt }),
      ).resolves.toMatchObject({
        freshness: "stale",
        rebuildStatus: "failed",
        importStatus: "failed",
        baseline: {
          stateRevision: 2,
          capabilities: [expect.objectContaining({ longestDistanceMeters: 2_000 })],
        },
      });
    } finally {
      if (lockHeld) await lockClient.query("select pg_advisory_unlock($1)", [advisoryKey]);
      await publication?.catch(() => undefined);
      await pool.query(
        `drop trigger if exists "${triggerName}" on public.profile_performance_estimates`,
      );
      await pool.query(`drop function if exists public."${functionName}"()`);
      lockClient.release();
    }
  });

  it("preserves an in-flight publication snapshot while queued bulk creation commits", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const now = new Date("2026-08-06T12:00:00.000Z");
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
        now,
      }),
    );
    const claim = await claimNextAthleteState(db, { now, leaseMilliseconds: 60_000, profileId });
    if (!claim) throw new Error("Expected athlete-state claim");
    let releaseCreation: (() => void) | undefined;
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    let markInserted: (() => void) | undefined;
    const inserted = new Promise<void>((resolve) => {
      markInserted = resolve;
    });
    const creation = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
      await tx.insert(activityImportRuns).values({
        profile_id: profileId,
        integration_id: integrationId,
        integration_generation: 1,
        kind: "history_sync",
        status: "queued",
      });
      markInserted?.();
      await creationGate;
    });
    await inserted;
    const publication = publishAthleteState(db, {
      claim,
      state: {
        fitness: 10,
        fatigue: 8,
        evidenceConfidence: 0.8,
        coverageStartAt: null,
        coverageEndAt: null,
        lastActivityAt: null,
        algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      },
      estimates: [],
      now,
    });
    releaseCreation?.();
    await creation;
    await expect(publication).resolves.toBe(true);
    const [state] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(state?.published_revision).toBe(1);
  });

  it("enriches a direct source with trusted identity metadata for later convergence", async () => {
    const profileId = await seedProfile();
    const activityId = await seedActivity({
      profileId,
      finishedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const garminId = await seedIntegration(profileId, "garmin");
    const stravaId = await seedIntegration(profileId, "strava");
    const artifactSha256 = "a".repeat(64);
    const trustedOrigin = {
      originProvider: "fit-origin",
      originExternalId: "direct-then-artifact",
      originTrust: "trusted_provider_origin" as const,
    };
    await db.transaction((tx) =>
      attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId: garminId,
        provider: "garmin",
        providerExternalId: "garmin-direct-first",
      }),
    );
    await db.transaction((tx) =>
      attachActivitySourceReference(tx, {
        profileId,
        activityId,
        integrationId: garminId,
        provider: "garmin",
        providerExternalId: "garmin-direct-first",
        artifactSha256,
        ...trustedOrigin,
      }),
    );

    await db.transaction(async (tx) => {
      await expect(
        resolveCanonicalActivityReference(tx, {
          profileId,
          integrationId: stravaId,
          provider: "strava",
          providerExternalId: "strava-by-artifact",
          artifactSha256,
        }),
      ).resolves.toBe(activityId);
      await expect(
        resolveCanonicalActivityReference(tx, {
          profileId,
          integrationId: stravaId,
          provider: "strava",
          providerExternalId: "strava-by-origin",
          ...trustedOrigin,
        }),
      ).resolves.toBe(activityId);
      await expect(
        attachActivitySourceReference(tx, {
          profileId,
          activityId,
          integrationId: stravaId,
          provider: "strava",
          providerExternalId: "strava-converged-direct",
          artifactSha256,
          ...trustedOrigin,
        }),
      ).resolves.toMatchObject({ activityId, inserted: true });
      await expect(
        attachActivitySourceReference(tx, {
          profileId,
          activityId,
          integrationId: stravaId,
          provider: "strava",
          providerExternalId: "strava-converged-direct",
          artifactSha256,
          ...trustedOrigin,
        }),
      ).resolves.toMatchObject({ activityId, inserted: false });
    });
    const [reference] = await db
      .select()
      .from(activitySourceReferences)
      .where(eq(activitySourceReferences.provider_external_id, "garmin-direct-first"));
    expect(reference).toMatchObject({
      artifact_sha256: artifactSha256,
      origin_provider: trustedOrigin.originProvider,
      origin_external_id: trustedOrigin.originExternalId,
    });
    const [convergedReference] = await db
      .select()
      .from(activitySourceReferences)
      .where(eq(activitySourceReferences.provider_external_id, "strava-converged-direct"));
    expect(convergedReference).toMatchObject({
      activity_id: activityId,
      artifact_sha256: null,
      origin_provider: null,
      origin_external_id: null,
    });
    await expect(
      db.select().from(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([]);
  });

  it("keeps identical provider external IDs independent across profiles", async () => {
    const profileA = await seedProfile();
    const profileB = await seedProfile();
    const integrationA = await seedIntegration(profileA, "wahoo");
    const integrationB = await seedIntegration(profileB, "wahoo");
    const activityA = await seedActivity({
      profileId: profileA,
      finishedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const activityB = await seedActivity({
      profileId: profileB,
      finishedAt: new Date("2026-08-01T11:00:00.000Z"),
    });
    const externalId = "shared-provider-external-id";
    await db.transaction(async (tx) => {
      await attachActivitySourceReference(tx, {
        profileId: profileA,
        activityId: activityA,
        integrationId: integrationA,
        provider: "wahoo",
        providerExternalId: externalId,
      });
      await attachActivitySourceReference(tx, {
        profileId: profileB,
        activityId: activityB,
        integrationId: integrationB,
        provider: "wahoo",
        providerExternalId: externalId,
      });
    });

    await db.transaction(async (tx) => {
      await expect(
        resolveCanonicalActivityReference(tx, {
          profileId: profileA,
          integrationId: integrationA,
          provider: "wahoo",
          providerExternalId: externalId,
        }),
      ).resolves.toBe(activityA);
      await expect(
        resolveCanonicalActivityReference(tx, {
          profileId: profileB,
          integrationId: integrationB,
          provider: "wahoo",
          providerExternalId: externalId,
        }),
      ).resolves.toBe(activityB);
    });
    const rows = await db
      .select({
        id: activitySourceReferences.activity_id,
        profileId: activitySourceReferences.profile_id,
      })
      .from(activitySourceReferences)
      .where(
        and(
          eq(activitySourceReferences.provider, "wahoo"),
          eq(activitySourceReferences.provider_external_id, externalId),
        ),
      );
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: activityA, profileId: profileA },
        { id: activityB, profileId: profileB },
      ]),
    );
  });

  it("rejects cross-profile integration ownership in import runs and source references", async () => {
    const ownerProfileId = await seedProfile();
    const otherProfileId = await seedProfile();
    const integrationId = await seedIntegration(ownerProfileId, "wahoo");
    const otherActivityId = await seedActivity({
      profileId: otherProfileId,
      finishedAt: new Date("2026-08-01T10:00:00.000Z"),
    });

    await expect(
      db.insert(activityImportRuns).values({
        profile_id: otherProfileId,
        integration_id: integrationId,
        integration_generation: 1,
        kind: "history_sync",
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "activity_import_runs_integration_profile_fkey" },
    });
    await expect(
      db.insert(activitySourceReferences).values({
        profile_id: otherProfileId,
        activity_id: otherActivityId,
        integration_id: integrationId,
        provider: "wahoo",
        provider_external_id: "cross-profile-source",
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "activity_source_references_integration_profile_fkey" },
    });
    await expect(
      db
        .insert(activityImportRuns)
        .values({ profile_id: otherProfileId, kind: "manual_sync" })
        .returning({ id: activityImportRuns.id }),
    ).resolves.toHaveLength(1);

    const otherIntegrationId = await seedIntegration(otherProfileId, "wahoo");
    const [ownerRun] = await db
      .insert(activityImportRuns)
      .values({
        profile_id: ownerProfileId,
        integration_id: integrationId,
        integration_generation: 1,
        kind: "history_sync",
      })
      .returning({ id: activityImportRuns.id });
    if (!ownerRun) throw new Error("Expected owner import run");
    await expect(
      db.insert(activitySourceReferences).values({
        profile_id: otherProfileId,
        activity_id: otherActivityId,
        integration_id: otherIntegrationId,
        provider: "wahoo",
        provider_external_id: "cross-profile-import-run",
        last_import_run_id: ownerRun.id,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "activity_source_refs_last_import_run_profile_fk" },
    });
    await expect(
      db.insert(activitySourceReferences).values({
        profile_id: otherProfileId,
        activity_id: otherActivityId,
        integration_id: otherIntegrationId,
        provider: "wahoo",
        provider_external_id: "cross-profile-material-import-run",
        last_material_import_run_id: ownerRun.id,
        last_material_effective_at: new Date("2026-08-01T10:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "activity_source_refs_material_import_run_profile_fk" },
    });
    await expect(
      db.insert(providerSyncJobs).values({
        profile_id: otherProfileId,
        integration_id: otherIntegrationId,
        provider: "wahoo",
        import_run_id: ownerRun.id,
        job_type: "wahoo.activity_history_reconcile",
        payload: { trigger: "scheduled", importRunId: ownerRun.id },
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "provider_sync_jobs_import_run_profile_fkey" },
    });

    const ownerActivityId = await seedActivity({
      profileId: ownerProfileId,
      finishedAt: new Date("2026-08-02T10:00:00.000Z"),
    });
    const [ownedReference] = await db
      .insert(activitySourceReferences)
      .values({
        profile_id: ownerProfileId,
        activity_id: ownerActivityId,
        integration_id: integrationId,
        provider: "wahoo",
        provider_external_id: "owned-import-run",
        last_import_run_id: ownerRun.id,
      })
      .returning({ id: activitySourceReferences.id });
    const [ownedJob] = await db
      .insert(providerSyncJobs)
      .values({
        profile_id: ownerProfileId,
        integration_id: integrationId,
        provider: "wahoo",
        import_run_id: ownerRun.id,
        job_type: "wahoo.activity_history_reconcile",
        payload: { trigger: "scheduled", importRunId: ownerRun.id },
      })
      .returning({ id: providerSyncJobs.id });
    if (!ownedReference || !ownedJob) throw new Error("Expected owned import-run references");
    await db.delete(activityImportRuns).where(eq(activityImportRuns.id, ownerRun.id));
    const [clearedReference] = await db
      .select()
      .from(activitySourceReferences)
      .where(eq(activitySourceReferences.id, ownedReference.id));
    const [clearedJob] = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.id, ownedJob.id));
    expect(clearedReference).toMatchObject({
      profile_id: ownerProfileId,
      last_import_run_id: null,
      last_material_import_run_id: null,
    });
    expect(clearedJob).toMatchObject({ profile_id: ownerProfileId, import_run_id: null });
  });

  it("blocks incomplete imports and fences publication by lease and source revision", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const imports = createActivityImportRepository(db);
    const firstNow = new Date("2026-01-03T00:00:00.000Z");
    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
        now: firstNow,
      }),
    );
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      nextPage: 1,
      now: firstNow,
    });
    await imports.start(run.id, firstNow);
    await markRunMaterial(run.id, new Date("2026-01-01T00:00:00.000Z"));
    await expect(
      claimNextAthleteState(db, { now: firstNow, leaseMilliseconds: 60_000, profileId }),
    ).resolves.toBeNull();
    await imports.fail(run.id, "provider_unavailable", firstNow);
    const failedImportClaim = await claimNextAthleteState(db, {
      now: firstNow,
      leaseMilliseconds: 60_000,
      profileId,
    });
    expect(failedImportClaim?.sourceRevision).toBe(2);
    if (!failedImportClaim) throw new Error("Expected failed-import available-data claim");
    await expect(
      publishAthleteState(db, {
        claim: failedImportClaim,
        state: {
          fitness: 5,
          fatigue: 4,
          evidenceConfidence: 0.5,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        },
        estimates: [],
        now: firstNow,
      }),
    ).resolves.toBe(true);
    await expect(readPublishedReadModel(profileId, firstNow)).resolves.toMatchObject({
      publishedRevision: 2,
      status: { freshness: "stale", rebuildStatus: "failed" },
      currentBaseline: { baseline: expect.objectContaining({ stateRevision: 2 }) },
    });
    await imports.resume(run.id, firstNow);
    await imports.recordPageCommitted({
      id: run.id,
      discovered: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
      earliestActivityAt: new Date("2026-01-01T00:00:00.000Z"),
      latestActivityAt: new Date("2026-01-01T00:00:00.000Z"),
      now: firstNow,
    });
    await markRunMaterial(run.id, new Date("2026-01-01T00:00:00.000Z"));
    await imports.complete(run.id, firstNow);
    await imports.complete(run.id, firstNow);

    const [afterImport] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(afterImport?.source_revision).toBe(3);
    const claim = await claimNextAthleteState(db, {
      now: firstNow,
      leaseMilliseconds: 60_000,
      profileId,
    });
    expect(claim?.sourceRevision).toBe(3);
    if (!claim) throw new Error("Expected athlete-state claim");
    await expect(
      publishAthleteState(db, {
        claim,
        state: {
          fitness: 10,
          fatigue: 8,
          evidenceConfidence: 0.75,
          coverageStartAt: null,
          coverageEndAt: null,
          lastActivityAt: null,
          algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
        },
        estimates: [],
        now: firstNow,
      }),
    ).resolves.toBe(true);

    const duplicateRun = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "manual_sync",
      now: firstNow,
    });
    await imports.start(duplicateRun.id, firstNow);
    await imports.recordPageCommitted({
      id: duplicateRun.id,
      discovered: 1,
      imported: 0,
      skipped: 1,
      failed: 0,
      earliestActivityAt: null,
      latestActivityAt: null,
      now: firstNow,
    });
    await imports.complete(duplicateRun.id, firstNow);

    const beforeMetric = await db
      .select({
        sourceRevision: profileAthleteState.source_revision,
      })
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    await db.insert(profileMetrics).values({
      id: randomUUID(),
      profile_id: profileId,
      metric_type: "max_hr",
      recorded_at: firstNow,
      unit: "bpm",
      value: 190,
    });
    const afterMetric = await db
      .select({
        sourceRevision: profileAthleteState.source_revision,
      })
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(afterMetric).toEqual(beforeMetric);
    expect(afterMetric[0]?.sourceRevision).toBe(3);

    await db.transaction((tx) =>
      markAthleteStateDirty(tx, {
        profileId,
        effectiveAt: new Date("2026-01-02T00:00:00.000Z"),
        now: firstNow,
      }),
    );
    const staleClaim = await claimNextAthleteState(db, {
      now: firstNow,
      leaseMilliseconds: 1,
      profileId,
    });
    if (!staleClaim) throw new Error("Expected stale athlete-state claim");
    const blocker = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "manual_sync",
      nextPage: 1,
      now: firstNow,
    });
    const attempted = {
      claim: staleClaim,
      state: {
        fitness: 20,
        fatigue: 10,
        evidenceConfidence: 0.8,
        coverageStartAt: null,
        coverageEndAt: null,
        lastActivityAt: null,
        algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      },
      estimates: [],
      now: firstNow,
    };
    await expect(publishAthleteState(db, attempted)).resolves.toBe(false);
    await imports.fail(blocker.id, "provider_unavailable", firstNow);
    await expect(publishAthleteState(db, attempted)).resolves.toBe(false);
    await imports.resume(blocker.id, firstNow);
    await imports.recordPageCommitted({
      id: blocker.id,
      discovered: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
      earliestActivityAt: new Date("2026-01-02T00:00:00.000Z"),
      latestActivityAt: new Date("2026-01-02T00:00:00.000Z"),
      now: firstNow,
    });
    await markRunMaterial(blocker.id, new Date("2026-01-02T00:00:00.000Z"));
    await imports.complete(blocker.id, firstNow);
    await expect(publishAthleteState(db, attempted)).resolves.toBe(false);
  });

  it("marks committed history dirty and rebuilds a stale baseline after an import failure", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const now = new Date("2026-01-03T00:00:00.000Z");
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      nextPage: 2,
      now,
    });
    await imports.start(run.id, now);
    await markRunMaterial(run.id, new Date("2026-01-01T00:00:00.000Z"));

    await imports.fail(run.id, "activity_history_import_failed", now);

    await expect(
      db
        .select({
          publishedRevision: profileAthleteState.published_revision,
          sourceRevision: profileAthleteState.source_revision,
        })
        .from(profileAthleteState)
        .where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([{ publishedRevision: 0, sourceRevision: 1 }]);

    await expect(new AthleteStateWorkerService({ db }).processDueJobs({ now })).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: 1,
    });
    await expect(readPublishedReadModel(profileId, now)).resolves.toMatchObject({
      publishedRevision: 1,
      status: { freshness: "stale", rebuildStatus: "failed" },
      currentBaseline: { baseline: expect.objectContaining({ stateRevision: 1 }) },
    });
  });

  it("does not create an athlete-state rebuild for a failed import without material history", async () => {
    const profileId = await seedProfile();
    const integrationId = await seedIntegration(profileId, "wahoo");
    const now = new Date("2026-01-03T00:00:00.000Z");
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "history_sync",
      nextPage: 1,
      now,
    });
    await imports.start(run.id, now);

    await imports.fail(run.id, "provider_unavailable", now);

    await expect(
      db.select().from(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId)),
    ).resolves.toEqual([]);
    await expect(new AthleteStateWorkerService({ db }).processDueJobs({ now })).resolves.toEqual({
      completed: 0,
      failed: 0,
      processed: 0,
    });
  });

  it("publishes one state refresh after a 501-activity onboarding import", async () => {
    const activityCount = 501;
    const profileId = await seedProfile("America/Los_Angeles");
    const integrationId = await seedIntegration(profileId, "wahoo");
    const firstFinishedAt = new Date("2026-01-01T08:01:00.000Z");
    await seedHistoricalBikePowerThreshold({
      profileId,
      observedAt: new Date("2025-12-31T08:00:00.000Z"),
    });
    const importedActivityIds: string[] = [];
    for (let index = 0; index < activityCount; index += 1) {
      importedActivityIds.push(
        await seedActivity({
          profileId,
          finishedAt: new Date(firstFinishedAt.getTime() + index * 60_000),
          canonicalLoad: true,
          durationMs: 30 * 60_000,
        }),
      );
    }
    const now = new Date("2026-01-03T00:00:00.000Z");
    const imports = createActivityImportRepository(db);
    const run = await imports.create({
      profileId,
      integrationId,
      integrationGeneration: 1,
      kind: "onboarding",
      nextPage: 1,
      now,
    });
    await imports.start(run.id, now);
    await imports.recordPageCommitted({
      id: run.id,
      discovered: activityCount,
      imported: activityCount,
      skipped: 0,
      failed: 0,
      earliestActivityAt: firstFinishedAt,
      latestActivityAt: new Date(firstFinishedAt.getTime() + (activityCount - 1) * 60_000),
      now,
    });
    await markRunMaterial(run.id, firstFinishedAt);
    await imports.complete(run.id, now);

    const [completedRun] = await db
      .select()
      .from(activityImportRuns)
      .where(eq(activityImportRuns.id, run.id));
    expect(completedRun).toMatchObject({
      status: "completed",
      discovered_count: activityCount,
      imported_count: activityCount,
    });

    await expect(
      reprocessProfileActivityAnalysis(db, {
        profileId,
        apply: false,
        from: firstFinishedAt,
        now,
      }),
    ).resolves.toMatchObject({
      scopedActivities: activityCount,
      availableSegments: activityCount,
      partialSegments: 0,
      unavailableSegments: 0,
    });

    // An import material change at the first completed activity must analyze
    // every imported activity, including the one whose started_at precedes its
    // finished_at boundary. The durable drain is one final publication after
    // exact bounded continuation accounting.
    const expectedContinuationClaims = Math.ceil(
      activityCount / ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE,
    );
    await expect(
      new AthleteStateWorkerService({ db }).processDueJobs({ limit: 1, now }),
    ).resolves.toEqual({
      completed: 1,
      failed: 0,
      processed: expectedContinuationClaims,
    });
    const [published] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    // The historical threshold source is not part of this onboarding import.
    const materializedLoads = await db
      .select({ commonLoad: activities.athlete_state_common_load })
      .from(activities)
      .where(
        and(eq(activities.profile_id, profileId), inArray(activities.id, importedActivityIds)),
      );
    expect(materializedLoads).toHaveLength(activityCount);
    expect(materializedLoads.every(({ commonLoad }) => commonLoad !== null)).toBe(true);
    const latestFinishedAt = new Date(firstFinishedAt.getTime() + (activityCount - 1) * 60_000);
    const initial = athleteStateBaselineSchema.parse({
      contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      athleteId: profileId,
      stateRevision: 1,
      asOf: latestFinishedAt.toISOString(),
      longTermLoad: 0,
      recentLoad: 0,
      loadBalance: 0,
      evidenceConfidence: 0,
      capabilities: [],
      athleteAgeYears: null,
    });
    const observed = advanceObservedAthleteState({
      baseline: initial,
      stimulus: {
        kind: "observed",
        sourceId: "athlete-state-day:2026-01-01",
        occurredAt: latestFinishedAt.toISOString(),
        activityCategory: "other",
        commonLoad: materializedLoads.reduce(
          (total, { commonLoad }) => total + (commonLoad ?? 0),
          0,
        ),
        evidenceConfidence: 1,
        capabilityObservation: null,
      },
    }).state;
    const expected = advanceAthleteStateTo(observed, now.toISOString(), {
      fromDay: "2026-01-01",
      toDay: "2026-01-02",
    }).state;
    expect(published?.published_revision).toBe(1);
    expect(published?.source_revision).toBe(1);
    expect(published?.fitness).toBeCloseTo(expected.longTermLoad, 8);
    expect(published?.fatigue).toBeCloseTo(expected.recentLoad, 8);
    expect(published?.coverage_start_at).toEqual(firstFinishedAt);
    expect(published?.last_activity_at).toEqual(latestFinishedAt);
    const capabilityEstimates = await db
      .select()
      .from(profilePerformanceEstimates)
      .where(eq(profilePerformanceEstimates.profile_id, profileId));
    expect(capabilityEstimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability_kind: "longest_distance",
          activity_category: "bike",
          value: 1_000,
          unit: "meters",
          source_revision: 1,
        }),
        expect.objectContaining({
          capability_kind: "longest_duration",
          activity_category: "bike",
          value: 30,
          unit: "minutes",
          source_revision: 1,
        }),
      ]),
    );
  }, 60_000);
});
