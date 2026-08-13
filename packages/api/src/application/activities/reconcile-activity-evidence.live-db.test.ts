import { randomUUID } from "node:crypto";
import { PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY } from "@repo/core/performance-calibration";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  performanceCalibrationEvidence,
  performanceCalibrationModelInputs,
  performanceCalibrationSelectionEvidence,
  performanceCalibrations,
  profileMetrics,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  adaptActivityEffortToCanonicalPerformanceEvidence,
  createAthletePerformanceModelRepository,
} from "../../repositories/athlete-performance-model-repository";
import {
  invalidateAllCalibrationEvidenceForActivity,
  readCalibrationAsOf,
} from "../../repositories/performance-calibration-repository";
import { getAthletePerformanceModelAsOf } from "../performance-model/get-athlete-performance-model-as-of";
import {
  type GeneratedActivityLthrEvidence,
  reconcileGeneratedActivityEvidence,
} from "./reconcile-activity-evidence";

const seededProfileIds: string[] = [];
const completedAt = new Date("2026-07-30T12:00:00.000Z");
const seededAt = new Date("2026-07-30T12:01:00.000Z");
const detectorProvenance = (
  activityId: string,
  segmentId = "segment-1",
): GeneratedActivityLthrEvidence["provenance"] => ({
  activity_id: activityId,
  segment_id: segmentId,
  derived_from: "activity_file_best_effort",
  source_series: "heart_rate",
  source_effort_calculation_version: "best-effort-extraction-v1",
  exact_window_start_timestamp_seconds: completedAt.getTime() / 1_000 - 1_200,
  exact_window_end_timestamp_seconds: completedAt.getTime() / 1_000,
  duration_seconds: 1_200,
  window_coverage: 1,
  extraction_status: "available",
  extraction_reason: null,
});

function databaseConstraint(error: unknown): string | null {
  if (error === null || typeof error !== "object") return null;
  if ("constraint" in error && typeof error.constraint === "string") return error.constraint;
  if ("cause" in error) return databaseConstraint(error.cause);
  return null;
}

async function expectDatabaseConstraint(promise: Promise<unknown>, constraint: string) {
  try {
    await promise;
  } catch (error) {
    expect(databaseConstraint(error)).toBe(constraint);
    return;
  }
  throw new Error(`Expected database constraint ${constraint}`);
}

function acceptedArtifact(profileId: string) {
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  const id = randomUUID();
  return {
    id,
    profile_id: profileId,
    digest_algorithm: "sha256" as const,
    digest,
    byte_size: 1_024,
    bucket: "activity-files",
    path: `artifacts/sha256/${profileId}/${digest}`,
    media_type: "application/vnd.ant.fit",
    format: "fit",
    availability: "accepted" as const,
    first_accepted_at: seededAt,
  };
}

async function seedProfile() {
  const id = randomUUID();
  const email = `${id}@reconcile-activity-evidence.test`;
  seededProfileIds.push(id);
  await db.insert(users).values({
    id,
    name: "Reconcile activity evidence live DB test",
    email,
    emailVerified: true,
  });
  await db.insert(profiles).values({ id, email, created_at: seededAt, updated_at: seededAt });
  return id;
}

async function seedActivity(profileId: string) {
  const id = randomUUID();
  const segmentId = randomUUID();
  const artifact = acceptedArtifact(profileId);
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id,
      profile_id: profileId,
      name: "Reconcile activity evidence fixture",
      started_at: new Date(completedAt.getTime() - 3_600_000),
      finished_at: completedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      parser_version: "test-parser-v1",
      decoded_contract_version: "test-decoded-v1",
      materializer_version: "test-materializer-v1",
      segments_generated_at: seededAt,
    });
    await tx.insert(activityArtifacts).values(artifact);
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: id,
      artifact_id: artifact.id,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      provider_revision: "fixture-a",
      linked_at: seededAt,
    });
    await tx.insert(activitySegments).values({
      id: segmentId,
      activity_id: id,
      profile_id: profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "bike",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      source_artifact_id: artifact.id,
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      parser_version: "test-parser-v1",
      materializer_version: "test-materializer-v1",
      segment_revision: 1,
    });
  });
  return { id, segmentId, artifactId: artifact.id };
}

async function seedRepeatedBikeSegmentActivity(profileId: string) {
  const id = randomUUID();
  const segmentIds = [randomUUID(), randomUUID()];
  const artifact = acceptedArtifact(profileId);
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id,
      profile_id: profileId,
      name: "Repeated bike segment reconciliation fixture",
      started_at: new Date(completedAt.getTime() - 3_600_000),
      finished_at: completedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      parser_version: "test-parser-v1",
      decoded_contract_version: "test-decoded-v1",
      materializer_version: "test-materializer-v1",
      segments_generated_at: seededAt,
    });
    await tx.insert(activityArtifacts).values(artifact);
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: id,
      artifact_id: artifact.id,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      provider_revision: "fixture-a",
      linked_at: seededAt,
    });
    await tx.insert(activitySegments).values(
      segmentIds.map((segmentId, ordinal) => ({
        id: segmentId,
        activity_id: id,
        profile_id: profileId,
        ordinal,
        role: "activity" as const,
        activity_category: "bike" as const,
        start_offset_ms: ordinal * 1_800_000,
        end_offset_ms: (ordinal + 1) * 1_800_000,
        source_artifact_id: artifact.id,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete" as const, activeMs: 1_800_000, movingMs: 1_800_000 },
        },
        summary_version: 1,
        timing_coverage: "complete" as const,
        active_ms: 1_800_000,
        moving_ms: 1_800_000,
        parser_version: "test-parser-v1",
        materializer_version: "test-materializer-v1",
        segment_revision: 1,
      })),
    );
  });
  return { id, segmentIds, artifactId: artifact.id };
}

async function seedMultiSourceRunActivity(profileId: string) {
  const id = randomUUID();
  const segmentIds = [randomUUID(), randomUUID()];
  const artifacts = [acceptedArtifact(profileId), acceptedArtifact(profileId)];
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id,
      profile_id: profileId,
      name: "Multi-source run calibration fixture",
      started_at: new Date(completedAt.getTime() - 3_600_000),
      finished_at: completedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      parser_version: "test-parser-v1",
      decoded_contract_version: "test-decoded-v1",
      materializer_version: "test-materializer-v1",
      segments_generated_at: seededAt,
    });
    await tx.insert(activityArtifacts).values(artifacts);
    await tx.insert(activityArtifactLinks).values(
      artifacts.map((artifact, ordinal) => ({
        id: randomUUID(),
        activity_id: id,
        artifact_id: artifact.id,
        profile_id: profileId,
        role: "source" as const,
        ordinal,
        is_current: true,
        provider_revision: `fixture-${ordinal}`,
        linked_at: seededAt,
      })),
    );
    await tx.insert(activitySegments).values(
      segmentIds.map((segmentId, ordinal) => ({
        id: segmentId,
        activity_id: id,
        profile_id: profileId,
        ordinal,
        role: "activity" as const,
        activity_category: "run" as const,
        start_offset_ms: ordinal * 1_800_000,
        end_offset_ms: (ordinal + 1) * 1_800_000,
        source_artifact_id: artifacts[ordinal]?.id,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete" as const, activeMs: 1_800_000, movingMs: 1_800_000 },
        },
        summary_version: 1,
        timing_coverage: "complete" as const,
        active_ms: 1_800_000,
        moving_ms: 1_800_000,
        parser_version: "test-parser-v1",
        materializer_version: "test-materializer-v1",
        segment_revision: 1,
      })),
    );
  });
  return { id, segmentIds, artifactIds: artifacts.map(({ id: artifactId }) => artifactId) };
}

