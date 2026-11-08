import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  deferredThresholdCalibrations,
  profiles,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
  users,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { reconcileThresholdsWithProfileLockHeld } from "../performance-model/reconcile-thresholds";
import { reconcileGeneratedActivityEvidence } from "./reconcile-activity-evidence";

const profileIds: string[] = [];
const eligibleCompletedAt = new Date(Date.now() - 60_000);
const createdAt = new Date();

async function seedBikeActivity({
  completedAt = eligibleCompletedAt,
}: {
  completedAt?: Date;
} = {}) {
  const profileId = randomUUID();
  const activityId = randomUUID();
  const artifactId = randomUUID();
  const segmentId = randomUUID();
  const email = `${profileId}@threshold-reconciliation.test`;
  const digestSeed = randomUUID().replaceAll("-", "");
  const digest = `${digestSeed}${digestSeed}`;
  profileIds.push(profileId);

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: profileId, name: "Threshold fixture", email, emailVerified: true });
    await tx.insert(profiles).values({
      id: profileId,
      email,
      created_at: createdAt,
      updated_at: createdAt,
    });
    await tx.insert(activities).values({
      id: activityId,
      profile_id: profileId,
      name: "Exact threshold ride",
      started_at: new Date(completedAt.getTime() - 1_800_000),
      finished_at: completedAt,
      elapsed_ms: 1_800_000,
      active_ms: 1_800_000,
      moving_ms: 1_800_000,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "threshold-reconciliation-v1",
      decoded_contract_version: "threshold-reconciliation-v1",
      materializer_version: "threshold-reconciliation-v1",
      segments_generated_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
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
      first_accepted_at: createdAt,
    });
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: createdAt,
    });
    await tx.insert(activitySegments).values({
      id: segmentId,
      activity_id: activityId,
      profile_id: profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "bike",
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      source_artifact_id: artifactId,
      source_session_index: 0,
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 1_800_000,
      moving_ms: 1_800_000,
      segment_revision: 1,
      parser_version: "threshold-reconciliation-v1",
      materializer_version: "threshold-reconciliation-v1",
      created_at: createdAt,
    });
  });

  return { profileId, activityId, artifactId, segmentId, completedAt };
}

function exactBikeThresholdEffort(input: Awaited<ReturnType<typeof seedBikeActivity>>) {
  const id = randomUUID();
  return {
    id,
    created_at: createdAt,
    profile_id: input.profileId,
    activity_id: input.activityId,
    segment_id: input.segmentId,
    recorded_at: input.completedAt,
    activity_category: "bike" as const,
    effort_type: "power" as const,
    source_series: "power" as const,
    duration_seconds: 1_800,
    distance_meters: null,
    source_artifact_id: input.artifactId,
    source_revision: 1,
    start_offset_ms: 0,
    end_offset_ms: 1_800_000,
    window_coverage: 1,
    max_gap_seconds: 2,
    unit: "watts",
    value: 300,
    source: "imported" as const,
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    quality_score: null,
    provenance: {
      observation_id: id,
      activity_id: input.activityId,
      segment_id: input.segmentId,
      derived_from: "activity_file_stream",
      source_series: "power",
      interval_convention: "current_sample_applies_to_preceding_interval",
      exact_window_start_timestamp_seconds: input.completedAt.getTime() / 1_000 - 1_800,
      exact_window_end_timestamp_seconds: input.completedAt.getTime() / 1_000,
      exact_window_start_offset_seconds: 0,
      exact_window_end_offset_seconds: 1_800,
      duration_seconds: 1_800,
      contributing_duration_seconds: 1_800,
      window_coverage: 1,
      source_time_coverage: 1,
      extraction_status: "available",
      extraction_reason: null,
      persisted_start_offset_quantization: "nearest_millisecond_v1",
      calculation_version: "best-effort-extraction-v1",
    },
  } satisfies typeof activityEfforts.$inferInsert;
}

