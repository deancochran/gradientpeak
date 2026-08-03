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
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT,
  type AthletePerformanceModelReadInput,
  createAthletePerformanceModelRepository,
} from "./athlete-performance-model-repository";

const seededProfileIds: string[] = [];
const seededAt = new Date("2026-08-01T02:00:00.000Z");

type SeededBikeActivity = Readonly<{
  activityId: string;
  artifactId: string;
  profileId: string;
  segmentId: string;
}>;

async function seedProfile(label: string): Promise<string> {
  const profileId = randomUUID();
  const email = `${profileId}@performance-model-batch.test`;
  seededProfileIds.push(profileId);
  await db.insert(users).values({
    id: profileId,
    name: `Performance-model batch ${label}`,
    email,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    created_at: seededAt,
    updated_at: seededAt,
  });
  return profileId;
}

async function seedBikeActivity(
  profileId: string,
  label: string,
  observedAt: Date,
): Promise<SeededBikeActivity> {
  const activityId = randomUUID();
  const artifactId = randomUUID();
  const segmentId = randomUUID();
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  const startedAt = new Date(observedAt.getTime() - 3_600_000);

  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: activityId,
      profile_id: profileId,
      name: `Performance-model batch ${label}`,
      started_at: startedAt,
      finished_at: observedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "performance-model-batch-test-v1",
      decoded_contract_version: "performance-model-batch-test-v1",
      materializer_version: "performance-model-batch-test-v1",
      segments_generated_at: seededAt,
      created_at: seededAt,
      updated_at: seededAt,
    });
    await tx.insert(activityArtifacts).values({
      id: artifactId,
      profile_id: profileId,
      digest_algorithm: "sha256",
      digest,
      byte_size: 1_024,
      bucket: "activity-files",
      path: `artifacts/sha256/${profileId}/${digest}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: seededAt,
    });
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: seededAt,
    });
    await tx.insert(activitySegments).values({
      id: segmentId,
      activity_id: activityId,
      profile_id: profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "bike",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      source_artifact_id: artifactId,
      source_session_index: 0,
      summary: {
        version: 1,
        timing: {
          timingCoverage: "complete",
          activeMs: 3_600_000,
          movingMs: 3_600_000,
        },
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      segment_revision: 1,
      parser_version: "performance-model-batch-test-v1",
      materializer_version: "performance-model-batch-test-v1",
      created_at: seededAt,
    });
  });

  return { activityId, artifactId, profileId, segmentId };
}

async function seedCanonicalBikeEffort(
  activity: SeededBikeActivity,
  recordedAt: Date,
): Promise<string> {
  const evidenceId = randomUUID();
  const durationSeconds = 300;
  await db.insert(activityEfforts).values({
    id: evidenceId,
    created_at: seededAt,
    updated_at: seededAt,
    profile_id: activity.profileId,
    activity_id: activity.activityId,
    segment_id: activity.segmentId,
    recorded_at: recordedAt,
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: durationSeconds,
    start_offset: 0,
    unit: "watts",
    value: 300,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    provenance: {
      observation_id: evidenceId,
      activity_id: activity.activityId,
      segment_id: activity.segmentId,
      derived_from: "activity_file_stream",
      source_series: "power",
      interval_convention: "current_sample_applies_to_preceding_interval",
      exact_window_start_timestamp_seconds: recordedAt.getTime() / 1_000 - durationSeconds,
      exact_window_end_timestamp_seconds: recordedAt.getTime() / 1_000,
      exact_window_start_offset_seconds: 0,
      exact_window_end_offset_seconds: durationSeconds,
      duration_seconds: durationSeconds,
      contributing_duration_seconds: durationSeconds,
      window_coverage: 1,
      source_time_coverage: 1,
      extraction_status: "available",
      extraction_reason: null,
      persisted_start_offset_quantization: "floor_seconds_v1",
      calculation_version: "best-effort-extraction-v1",
    },
  });
  return evidenceId;
}

async function seedLthrEvidence(activity: SeededBikeActivity, recordedAt: Date): Promise<string> {
  const evidenceId = randomUUID();
  await db.insert(profileMetrics).values({
    id: evidenceId,
    profile_id: activity.profileId,
    metric_type: "lthr",
    recorded_at: recordedAt,
    unit: "bpm",
    value: 170,
    source: "derived",
    method: "activity_file_lthr_detection",
    calculation_version: "activity-file-lthr-v1",
    provenance: { segment_id: activity.segmentId },
    reference_activity_id: activity.activityId,
    created_at: seededAt,
    updated_at: seededAt,
  });
  return evidenceId;
}

async function seedHighVolumeLthrEvidence(
  activity: SeededBikeActivity,
  firstRecordedAt: Date,
): Promise<void> {
  const evidenceCount = ATHLETE_PERFORMANCE_BATCH_ROW_LIMIT + 1;
  await db.execute(sql`
    with generated_evidence as (
      select
        gen_random_uuid() as id,
        ${firstRecordedAt}::timestamptz + ordinal * interval '1 millisecond' as recorded_at
      from generate_series(0, ${evidenceCount - 1}) as ordinal
    )
    insert into profile_metrics (
      id,
      profile_id,
      metric_type,
      recorded_at,
      unit,
      value,
      source,
      method,
      calculation_version,
      provenance,
      reference_activity_id,
      created_at,
      updated_at
    )
    select
      generated_evidence.id,
      ${activity.profileId}::uuid,
      'lthr',
      generated_evidence.recorded_at,
      'bpm',
      170,
      'derived',
      'activity_file_lthr_detection',
      'activity-file-lthr-v1',
      jsonb_build_object('segment_id', ${activity.segmentId}::text),
      ${activity.activityId}::uuid,
      ${seededAt},
      ${seededAt}
    from generated_evidence
  `);
}

afterEach(async () => {
  for (const profileId of seededProfileIds.splice(0)) {
    await db.transaction(async (tx) => {
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
  }
});

afterAll(async () => pool.end());

describe("athlete performance-model historical batch reads", () => {
  it("matches direct reads across athletes, as-of windows, and self-exclusion above the old global cap", async () => {
    const highVolumeAthleteId = await seedProfile("high-volume athlete");
    const otherAthleteId = await seedProfile("other athlete");
    const historicalRecordedAt = new Date("2026-05-15T12:00:00.000Z");
    const otherOlderRecordedAt = new Date("2026-07-01T12:00:00.000Z");
    const otherNewerRecordedAt = new Date("2026-07-02T12:00:00.000Z");
    const highVolumeRecordedAt = new Date("2026-08-01T00:00:00.000Z");

    const historicalActivity = await seedBikeActivity(
      highVolumeAthleteId,
      "historical",
      historicalRecordedAt,
    );
    const highVolumeActivity = await seedBikeActivity(
      highVolumeAthleteId,
      "high-volume",
      new Date("2026-08-01T01:00:00.000Z"),
    );
    const otherOlderActivity = await seedBikeActivity(
      otherAthleteId,
      "other older",
      otherOlderRecordedAt,
    );
    const otherNewerActivity = await seedBikeActivity(
      otherAthleteId,
      "other newer",
      otherNewerRecordedAt,
    );

    const historicalEffortId = await seedCanonicalBikeEffort(
      historicalActivity,
      historicalRecordedAt,
    );
    const historicalLthrId = await seedLthrEvidence(historicalActivity, historicalRecordedAt);
    const otherOlderEffortId = await seedCanonicalBikeEffort(
      otherOlderActivity,
      otherOlderRecordedAt,
    );
    const otherOlderLthrId = await seedLthrEvidence(otherOlderActivity, otherOlderRecordedAt);
    const otherNewerEffortId = await seedCanonicalBikeEffort(
      otherNewerActivity,
      otherNewerRecordedAt,
    );
    const otherNewerLthrId = await seedLthrEvidence(otherNewerActivity, otherNewerRecordedAt);
    await seedHighVolumeLthrEvidence(highVolumeActivity, highVolumeRecordedAt);

    const requests: AthletePerformanceModelReadInput[] = [
      {
        athleteId: highVolumeAthleteId,
        asOf: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        athleteId: highVolumeAthleteId,
        asOf: new Date("2026-05-16T00:00:00.000Z"),
      },
      {
        athleteId: otherAthleteId,
        asOf: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        athleteId: otherAthleteId,
        asOf: new Date("2026-08-02T00:00:00.000Z"),
        excludedActivityId: otherNewerActivity.activityId,
      },
    ];
    const repository = createAthletePerformanceModelRepository(db);
    const readEvidenceBatch = repository.readEvidenceBatch;
    if (!readEvidenceBatch) throw new Error("Expected canonical performance-model batch reader");

    const directReads = [];
    for (const request of requests) {
      directReads.push(await repository.readAthletePerformanceEvidenceSnapshot(request));
    }
    const batchReads = await readEvidenceBatch(requests);

    expect(batchReads).toEqual(directReads);
    expect(batchReads[0]?.heartRateReads.bike.lthr).toMatchObject({
      rows: { length: 100 },
      truncated: true,
    });
    expect(batchReads[1]?.effortReads.bike.rows.map(({ id }) => id)).toEqual([historicalEffortId]);
    expect(batchReads[1]?.heartRateReads.bike.lthr.rows.map(({ id }) => id)).toEqual([
      historicalLthrId,
    ]);
    expect(batchReads[2]?.effortReads.bike.rows.map(({ id }) => id)).toEqual([
      otherNewerEffortId,
      otherOlderEffortId,
    ]);
    expect(batchReads[2]?.heartRateReads.bike.lthr.rows.map(({ id }) => id)).toEqual([
      otherNewerLthrId,
      otherOlderLthrId,
    ]);
    expect(batchReads[3]?.effortReads.bike.rows.map(({ id }) => id)).toEqual([otherOlderEffortId]);
    expect(batchReads[3]?.heartRateReads.bike.lthr.rows.map(({ id }) => id)).toEqual([
      otherOlderLthrId,
    ]);
  }, 60_000);
});