async function seedSingleSourceRunActivity(profileId: string, finishedAt: Date, speed: number) {
  const id = randomUUID();
  const segmentId = randomUUID();
  const artifact = acceptedArtifact(profileId);
  const startedAt = new Date(finishedAt.getTime() - 3_600_000);
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id,
      profile_id: profileId,
      name: "Run calibration lifecycle fixture",
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      parser_version: "test-parser-v1",
      decoded_contract_version: "test-decoded-v1",
      materializer_version: "test-materializer-v1",
      segments_generated_at: seededAt,
    });
    await tx.insert(activityArtifacts).values(artifact);
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: id,
      artifact_id: artifact.id,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      provider_revision: `fixture-${finishedAt.toISOString()}`,
      linked_at: seededAt,
    });
    await tx.insert(activitySegments).values({
      id: segmentId,
      activity_id: id,
      profile_id: profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "run",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      source_artifact_id: artifact.id,
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      parser_version: "test-parser-v1",
      materializer_version: "test-materializer-v1",
      segment_revision: 1,
    });
  });
  return {
    id,
    finishedAt,
    efforts: [1_200, 1_800].map((durationSeconds) => {
      const effortId = randomUUID();
      return {
        id: effortId,
        created_at: seededAt,
        profile_id: profileId,
        activity_id: id,
        segment_id: segmentId,
        recorded_at: finishedAt,
        activity_category: "run" as const,
        effort_type: "speed" as const,
        duration_seconds: durationSeconds,
        start_offset: 3_600 - durationSeconds,
        unit: "meters_per_second",
        value: durationSeconds === 1_800 ? speed : speed / 0.95,
        source: "imported" as const,
        method: "activity_file_best_effort",
        calculation_version: "best-effort-extraction-v1",
        provenance: {
          observation_id: effortId,
          activity_id: id,
          segment_id: segmentId,
          derived_from: "activity_file_stream",
          source_series: "grade_adjusted_speed",
          exact_window_start_offset_seconds: 3_600 - durationSeconds,
          exact_window_end_offset_seconds: 3_600,
          duration_seconds: durationSeconds,
          contributing_duration_seconds: durationSeconds,
          window_coverage: 1,
          output_window_coverage: 1,
          source_time_coverage: 1,
          maximum_gap_seconds: 1,
          output_coefficient_of_variation: 0.05,
          extraction_status: "available",
          extraction_reason: null,
          calculation_version: "best-effort-extraction-v1",
        },
      } satisfies typeof activityEfforts.$inferInsert;
    }),
  };
}

function generatedCyclingEfforts(input: {
  activityId: string;
  profileId: string;
  segmentId: string;
  valueScale?: number;
}): Array<typeof activityEfforts.$inferInsert> {
  const activityStartedAtSeconds = completedAt.getTime() / 1_000 - 3_600;
  const valueScale = input.valueScale ?? 1;
  const shortDurationPower = new Map([
    [5, 1_200],
    [30, 600],
    [60, 500],
  ]);
  return [5, 30, 60, 180, 300, 600, 900, 1_200, 1_800, 3_600].map((durationSeconds) => {
    const id = randomUUID();
    const endOffsetSeconds = 3_600;
    const startOffsetSeconds = endOffsetSeconds - durationSeconds;
    return {
      id,
      created_at: seededAt,
      profile_id: input.profileId,
      activity_id: input.activityId,
      segment_id: input.segmentId,
      recorded_at: completedAt,
      activity_category: "bike",
      effort_type: "power",
      duration_seconds: durationSeconds,
      start_offset: startOffsetSeconds,
      unit: "watts",
      value:
        (shortDurationPower.get(durationSeconds) ?? 240 + 24_000 / durationSeconds) * valueScale,
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: "best-effort-extraction-v1",
      provenance: {
        observation_id: id,
        activity_id: input.activityId,
        segment_id: input.segmentId,
        derived_from: "activity_file_stream",
        source_series: "power",
        interval_convention: "current_sample_applies_to_preceding_interval",
        exact_window_start_timestamp_seconds: activityStartedAtSeconds + startOffsetSeconds,
        exact_window_end_timestamp_seconds: activityStartedAtSeconds + endOffsetSeconds,
        exact_window_start_offset_seconds: startOffsetSeconds,
        exact_window_end_offset_seconds: endOffsetSeconds,
        duration_seconds: durationSeconds,
        contributing_duration_seconds: durationSeconds,
        window_coverage: 1,
        source_time_coverage: 1,
        extraction_status: "available",
        extraction_reason: null,
        persisted_start_offset_quantization: "floor_seconds_v1",
        calculation_version: "best-effort-extraction-v1",
      },
    };
  });
}

function repeatedSegmentCyclingEfforts(input: {
  activityId: string;
  profileId: string;
  segments: ReadonlyArray<{ id: string; endOffsetSeconds: number }>;
  valueScale?: number;
}): Array<typeof activityEfforts.$inferInsert> {
  const activityStartedAtSeconds = completedAt.getTime() / 1_000 - 3_600;
  const valueScale = input.valueScale ?? 1;
  return input.segments.flatMap((segment) =>
    [300, 600].map((durationSeconds) => {
      const id = randomUUID();
      const startOffsetSeconds = segment.endOffsetSeconds - durationSeconds;
      return {
        id,
        created_at: seededAt,
        profile_id: input.profileId,
        activity_id: input.activityId,
        segment_id: segment.id,
        recorded_at: new Date((activityStartedAtSeconds + segment.endOffsetSeconds) * 1_000),
        activity_category: "bike" as const,
        effort_type: "power" as const,
        duration_seconds: durationSeconds,
        start_offset: startOffsetSeconds,
        unit: "watts",
        value: (durationSeconds === 300 ? 300 : 275) * valueScale,
        source: "imported" as const,
        method: "activity_file_best_effort",
        calculation_version: "best-effort-extraction-v1",
        provenance: {
          observation_id: id,
          activity_id: input.activityId,
          segment_id: segment.id,
          derived_from: "activity_file_stream",
          source_series: "power",
          interval_convention: "current_sample_applies_to_preceding_interval",
          exact_window_start_timestamp_seconds: activityStartedAtSeconds + startOffsetSeconds,
          exact_window_end_timestamp_seconds: activityStartedAtSeconds + segment.endOffsetSeconds,
          exact_window_start_offset_seconds: startOffsetSeconds,
          exact_window_end_offset_seconds: segment.endOffsetSeconds,
          duration_seconds: durationSeconds,
          contributing_duration_seconds: durationSeconds,
          window_coverage: 1,
          source_time_coverage: 1,
          extraction_status: "available",
          extraction_reason: null,
          persisted_start_offset_quantization: "floor_seconds_v1",
          calculation_version: "best-effort-extraction-v1",
        },
      };
    }),
  );
}