afterEach(async () => {
  for (const profileId of profileIds.splice(0)) {
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

describe("reconcileGeneratedActivityEvidence against PostgreSQL", () => {
  it("persists one idempotent exact-window effort and canonical threshold", async () => {
    const fixture = await seedBikeActivity();
    const firstEffort = exactBikeThresholdEffort(fixture);
    const reconcile = (effort: typeof firstEffort) =>
      db.transaction((tx) =>
        reconcileGeneratedActivityEvidence(tx, {
          activityId: fixture.activityId,
          profileId: fixture.profileId,
          efforts: [effort],
          detectedLTHR: null,
          now: createdAt,
        }),
      );

    await reconcile(firstEffort);
    const replayId = randomUUID();
    await reconcile({
      ...firstEffort,
      id: replayId,
      provenance: { ...firstEffort.provenance, observation_id: replayId },
    });

    await expect(
      db.select().from(activityEfforts).where(eq(activityEfforts.activity_id, fixture.activityId)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select()
        .from(thresholdEvaluations)
        .where(eq(thresholdEvaluations.source_activity_id, fixture.activityId)),
    ).resolves.toHaveLength(2);
    await expect(
      db
        .select()
        .from(thresholdEvaluationEfforts)
        .where(eq(thresholdEvaluationEfforts.activity_id, fixture.activityId)),
    ).resolves.toHaveLength(1);
    await expect(
      db.select().from(thresholds).where(eq(thresholds.profile_id, fixture.profileId)),
    ).resolves.toHaveLength(1);
  });

  it("defers evaluations when a device-recorded completion is ahead of the server clock", async () => {
    const completedAt = new Date(Date.now() + 60_000);
    const fixture = await seedBikeActivity({ completedAt });
    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: fixture.activityId,
        profileId: fixture.profileId,
        efforts: [exactBikeThresholdEffort(fixture)],
        detectedLTHR: null,
        now: new Date(completedAt.getTime() - 1_000),
      }),
    );

    await expect(
      db
        .select()
        .from(thresholdEvaluations)
        .where(eq(thresholdEvaluations.source_activity_id, fixture.activityId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select({
          dueAt: deferredThresholdCalibrations.due_at,
          revision: deferredThresholdCalibrations.source_revision,
        })
        .from(deferredThresholdCalibrations)
        .where(eq(deferredThresholdCalibrations.activity_id, fixture.activityId)),
    ).resolves.toEqual([{ dueAt: completedAt, revision: 1 }]);
  });

  it("replays historical calibration from the exact persisted PostgreSQL real value", async () => {
    const fixture = await seedBikeActivity();
    const generatedValue = 373.3333333333333;
    const generatedEffort = { ...exactBikeThresholdEffort(fixture), value: generatedValue };

    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: fixture.activityId,
        profileId: fixture.profileId,
        efforts: [generatedEffort],
        detectedLTHR: null,
        deferPerformanceCalibration: true,
        now: createdAt,
      }),
    );
    const [persistedEffort] = await db
      .select()
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, fixture.activityId));
    if (!persistedEffort) throw new Error("Expected persisted effort fixture");
    expect(persistedEffort.value).toBe(373.333);

    await db.transaction((tx) =>
      reconcileGeneratedActivityEvidence(tx, {
        activityId: fixture.activityId,
        profileId: fixture.profileId,
        efforts: [persistedEffort],
        detectedLTHR: null,
        now: createdAt,
      }),
    );

    await expect(
      db.transaction((tx) =>
        reconcileThresholdsWithProfileLockHeld(tx, {
          activityId: fixture.activityId,
          profileId: fixture.profileId,
          efforts: [
            {
              ...generatedEffort,
              id: persistedEffort.id,
              provenance: {
                ...generatedEffort.provenance,
                observation_id: persistedEffort.id,
              },
            },
          ],
          now: createdAt,
        }),
      ),
    ).rejects.toThrow("Threshold evaluation replay diverged from immutable source revision");

    const replayId = randomUUID();
    await expect(
      db.transaction((tx) =>
        reconcileGeneratedActivityEvidence(tx, {
          activityId: fixture.activityId,
          profileId: fixture.profileId,
          efforts: [
            {
              ...generatedEffort,
              id: replayId,
              provenance: { ...generatedEffort.provenance, observation_id: replayId },
            },
          ],
          detectedLTHR: null,
          now: createdAt,
        }),
      ),
    ).resolves.toMatchObject({
      effortInserts: [],
      calibrationReconciliation: {
        changed: false,
        identities: [
          { activityCategory: "bike", metric: "power" },
          { activityCategory: "bike", metric: "lthr" },
        ],
        deferredIdentities: [],
      },
    });
    await expect(
      db.select().from(activityEfforts).where(eq(activityEfforts.activity_id, fixture.activityId)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select()
        .from(thresholdEvaluations)
        .where(eq(thresholdEvaluations.source_activity_id, fixture.activityId)),
    ).resolves.toHaveLength(2);
  });
});
