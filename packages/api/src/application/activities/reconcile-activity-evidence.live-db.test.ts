import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
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
      provider: "wahoo",
      external_id: randomUUID(),
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
      provider: "wahoo",
      external_id: randomUUID(),
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
      updated_at: seededAt,
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
        updated_at: seededAt,
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

async function seedGeneratedLthr(profileId: string, activityId: string, value: number) {
  const [metric] = await db
    .insert(profileMetrics)
    .values({
      id: randomUUID(),
      created_at: seededAt,
      updated_at: seededAt,
      profile_id: profileId,
      metric_type: "lthr",
      recorded_at: completedAt,
      unit: "bpm",
      value,
      source: "derived",
      method: "activity_file_lthr_detection",
      calculation_version: "activity-file-lthr-v1",
      reference_activity_id: activityId,
      provenance: detectorProvenance(activityId),
    })
    .returning();
  if (!metric) throw new Error("Failed to seed generated LTHR metric");
  return metric;
}

function generatedInput(profileId: string, activityId: string, detectedLTHR: number) {
  const lthrEvidence: GeneratedActivityLthrEvidence = {
    valueBpm: detectedLTHR,
    recordedAt: completedAt,
    calculationVersion: "activity-file-lthr-v1",
    provenance: detectorProvenance(activityId),
  };
  return {
    profileId,
    activityId,
    efforts: [],
    detectedLTHR: lthrEvidence,
    now: new Date("2026-07-30T12:02:00.000Z"),
  };
}

async function generatedLthrRows(profileId: string, activityId: string) {
  return db
    .select()
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, profileId),
        eq(profileMetrics.reference_activity_id, activityId),
        eq(profileMetrics.metric_type, "lthr"),
        eq(profileMetrics.source, "derived"),
        eq(profileMetrics.method, "activity_file_lthr_detection"),
      ),
    );
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
  it("updates only the requested activity's generated LTHR evidence without duplicates", async () => {
    const profileId = await seedProfile();
    const firstActivityId = await seedActivity(profileId);
    const secondActivityId = await seedActivity(profileId);
    const firstMetric = await seedGeneratedLthr(profileId, firstActivityId.id, 175);
    const secondMetric = await seedGeneratedLthr(profileId, secondActivityId.id, 170);

    await db.transaction(async (tx) => {
      await reconcileGeneratedActivityEvidence(
        tx,
        generatedInput(profileId, secondActivityId.id, 165),
      );
    });

    await expect(generatedLthrRows(profileId, firstActivityId.id)).resolves.toEqual([firstMetric]);
    await expect(generatedLthrRows(profileId, secondActivityId.id)).resolves.toEqual([
      expect.objectContaining({
        id: secondMetric.id,
        created_at: secondMetric.created_at,
        value: 165,
        method: "activity_file_lthr_detection",
        source: "derived",
        calculation_version: "activity-file-lthr-v1",
        reference_activity_id: secondActivityId.id,
        provenance: detectorProvenance(secondActivityId.id),
      }),
    ]);

    await db.transaction(async (tx) => {
      await reconcileGeneratedActivityEvidence(
        tx,
        generatedInput(profileId, secondActivityId.id, 164),
      );
    });

    await expect(generatedLthrRows(profileId, firstActivityId.id)).resolves.toEqual([firstMetric]);
    await expect(generatedLthrRows(profileId, secondActivityId.id)).resolves.toEqual([
      expect.objectContaining({
        id: secondMetric.id,
        value: 164,
        method: "activity_file_lthr_detection",
        source: "derived",
        calculation_version: "activity-file-lthr-v1",
        reference_activity_id: secondActivityId.id,
        provenance: detectorProvenance(secondActivityId.id),
      }),
    ]);
  });

  it("keeps effort row/provenance identity valid across import and reanalysis", async () => {
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
    expect(reanalyzedRows.map((row) => row.id).sort()).toEqual(
      initialRows.map((row) => row.id).sort(),
    );
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
    expect(initialModel.heartRate.bike.lthr).toMatchObject({ status: "available", valueBpm: 170 });

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
    expect(changedModel.heartRate.bike.lthr).toMatchObject({ status: "available", valueBpm: 174 });
  });

  it("keeps same-duration effort identities stable across repeated same-category segments", async () => {
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
      expect(row.id).toBe(observationIdByIdentity.get(`${row.segment_id}:${row.duration_seconds}`));
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