function multiSourceRunEfforts(input: {
  activityId: string;
  profileId: string;
  segmentIds: string[];
}): Array<typeof activityEfforts.$inferInsert> {
  const activityStartedAtSeconds = completedAt.getTime() / 1_000 - 3_600;
  return input.segmentIds.flatMap((segmentId, ordinal) => {
    const segmentEndSeconds = (ordinal + 1) * 1_800;
    return [1_200, 1_800].map((durationSeconds) => {
      const id = randomUUID();
      const startOffsetSeconds = segmentEndSeconds - durationSeconds;
      return {
        id,
        created_at: seededAt,
        profile_id: input.profileId,
        activity_id: input.activityId,
        segment_id: segmentId,
        recorded_at: new Date((activityStartedAtSeconds + segmentEndSeconds) * 1_000),
        activity_category: "run" as const,
        effort_type: "speed" as const,
        duration_seconds: durationSeconds,
        start_offset: startOffsetSeconds,
        unit: "meters_per_second",
        value: durationSeconds === 1_200 ? 4.2 : 4,
        source: "imported" as const,
        method: "activity_file_best_effort",
        calculation_version: "best-effort-extraction-v1",
        provenance: {
          observation_id: id,
          activity_id: input.activityId,
          segment_id: segmentId,
          derived_from: "activity_file_stream",
          source_series: "grade_adjusted_speed",
          exact_window_start_offset_seconds: startOffsetSeconds,
          exact_window_end_offset_seconds: segmentEndSeconds,
          duration_seconds: durationSeconds,
          contributing_duration_seconds: durationSeconds,
          window_coverage: 1,
          output_window_coverage: 1,
          source_time_coverage: 1,
          maximum_gap_seconds: 1,
          output_coefficient_of_variation: 0.05,
          extraction_status: "available",
          extraction_reason: null,
          calculation_version: "best-effort-extraction-v1",
        },
      };
    });
  });
}

afterEach(async () => {
  const profileIds = seededProfileIds.splice(0);
  for (const profileId of profileIds) {
    await db.transaction(async (tx) => {
      await tx.delete(profileMetrics).where(eq(profileMetrics.profile_id, profileId));
      await tx.delete(activities).where(eq(activities.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx
        .update(activityArtifacts)
        .set({ availability: "deleted", deleted_at: new Date() })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
      );
      await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, profileId));
      await tx.delete(users).where(eq(users.id, profileId));
    });
    await expect(db.select().from(profiles).where(eq(profiles.id, profileId))).resolves.toEqual([]);
    await expect(
      db.select().from(activities).where(eq(activities.profile_id, profileId)),
    ).resolves.toEqual([]);
    await expect(
      db.select().from(profileMetrics).where(eq(profileMetrics.profile_id, profileId)),
    ).resolves.toEqual([]);
  }
});

afterAll(async () => pool.end());

describe("reconcileGeneratedActivityEvidence against PostgreSQL", () => {
  it("reconciles exact segment source identities across two accepted activity artifacts", async () => {
    const profileId = await seedProfile();
    const activity = await seedMultiSourceRunActivity(profileId);
    const efforts = multiSourceRunEfforts({
      activityId: activity.id,
      profileId,
      segmentIds: activity.segmentIds,
    });
    const reconcile = () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role service_role`);
        return reconcileGeneratedActivityEvidence(tx, {
          activityId: activity.id,
          profileId,
          efforts,
          detectedLTHR: null,
          now: seededAt,
        });
      });

    await reconcile();
    await reconcile();

    const evidence = await db
      .select()
      .from(performanceCalibrationEvidence)
      .where(
        and(
          eq(performanceCalibrationEvidence.profile_id, profileId),
          eq(performanceCalibrationEvidence.activity_id, activity.id),
          eq(performanceCalibrationEvidence.metric_key, "threshold_speed"),
        ),
      );
    expect(evidence).toHaveLength(2);
    expect(evidence.every((row) => row.state === "candidate")).toBe(true);
    expect(new Set(evidence.map((row) => row.segment_id))).toEqual(new Set(activity.segmentIds));
    expect(new Set(evidence.map((row) => row.source_artifact_id))).toEqual(
      new Set(activity.artifactIds),
    );
    await expect(
      db
        .select()
        .from(performanceCalibrations)
        .where(
          and(
            eq(performanceCalibrations.profile_id, profileId),
            eq(performanceCalibrations.metric_key, "threshold_speed"),
            eq(performanceCalibrations.activity_category, "run"),
          ),
        ),
    ).resolves.toHaveLength(1);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role service_role`);
        await tx.execute(sql`truncate table performance_calibration_evidence`);
      }),
    ).rejects.toThrow();

    const staleArtifactId = activity.artifactIds[1];
    const staleEvidence = evidence.find((row) => row.source_artifact_id === staleArtifactId);
    if (!staleArtifactId || !staleEvidence) {
      throw new Error("Expected second exact source evidence fixture");
    }
    await db
      .update(activityArtifactLinks)
      .set({ is_current: false })
      .where(eq(activityArtifactLinks.artifact_id, staleArtifactId));
    await reconcile();
    await expect(
      db
        .select({ state: performanceCalibrationEvidence.state })
        .from(performanceCalibrationEvidence)
        .where(eq(performanceCalibrationEvidence.id, staleEvidence.id)),
    ).resolves.toEqual([{ state: "invalidated" }]);
    await expectDatabaseConstraint(
      db.insert(performanceCalibrationEvidence).values({
        ...staleEvidence,
        id: randomUUID(),
        state: "candidate",
        invalidated_at: null,
        invalidation_reason: null,
        policy_version: "non-current-source-regression-v1",
      }),
      "performance_calibration_evidence_source_integrity",
    );
  });

  it("enforces the shared confirmation and supported-update lifecycle at the database boundary", async () => {
    const policyResult = await db.execute(
      sql`select public.performance_calibration_lifecycle_policy() as policy`,
    );
    expect(policyResult.rows[0]?.policy).toEqual(PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY);

    const profileId = await seedProfile();
    const fixtures = await Promise.all([
      seedSingleSourceRunActivity(profileId, new Date("2026-06-01T12:00:00.000Z"), 4),
      seedSingleSourceRunActivity(profileId, new Date("2026-06-09T12:00:00.000Z"), 4),
      seedSingleSourceRunActivity(profileId, new Date("2026-06-17T12:00:00.000Z"), 4.2),
      seedSingleSourceRunActivity(profileId, new Date("2026-06-25T12:00:00.000Z"), 4.2),
    ]);
    for (const fixture of fixtures) {
      await db.transaction((tx) =>
        reconcileGeneratedActivityEvidence(tx, {
          activityId: fixture.id,
          profileId,
          efforts: fixture.efforts,
          detectedLTHR: null,
          now: seededAt,
        }),
      );
    }

    const calibrations = await db
      .select()
      .from(performanceCalibrations)
      .where(
        and(
          eq(performanceCalibrations.profile_id, profileId),
          eq(performanceCalibrations.metric_key, "threshold_speed"),
          eq(performanceCalibrations.activity_category, "run"),
        ),
      )
      .orderBy(performanceCalibrations.effective_at);
    expect(
      calibrations.map(
        ({ selection_diagnostics }) =>
          (selection_diagnostics as { selectionReason: string }).selectionReason,
      ),
    ).toEqual(["first_qualifying_evidence", "independent_confirmation", "supported_increase"]);
    expect(calibrations.at(-1)).toMatchObject({ value: 4.2 });

    const forgedFixture = await seedSingleSourceRunActivity(
      profileId,
      new Date("2026-07-03T12:00:00.000Z"),
      4.4,
    );
    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: forgedFixture.id,
        profileId,
        efforts: forgedFixture.efforts,
        detectedLTHR: null,
        now: seededAt,
      }),
    );
    const [forgedEvidence] = await db
      .select()
      .from(performanceCalibrationEvidence)
      .where(
        and(
          eq(performanceCalibrationEvidence.profile_id, profileId),
          eq(performanceCalibrationEvidence.activity_id, forgedFixture.id),
          eq(performanceCalibrationEvidence.metric_key, "threshold_speed"),
        ),
      );
    const latestCalibration = calibrations.at(-1);
    if (!forgedEvidence || forgedEvidence.value === null || !latestCalibration) {
      throw new Error("Expected lifecycle rejection fixtures");
    }
    const forgedValue = forgedEvidence.value;
    const expectForgedSelectionRejected = (
      selectionReason: "independent_confirmation" | "supported_increase",
      trend: "stable" | "increasing",
    ) =>
      expectDatabaseConstraint(
        db.transaction(async (tx) => {
          const forgedCalibrationId = randomUUID();
          await tx.insert(performanceCalibrations).values({
            id: forgedCalibrationId,
            profile_id: profileId,
            metric_key: "threshold_speed",
            activity_category: "run",
            value: forgedValue,
            unit: "meters_per_second",
            effective_at: forgedEvidence.observed_at,
            expires_at: new Date(
              forgedEvidence.observed_at.getTime() +
                PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.expiryDays * 86_400_000,
            ),
            policy_version: forgedEvidence.policy_version,
            selection_diagnostics: {
              selectedEvidenceIds: [forgedEvidence.id],
              selectedActivityIds: [forgedEvidence.activity_id],
              evidenceCount: 1,
              selectionReason,
              trend,
              tolerance: PERFORMANCE_CALIBRATION_LIFECYCLE_POLICY.relativeTolerance,
              policyVersion: forgedEvidence.policy_version,
            },
            supersedes_id: latestCalibration.id,
          });
          await tx.insert(performanceCalibrationSelectionEvidence).values({
            calibration_id: forgedCalibrationId,
            evidence_id: forgedEvidence.id,
            profile_id: profileId,
            metric_key: "threshold_speed",
            activity_category: "run",
            ordinal: 0,
          });
        }),
        "performance_calibrations_lifecycle_semantics",
      );
    await expectForgedSelectionRejected("independent_confirmation", "stable");
    await expectForgedSelectionRejected("supported_increase", "increasing");
  });

  it("defers a late qualifying activity and includes it in the next current evaluation", async () => {
    const profileId = await seedProfile();
    const current = await seedSingleSourceRunActivity(
      profileId,
      new Date("2026-06-10T12:00:00.000Z"),
      4,
    );
    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: current.id,
        profileId,
        efforts: current.efforts,
        detectedLTHR: null,
        now: seededAt,
      }),
    );

    const late = await seedSingleSourceRunActivity(
      profileId,
      new Date("2026-06-01T12:00:00.000Z"),
      4.01,
    );
    const lateResult = await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: late.id,
        profileId,
        efforts: late.efforts,
        detectedLTHR: null,
        now: seededAt,
      }),
    );

    expect(lateResult.calibrationReconciliation).toMatchObject({
      changed: false,
      deferredIdentities: [{ metricKey: "threshold_speed", activityCategory: "run" }],
    });
    const afterLate = await db
      .select()
      .from(performanceCalibrations)
      .where(
        and(
          eq(performanceCalibrations.profile_id, profileId),
          eq(performanceCalibrations.metric_key, "threshold_speed"),
          eq(performanceCalibrations.activity_category, "run"),
        ),
      )
      .orderBy(performanceCalibrations.effective_at);
    expect(afterLate).toHaveLength(1);
    expect(afterLate[0]?.effective_at).toEqual(current.finishedAt);
    const [lateEvidence] = await db
      .select()
      .from(performanceCalibrationEvidence)
      .where(
        and(
          eq(performanceCalibrationEvidence.profile_id, profileId),
          eq(performanceCalibrationEvidence.activity_id, late.id),
          eq(performanceCalibrationEvidence.metric_key, "threshold_speed"),
        ),
      );
    expect(lateEvidence).toMatchObject({ state: "candidate", invalidated_at: null });

    const nextCurrent = await seedSingleSourceRunActivity(
      profileId,
      new Date("2026-06-11T12:00:00.000Z"),
      4.5,
    );
    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: nextCurrent.id,
        profileId,
        efforts: nextCurrent.efforts,
        detectedLTHR: null,
        now: seededAt,
      }),
    );

    const afterCurrent = await db
      .select()
      .from(performanceCalibrations)
      .where(
        and(
          eq(performanceCalibrations.profile_id, profileId),
          eq(performanceCalibrations.metric_key, "threshold_speed"),
          eq(performanceCalibrations.activity_category, "run"),
        ),
      )
      .orderBy(performanceCalibrations.created_at);
    expect(afterCurrent).toHaveLength(2);
    expect(afterCurrent[1]).toMatchObject({
      effective_at: current.finishedAt,
      supersedes_id: afterCurrent[0]?.id,
      selection_diagnostics: {
        selectionReason: "independent_confirmation",
        selectedEvidenceIds: expect.arrayContaining([lateEvidence?.id]),
      },
    });
  });

  it("creates an idempotent provisional bike threshold from a profile fit spanning accepted rides", async () => {
    const profileId = await seedProfile();
    const firstRide = await seedActivity(profileId);
    const secondRide = await seedActivity(profileId);
    const firstEfforts = generatedCyclingEfforts({
      activityId: firstRide.id,
      profileId,
      segmentId: firstRide.segmentId,
    });
    const secondEfforts = generatedCyclingEfforts({
      activityId: secondRide.id,
      profileId,
      segmentId: secondRide.segmentId,
    }).map((effort) => ({
      ...effort,
      value: effort.value * (effort.duration_seconds === 1_800 ? 1.01 : 0.99),
    }));

    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: firstRide.id,
        profileId,
        efforts: firstEfforts,
        detectedLTHR: null,
        now: seededAt,
      }),
    );

    const [insufficientHistory] = await db
      .select()
      .from(performanceCalibrationEvidence)
      .where(
        and(
          eq(performanceCalibrationEvidence.profile_id, profileId),
          eq(performanceCalibrationEvidence.activity_id, firstRide.id),
          eq(performanceCalibrationEvidence.metric_key, "threshold_power"),
        ),
      );
    expect(insufficientHistory).toMatchObject({
      state: "rejected",
      rejection_reason: "model_history_insufficient",
    });
    expect(insufficientHistory?.diagnostics).toMatchObject({
      model: {
        reasons: expect.arrayContaining(["critical_power_insufficient_independent_activities"]),
        activityCount: 1,
      },
    });
    await expect(
      db
        .select()
        .from(performanceCalibrations)
        .where(eq(performanceCalibrations.profile_id, profileId)),
    ).resolves.toEqual([]);

    const reconcileSecond = () =>
      db.transaction((tx) =>
        reconcileGeneratedActivityEvidence(tx, {
          activityId: secondRide.id,
          profileId,
          efforts: secondEfforts,
          detectedLTHR: null,
          now: new Date("2026-07-30T12:02:00.000Z"),
        }),
      );
    await reconcileSecond();

    const [candidate] = await db
      .select()
      .from(performanceCalibrationEvidence)
      .where(
        and(
          eq(performanceCalibrationEvidence.profile_id, profileId),
          eq(performanceCalibrationEvidence.activity_id, secondRide.id),
          eq(performanceCalibrationEvidence.metric_key, "threshold_power"),
        ),
      );
    expect(candidate).toMatchObject({ state: "candidate", rejection_reason: null });
    const calibrations = await db
      .select()
      .from(performanceCalibrations)
      .where(
        and(
          eq(performanceCalibrations.profile_id, profileId),
          eq(performanceCalibrations.metric_key, "threshold_power"),
          eq(performanceCalibrations.activity_category, "bike"),
        ),
      );
    expect(calibrations).toHaveLength(1);
    expect(calibrations[0]?.selection_diagnostics).toMatchObject({
      selectionReason: "first_qualifying_evidence",
      evidenceCount: 1,
    });
    if (!candidate) throw new Error("Expected accepted bike threshold model evidence");
    const modelInputs = await db
      .select()
      .from(performanceCalibrationModelInputs)
      .where(eq(performanceCalibrationModelInputs.calibration_evidence_id, candidate.id))
      .orderBy(performanceCalibrationModelInputs.ordinal);
    expect(modelInputs).toHaveLength(6);
    expect(new Set(modelInputs.map((input) => input.activity_id))).toEqual(
      new Set([firstRide.id, secondRide.id]),
    );
    expect(
      modelInputs.every(
        (input) =>
          input.profile_id === profileId &&
          input.segment_revision === 1 &&
          (input.source_artifact_id === firstRide.artifactId ||
            input.source_artifact_id === secondRide.artifactId) &&
          /^[0-9a-f]{64}$/.test(input.source_artifact_digest),
      ),
    ).toBe(true);

    const calibration = calibrations[0];
    if (!calibration) throw new Error("Expected provisional bike calibration fixture");
    const selectionLinks = await db
      .select()
      .from(performanceCalibrationSelectionEvidence)
      .where(eq(performanceCalibrationSelectionEvidence.calibration_id, calibration.id));
    expect(selectionLinks).toHaveLength(1);
    const selectionLink = selectionLinks[0];
    const modelInput = modelInputs[0];
    if (!calibration || !selectionLink || !modelInput) {
      throw new Error("Expected complete calibration provenance fixtures");
    }

    await expectDatabaseConstraint(
      db
        .update(performanceCalibrationEvidence)
        .set({ value: (candidate.value ?? 0) + 1 })
        .where(eq(performanceCalibrationEvidence.id, candidate.id)),
      "performance_calibration_evidence_invalidation_only",
    );
    await expectDatabaseConstraint(
      db
        .delete(performanceCalibrationEvidence)
        .where(eq(performanceCalibrationEvidence.id, candidate.id)),
      "performance_calibration_evidence_retained",
    );
    await expectDatabaseConstraint(
      db
        .update(performanceCalibrations)
        .set({ value: calibration.value + 1 })
        .where(eq(performanceCalibrations.id, calibration.id)),
      "performance_calibration_provenance_append_only",
    );
    await expectDatabaseConstraint(
      db.delete(performanceCalibrations).where(eq(performanceCalibrations.id, calibration.id)),
      "performance_calibration_provenance_retained",
    );
    await expectDatabaseConstraint(
      db
        .update(performanceCalibrationSelectionEvidence)
        .set({ ordinal: selectionLink.ordinal + 1 })
        .where(
          and(
            eq(
              performanceCalibrationSelectionEvidence.calibration_id,
              selectionLink.calibration_id,
            ),
            eq(performanceCalibrationSelectionEvidence.evidence_id, selectionLink.evidence_id),
          ),
        ),
      "performance_calibration_provenance_append_only",
    );
    await expectDatabaseConstraint(
      db
        .delete(performanceCalibrationSelectionEvidence)
        .where(
          and(
            eq(
              performanceCalibrationSelectionEvidence.calibration_id,
              selectionLink.calibration_id,
            ),
            eq(performanceCalibrationSelectionEvidence.evidence_id, selectionLink.evidence_id),
          ),
        ),
      "performance_calibration_provenance_retained",
    );
    await expectDatabaseConstraint(
      db
        .update(performanceCalibrationModelInputs)
        .set({ value: modelInput.value + 1 })
        .where(
          and(
            eq(
              performanceCalibrationModelInputs.calibration_evidence_id,
              modelInput.calibration_evidence_id,
            ),
            eq(performanceCalibrationModelInputs.effort_id, modelInput.effort_id),
          ),
        ),
      "performance_calibration_provenance_append_only",
    );
    await expectDatabaseConstraint(
      db
        .delete(performanceCalibrationModelInputs)
        .where(
          and(
            eq(
              performanceCalibrationModelInputs.calibration_evidence_id,
              modelInput.calibration_evidence_id,
            ),
            eq(performanceCalibrationModelInputs.effort_id, modelInput.effort_id),
          ),
        ),
      "performance_calibration_provenance_retained",
    );
    await expectDatabaseConstraint(
      db.insert(performanceCalibrationModelInputs).values({
        ...modelInput,
        effort_id: randomUUID(),
        ordinal: 100,
      }),
      "performance_calibration_model_inputs_source_integrity",
    );
    const extraEffort = firstEfforts.find(
      (effort) =>
        typeof effort.id === "string" &&
        !modelInputs.some((input) => input.effort_id === effort.id),
    );
    const extraEffortSource = modelInputs.find((input) => input.activity_id === firstRide.id);
    if (
      !extraEffort ||
      typeof extraEffort.id !== "string" ||
      !extraEffort.recorded_at ||
      !extraEffort.segment_id ||
      !extraEffort.calculation_version ||
      !extraEffortSource
    ) {
      throw new Error("Expected an unselected accepted model effort fixture");
    }
    await expectDatabaseConstraint(
      db.transaction(async (tx) => {
        await tx.insert(performanceCalibrationModelInputs).values({
          calibration_evidence_id: candidate.id,
          effort_id: extraEffort.id,
          profile_id: profileId,
          metric_key: "threshold_power",
          activity_category: "bike",
          activity_id: firstRide.id,
          segment_id: extraEffort.segment_id,
          segment_revision: 1,
          source_artifact_id: firstRide.artifactId,
          source_artifact_digest: extraEffortSource.source_artifact_digest,
          observed_at: extraEffort.recorded_at,
          duration_seconds: extraEffort.duration_seconds,
          value: extraEffort.value,
          calculation_version: extraEffort.calculation_version,
          ordinal: 100,
        });
      }),
      "performance_calibration_model_inputs_complete",
    );
    await expectDatabaseConstraint(
      db.insert(performanceCalibrationEvidence).values({
        id: randomUUID(),
        profile_id: candidate.profile_id,
        metric_key: candidate.metric_key,
        activity_category: candidate.activity_category,
        value: candidate.value,
        unit: candidate.unit,
        observed_at: new Date(candidate.observed_at.getTime() - 1_000),
        activity_id: candidate.activity_id,
        segment_id: candidate.segment_id,
        segment_revision: candidate.segment_revision,
        source_artifact_id: candidate.source_artifact_id,
        state: "candidate",
        rejection_reason: null,
        policy_version: "backdated-calibration-evidence-test-v1",
        source_semantics: candidate.source_semantics,
        diagnostics: candidate.diagnostics,
        created_at: new Date(candidate.observed_at.getTime() - 2_000),
      }),
      "performance_calibration_evidence_source_integrity",
    );
    await expectDatabaseConstraint(
      db.insert(performanceCalibrations).values({
        id: randomUUID(),
        profile_id: calibration.profile_id,
        metric_key: calibration.metric_key,
        activity_category: calibration.activity_category,
        value: calibration.value,
        unit: calibration.unit,
        effective_at: new Date(calibration.effective_at.getTime() - 1_000),
        expires_at: calibration.expires_at,
        policy_version: calibration.policy_version,
        selection_diagnostics: calibration.selection_diagnostics,
        supersedes_id: null,
        created_at: new Date(calibration.effective_at.getTime() - 2_000),
      }),
      "performance_calibrations_linear_history",
    );
    await expectDatabaseConstraint(
      db.insert(performanceCalibrations).values({
        id: randomUUID(),
        profile_id: calibration.profile_id,
        metric_key: calibration.metric_key,
        activity_category: calibration.activity_category,
        value: calibration.value,
        unit: calibration.unit,
        effective_at: new Date(calibration.effective_at.getTime() - 1_000),
        expires_at: calibration.expires_at,
        policy_version: calibration.policy_version,
        selection_diagnostics: calibration.selection_diagnostics,
        supersedes_id: calibration.id,
      }),
      "performance_calibrations_supersession_order",
    );
    await expectDatabaseConstraint(
      db.transaction(async (tx) => {
        const mismatchedCalibrationId = randomUUID();
        await tx.insert(performanceCalibrations).values({
          id: mismatchedCalibrationId,
          profile_id: calibration.profile_id,
          metric_key: calibration.metric_key,
          activity_category: calibration.activity_category,
          value: calibration.value,
          unit: calibration.unit,
          effective_at: candidate.observed_at,
          expires_at: calibration.expires_at,
          policy_version: calibration.policy_version,
          selection_diagnostics: {
            selectedEvidenceIds: [randomUUID()],
            selectedActivityIds: [candidate.activity_id],
            evidenceCount: 1,
            selectionReason: "unchanged",
            trend: "stable",
            tolerance: 0.03,
            policyVersion: calibration.policy_version,
          },
          supersedes_id: calibration.id,
        });
        await tx.insert(performanceCalibrationSelectionEvidence).values({
          calibration_id: mismatchedCalibrationId,
          evidence_id: candidate.id,
          profile_id: candidate.profile_id,
          metric_key: candidate.metric_key,
          activity_category: candidate.activity_category,
          ordinal: 0,
        });
      }),
      "performance_calibrations_selection_integrity",
    );

    await reconcileSecond();
    await expect(
      db
        .select()
        .from(performanceCalibrationEvidence)
        .where(
          and(
            eq(performanceCalibrationEvidence.profile_id, profileId),
            eq(performanceCalibrationEvidence.metric_key, "threshold_power"),
          ),
        ),
    ).resolves.toHaveLength(2);
    await expect(
      db
        .select()
        .from(performanceCalibrations)
        .where(
          and(
            eq(performanceCalibrations.profile_id, profileId),
            eq(performanceCalibrations.metric_key, "threshold_power"),
          ),
        ),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select()
        .from(performanceCalibrationModelInputs)
        .where(eq(performanceCalibrationModelInputs.calibration_evidence_id, candidate.id)),
    ).resolves.toHaveLength(6);

    const readBikeThreshold = () =>
      readCalibrationAsOf(db, {
        profileId,
        identity: { metricKey: "threshold_power" as const, activityCategory: "bike" as const },
        asOf: new Date("2026-07-31T12:00:00.000Z"),
      });
    await expect(readBikeThreshold()).resolves.toMatchObject({
      identity: { metricKey: "threshold_power", activityCategory: "bike" },
    });

    await db
      .update(activities)
      .set({ segments_revision: 2 })
      .where(eq(activities.id, firstRide.id));
    await expect(readBikeThreshold()).resolves.toBeNull();
    await db
      .update(activities)
      .set({ segments_revision: 1 })
      .where(eq(activities.id, firstRide.id));
    await expect(readBikeThreshold()).resolves.toMatchObject({
      identity: { metricKey: "threshold_power", activityCategory: "bike" },
    });

    await db.transaction(async (tx) => {
      await expect(
        invalidateAllCalibrationEvidenceForActivity(tx, {
          profileId,
          activityId: firstRide.id,
          now: new Date("2026-07-30T12:03:00.000Z"),
          reason: "source_activity_removed",
        }),
      ).resolves.toContainEqual({ metricKey: "threshold_power", activityCategory: "bike" });
    });
    await expect(readBikeThreshold()).resolves.toBeNull();
  });

  it("makes exact reprocessing idempotent and replaces changed effort evidence", async () => {
    const profileId = await seedProfile();
    const activity = await seedActivity(profileId);
    const repository = createAthletePerformanceModelRepository(db);
    const asOf = new Date("2026-07-31T12:00:00.000Z");
    const initialGeneratedEfforts = generatedCyclingEfforts({
      activityId: activity.id,
      profileId,
      segmentId: activity.segmentId,
    });

    await db.transaction(async (tx) => {
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: initialGeneratedEfforts,
        detectedLTHR: null,
        now: seededAt,
      });
    });

    const initialModel = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(initialModel).toMatchObject({
      contractVersion: "athlete-performance-model-snapshot-v1",
      athleteId: profileId,
      categories: { bike: { activityCategory: "bike" } },
    });
    const initialRows = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, activity.id));
    expect(initialRows).toHaveLength(10);
    for (const row of initialRows) {
      expect(row.provenance).toMatchObject({ observation_id: row.id });
    }

    await db.transaction(async (tx) => {
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: generatedCyclingEfforts({
          activityId: activity.id,
          profileId,
          segmentId: activity.segmentId,
        }),
        detectedLTHR: null,
        now: new Date("2026-07-30T12:02:30.000Z"),
      });
    });
    const redeliveredRows = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, activity.id));
    const byDurationThenId = (
      left: (typeof initialRows)[number],
      right: (typeof initialRows)[number],
    ) => left.duration_seconds - right.duration_seconds || left.id.localeCompare(right.id);
    expect([...redeliveredRows].sort(byDurationThenId)).toEqual(
      [...initialRows].sort(byDurationThenId),
    );

    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({ segments_revision: 2 })
        .where(eq(activities.id, activity.id));
      await tx
        .update(activitySegments)
        .set({ segment_revision: 2 })
        .where(eq(activitySegments.id, activity.segmentId));
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: generatedCyclingEfforts({
          activityId: activity.id,
          profileId,
          segmentId: activity.segmentId,
          valueScale: 1.02,
        }),
        detectedLTHR: null,
        now: new Date("2026-07-30T12:03:00.000Z"),
      });
    });

    const reanalyzedModel = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(reanalyzedModel).toMatchObject({
      contractVersion: "athlete-performance-model-snapshot-v1",
      athleteId: profileId,
      categories: { bike: { activityCategory: "bike" } },
    });
    const reanalyzedRows = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, activity.id));
    const initialIds = new Set(initialRows.map((row) => row.id));
    expect(reanalyzedRows.every((row) => !initialIds.has(row.id))).toBe(true);
    for (const row of reanalyzedRows) {
      expect(row.provenance).toMatchObject({ observation_id: row.id });
    }

    const snapshot = await repository.readAthletePerformanceEvidenceSnapshot({
      athleteId: profileId,
      asOf,
    });
    expect(snapshot.effortReads.bike.rows).toHaveLength(10);
    expect(
      snapshot.effortReads.bike.rows.map(
        (row) => adaptActivityEffortToCanonicalPerformanceEvidence(row).evidenceRevision,
      ),
    ).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("uses only the current accepted Wahoo artifact after atomic segment and effort reconciliation", async () => {
    const profileId = await seedProfile();
    const activity = await seedActivity(profileId);
    const repository = createAthletePerformanceModelRepository(db);
    const asOf = new Date("2026-07-31T12:00:00.000Z");
    const initialGeneratedEfforts = generatedCyclingEfforts({
      activityId: activity.id,
      profileId,
      segmentId: activity.segmentId,
    });

    await db.transaction(async (tx) => {
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: initialGeneratedEfforts,
        detectedLTHR: {
          valueBpm: 170,
          recordedAt: completedAt,
          calculationVersion: "activity-file-lthr-v1",
          provenance: detectorProvenance(activity.id, activity.segmentId),
        },
        now: seededAt,
      });
    });

    const initialReads = await repository.readAthletePerformanceEvidenceSnapshot({
      athleteId: profileId,
      asOf,
    });
    expect(initialReads.effortReads.bike.rows).toHaveLength(10);
    expect(
      initialReads.effortReads.bike.rows.every(
        (row) =>
          row.current_artifact_id === activity.artifactId &&
          row.segment_source_artifact_id === activity.artifactId &&
          row.artifact_availability === "accepted",
      ),
    ).toBe(true);
    const initialModel = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    const initialCurve = initialModel.categories.bike.maximalMeanPowerCurve;
    if (initialCurve.status === "unavailable") {
      throw new Error("Expected initial Wahoo artifact to produce a cycling curve");
    }
    const initialEvidenceIds = new Set(initialCurve.sourceEvidenceIds);
    const initialTwentyMinutePower = initialCurve.value.points.find(
      (point) => point.durationSeconds === 1_200,
    )?.powerWatts;
    if (initialTwentyMinutePower === undefined) {
      throw new Error("Expected initial cycling curve to retain its 20-minute point");
    }
    expect(initialModel.heartRate.bike.lthr).toMatchObject({ status: "unavailable" });

    await db
      .update(activityArtifactLinks)
      .set({ is_current: false })
      .where(
        and(
          eq(activityArtifactLinks.activity_id, activity.id),
          eq(activityArtifactLinks.artifact_id, activity.artifactId),
        ),
      );
    await expect(
      db.select().from(activityEfforts).where(eq(activityEfforts.activity_id, activity.id)),
    ).resolves.toHaveLength(10);
    const nonCurrentReads = await repository.readAthletePerformanceEvidenceSnapshot({
      athleteId: profileId,
      asOf,
    });
    expect(nonCurrentReads.effortReads.bike.rows).toEqual([]);
    const nonCurrentModel = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    expect(nonCurrentModel).toMatchObject({
      categories: { bike: { maximalMeanPowerCurve: { status: "unavailable" } } },
      heartRate: { bike: { lthr: { status: "unavailable" } } },
    });
    await db
      .update(activityArtifactLinks)
      .set({ is_current: true })
      .where(
        and(
          eq(activityArtifactLinks.activity_id, activity.id),
          eq(activityArtifactLinks.artifact_id, activity.artifactId),
        ),
      );

    const changedArtifact = acceptedArtifact(profileId);
    const changedSegmentId = randomUUID();
    const changedAt = new Date("2026-07-30T12:03:00.000Z");
    await db.transaction(async (tx) => {
      await tx
        .insert(activityArtifacts)
        .values({ ...changedArtifact, first_accepted_at: changedAt });
      await tx
        .update(activityArtifactLinks)
        .set({ is_current: false })
        .where(
          and(
            eq(activityArtifactLinks.activity_id, activity.id),
            eq(activityArtifactLinks.profile_id, profileId),
            eq(activityArtifactLinks.artifact_id, activity.artifactId),
          ),
        );
      await tx.insert(activityArtifactLinks).values({
        id: randomUUID(),
        activity_id: activity.id,
        artifact_id: changedArtifact.id,
        profile_id: profileId,
        role: "source",
        ordinal: 1,
        is_current: true,
        provider_revision: "fixture-b",
        linked_at: changedAt,
      });
      await tx
        .update(activities)
        .set({ segments_revision: 2, segments_generated_at: changedAt, updated_at: changedAt })
        .where(and(eq(activities.id, activity.id), eq(activities.profile_id, profileId)));
      await tx.delete(activitySegments).where(eq(activitySegments.activity_id, activity.id));
      await tx.insert(activitySegments).values({
        id: changedSegmentId,
        activity_id: activity.id,
        profile_id: profileId,
        ordinal: 0,
        role: "activity",
        activity_category: "bike",
        start_offset_ms: 0,
        end_offset_ms: 3_600_000,
        source_artifact_id: changedArtifact.id,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
        },
        summary_version: 1,
        timing_coverage: "complete",
        active_ms: 3_600_000,
        moving_ms: 3_600_000,
        parser_version: "test-parser-v2",
        materializer_version: "test-materializer-v2",
        segment_revision: 2,
        created_at: changedAt,
      });
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: generatedCyclingEfforts({
          activityId: activity.id,
          profileId,
          segmentId: changedSegmentId,
          valueScale: 1.02,
        }),
        detectedLTHR: {
          valueBpm: 174,
          recordedAt: completedAt,
          calculationVersion: "activity-file-lthr-v1",
          provenance: detectorProvenance(activity.id, changedSegmentId),
        },
        now: changedAt,
      });
    });

    const changedReads = await repository.readAthletePerformanceEvidenceSnapshot({
      athleteId: profileId,
      asOf,
    });
    expect(changedReads.effortReads.bike.rows).toHaveLength(10);
    expect(
      changedReads.effortReads.bike.rows.every(
        (row) =>
          row.current_artifact_id === changedArtifact.id &&
          row.segment_source_artifact_id === changedArtifact.id &&
          row.segment_revision === 2 &&
          row.accepted_segments_revision === 2 &&
          row.current_artifact_profile_id === profileId &&
          row.artifact_owner_profile_id === profileId,
      ),
    ).toBe(true);
    expect(
      changedReads.effortReads.bike.rows.some(
        (row) => row.segment_source_artifact_id === activity.artifactId,
      ),
    ).toBe(false);
    const [oldLink] = await db
      .select({ isCurrent: activityArtifactLinks.is_current })
      .from(activityArtifactLinks)
      .where(
        and(
          eq(activityArtifactLinks.activity_id, activity.id),
          eq(activityArtifactLinks.artifact_id, activity.artifactId),
        ),
      );
    expect(oldLink?.isCurrent).toBe(false);

    const changedModel = await getAthletePerformanceModelAsOf(
      { athleteId: profileId, asOf },
      repository,
    );
    const changedCurve = changedModel.categories.bike.maximalMeanPowerCurve;
    if (changedCurve.status === "unavailable") {
      throw new Error("Expected changed Wahoo artifact to produce a cycling curve");
    }
    expect(
      changedCurve.value.points.find((point) => point.durationSeconds === 1_200)?.powerWatts,
    ).toBeGreaterThan(initialTwentyMinutePower);
    expect(changedCurve.sourceEvidenceIds.some((id) => initialEvidenceIds.has(id))).toBe(false);
    expect(changedModel.heartRate.bike.lthr).toMatchObject({ status: "unavailable" });
  });

  it("replaces changed same-duration efforts independently across repeated segments", async () => {
    const profileId = await seedProfile();
    const activity = await seedRepeatedBikeSegmentActivity(profileId);
    const repository = createAthletePerformanceModelRepository(db);
    const firstSegmentId = activity.segmentIds[0];
    const secondSegmentId = activity.segmentIds[1];
    if (!firstSegmentId || !secondSegmentId) throw new Error("Expected two repeated bike segments");
    const segmentInputs = [
      { id: firstSegmentId, endOffsetSeconds: 1_800 },
      { id: secondSegmentId, endOffsetSeconds: 3_600 },
    ];

    await db.transaction(async (tx) => {
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: repeatedSegmentCyclingEfforts({
          activityId: activity.id,
          profileId,
          segments: [...segmentInputs].reverse(),
        }),
        detectedLTHR: null,
        now: seededAt,
      });
    });

    const initialRows = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, activity.id));
    expect(initialRows).toHaveLength(4);
    const observationIdByIdentity = new Map(
      initialRows.map((row) => [`${row.segment_id}:${row.duration_seconds}`, row.id]),
    );

    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({ segments_revision: 2 })
        .where(eq(activities.id, activity.id));
      await tx
        .update(activitySegments)
        .set({ segment_revision: 2 })
        .where(eq(activitySegments.activity_id, activity.id));
      await reconcileGeneratedActivityEvidence(tx, {
        activityId: activity.id,
        profileId,
        efforts: repeatedSegmentCyclingEfforts({
          activityId: activity.id,
          profileId,
          segments: segmentInputs,
          valueScale: 1.03,
        }),
        detectedLTHR: null,
        now: new Date("2026-07-30T12:04:00.000Z"),
      });
    });

    const reanalyzedRows = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, activity.id));
    expect(reanalyzedRows).toHaveLength(4);
    for (const row of reanalyzedRows) {
      expect(row.id).not.toBe(
        observationIdByIdentity.get(`${row.segment_id}:${row.duration_seconds}`),
      );
      expect(row.provenance).toMatchObject({
        observation_id: row.id,
        activity_id: activity.id,
        segment_id: row.segment_id,
      });
    }

    const snapshot = await repository.readAthletePerformanceEvidenceSnapshot({
      athleteId: profileId,
      asOf: new Date("2026-07-31T12:00:00.000Z"),
    });
    expect(snapshot.effortReads.bike.rows).toHaveLength(4);
    for (const row of snapshot.effortReads.bike.rows) {
      const evidence = adaptActivityEffortToCanonicalPerformanceEvidence(row);
      expect(evidence.evidenceRevision).toBe(2);
      expect(evidence.observationId).toBe(evidence.evidenceId);
      expect(evidence.segmentId).toBe(row.segment_id);
      expect(evidence.provenance).toMatchObject({
        observationId: evidence.observationId,
        segmentId: evidence.segmentId,
      });
    }
  });
});
