import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  profileAthleteState,
  profiles,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { readThresholdsAsOf, thresholdEffortId } from "../../repositories/threshold-repository";
import { deleteActivityForProfile } from "../activities/activity-mutations";
import { submitActivity } from "../activities/submit-activity";
import type { ActivityArtifactStorage } from "../activity-file-ingestion/artifact-storage";
import {
  buildActivityFileDerivedSegmentSummary,
  calculateActivityFileStreamDerivedCalculations,
} from "../activity-file-ingestion/stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "../activity-file-ingestion/stream-metadata";
import { readPublishedAthleteStateSnapshot } from "../athlete-intelligence/published-athlete-state";
import { reconcileThresholdsWithProfileLockHeld } from "./reconcile-thresholds";

const seededProfileIds: string[] = [];
const now = new Date("2026-08-10T18:00:00.000Z");
const artifactStorage: ActivityArtifactStorage = {
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({ error: null }),
    }),
  },
  readObjectBounded: async () => ({
    data: new Uint8Array(),
    contentType: "application/octet-stream",
  }),
};

function digest() {
  return randomUUID().replaceAll("-", "").repeat(2);
}

async function seedProfile() {
  const profileId = randomUUID();
  const email = `${profileId}@threshold-persistence.test`;
  seededProfileIds.push(profileId);
  await db.insert(users).values({
    id: profileId,
    name: "Threshold persistence test",
    email,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    created_at: now,
    updated_at: now,
  });
  return profileId;
}

async function seedRunEvidence(input: {
  profileId: string;
  finishedAt: Date;
  rawValue: number;
  grade?: { value: number; windowCoverage?: number; maximumGapSeconds?: number };
}) {
  const activityId = randomUUID();
  const artifactId = randomUUID();
  const segmentId = randomUUID();
  const sourceDigest = digest();
  const startedAt = new Date(input.finishedAt.getTime() - 1_800_000);
  const effort = (
    sourceSeries: "grade_adjusted_speed" | "raw_speed",
    value: number,
    options: { windowCoverage?: number; maximumGapSeconds?: number } = {},
  ): typeof activityEfforts.$inferInsert => {
    const effortId = thresholdEffortId({
      activityId,
      segmentId,
      sourceArtifactId: artifactId,
      sourceRevision: 1,
      effortType: "speed",
      sourceSeries,
      startOffsetMs: 0,
      endOffsetMs: 1_800_000,
      method: "activity_file_best_effort",
      calculationVersion: "best-effort-extraction-v1",
    });
    return {
      id: effortId,
      profile_id: input.profileId,
      activity_id: activityId,
      segment_id: segmentId,
      recorded_at: input.finishedAt,
      activity_category: "run",
      effort_type: "speed",
      source_series: sourceSeries,
      duration_seconds: 1_800,
      source_artifact_id: artifactId,
      source_revision: 1,
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      window_coverage: options.windowCoverage ?? 1,
      max_gap_seconds: options.maximumGapSeconds ?? 2,
      unit: "meters_per_second",
      value,
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: "best-effort-extraction-v1",
      provenance: {
        observation_id: effortId,
        activity_id: activityId,
        segment_id: segmentId,
        derived_from: "activity_file_stream",
        source_series: sourceSeries,
        interval_convention: "current_sample_applies_to_preceding_interval",
        exact_window_start_timestamp_seconds: startedAt.getTime() / 1_000,
        exact_window_end_timestamp_seconds: input.finishedAt.getTime() / 1_000,
        exact_window_start_offset_seconds: 0,
        exact_window_end_offset_seconds: 1_800,
        duration_seconds: 1_800,
        contributing_duration_seconds: 1_800,
        window_coverage: options.windowCoverage ?? 1,
        source_time_coverage: 1,
        extraction_status: "available",
        extraction_reason: null,
        persisted_start_offset_quantization: "nearest_millisecond_v1",
        calculation_version: "best-effort-extraction-v1",
      },
      created_at: now,
    };
  };
  const rawEffort = effort("raw_speed", input.rawValue);
  const gradeEffort = input.grade
    ? effort("grade_adjusted_speed", input.grade.value, input.grade)
    : null;
  const efforts = [...(gradeEffort ? [gradeEffort] : []), rawEffort];

  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: "Exact run threshold window",
      started_at: startedAt,
      finished_at: input.finishedAt,
      elapsed_ms: 1_800_000,
      active_ms: 1_800_000,
      moving_ms: 1_800_000,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "threshold-live-db-v1",
      decoded_contract_version: "threshold-live-db-v1",
      materializer_version: "threshold-live-db-v1",
      segments_generated_at: now,
      created_at: now,
      updated_at: now,
    });
    await tx.insert(activityArtifacts).values({
      id: artifactId,
      profile_id: input.profileId,
      digest_algorithm: "sha256",
      digest: sourceDigest,
      byte_size: 1_024,
      bucket: "activity-files",
      path: `artifacts/sha256/${input.profileId}/${sourceDigest}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: now,
    });
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: activityId,
      artifact_id: artifactId,
      profile_id: input.profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: now,
    });
    await tx.insert(activitySegments).values({
      id: segmentId,
      activity_id: activityId,
      profile_id: input.profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "run",
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      source_artifact_id: artifactId,
      source_session_index: 0,
      summary: {
        version: 1,
        timing: {
          timingCoverage: "complete",
          activeMs: 1_800_000,
          movingMs: 1_800_000,
        },
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 1_800_000,
      moving_ms: 1_800_000,
      segment_revision: 1,
      parser_version: "threshold-live-db-v1",
      materializer_version: "threshold-live-db-v1",
      created_at: now,
    });
    await tx.insert(activityEfforts).values(efforts);
  });
  return {
    profileId: input.profileId,
    activityId,
    artifactId,
    segmentId,
    startedAt,
    finishedAt: input.finishedAt,
    efforts,
    rawEffortId: rawEffort.id,
    gradeEffortId: gradeEffort?.id ?? null,
  };
}

async function reconcile(input: Awaited<ReturnType<typeof seedRunEvidence>>) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.profileId}, 0))`);
    await reconcileThresholdsWithProfileLockHeld(tx, {
      profileId: input.profileId,
      activityId: input.activityId,
      efforts: input.efforts,
      now,
    });
  });
}

function pauseRepeatableReadAfterExecute(executeOrdinal: number) {
  let paused!: () => void;
  const pauseReached = new Promise<void>((resolve) => {
    paused = resolve;
  });
  let resume!: () => void;
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const root = {
    $client: {},
    transaction: (
      read: (executor: unknown) => Promise<unknown>,
      options: { accessMode: "read only"; isolationLevel: "repeatable read" },
    ) =>
      db.transaction(async (tx) => {
        let executeCount = 0;
        const executor = new Proxy(tx, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "execute") {
              return async (...args: unknown[]) => {
                const result = await (value as (...queryArgs: unknown[]) => Promise<unknown>).apply(
                  target,
                  args,
                );
                executeCount += 1;
                if (executeCount === executeOrdinal) {
                  paused();
                  await resumed;
                }
                return result;
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return read(executor);
      }, options),
  } as never;
  return { root, pauseReached, resume };
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

describe("threshold calibration persistence", () => {
  it.each([
    {
      name: "valid grade evidence",
      grade: { value: 4.1 },
      selectedRole: "preferred" as const,
      selectedSeries: "grade_adjusted_speed" as const,
      preferredStatus: "qualified" as const,
      preferredReason: undefined,
    },
    {
      name: "implausible grade evidence",
      grade: { value: 12.5 },
      selectedRole: "fallback" as const,
      selectedSeries: "raw_speed" as const,
      preferredStatus: "rejected" as const,
      preferredReason: "value_implausible",
    },
    {
      name: "incomplete grade coverage",
      grade: { value: 4.1, windowCoverage: 0.949_999 },
      selectedRole: "fallback" as const,
      selectedSeries: "raw_speed" as const,
      preferredStatus: "rejected" as const,
      preferredReason: "coverage_insufficient",
    },
    {
      name: "excessive grade gap",
      grade: { value: 4.1, maximumGapSeconds: 10.000_001 },
      selectedRole: "fallback" as const,
      selectedSeries: "raw_speed" as const,
      preferredStatus: "rejected" as const,
      preferredReason: "gap_bound_exceeded",
    },
  ])("selects from both persisted run series for $name", async (scenario) => {
    const profileId = await seedProfile();
    const source = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawValue: 4,
      grade: scenario.grade,
    });

    await reconcile(source);

    const efforts = await db
      .select({ id: activityEfforts.id, sourceSeries: activityEfforts.source_series })
      .from(activityEfforts)
      .where(eq(activityEfforts.activity_id, source.activityId))
      .orderBy(activityEfforts.source_series);
    expect(efforts.map(({ sourceSeries }) => sourceSeries).sort()).toEqual([
      "grade_adjusted_speed",
      "raw_speed",
    ]);
    expect(new Set(efforts.map(({ id }) => id)).size).toBe(2);

    const [evaluation] = await db
      .select()
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.source_activity_id, source.activityId));
    if (!evaluation) throw new Error("Expected run threshold evaluation");
    expect(evaluation.diagnostics).toMatchObject({
      selection: {
        status: "qualified",
        selectedRole: scenario.selectedRole,
        selectedEvidenceId:
          scenario.selectedSeries === "grade_adjusted_speed"
            ? source.gradeEffortId
            : source.rawEffortId,
        attempts: [
          {
            role: "preferred",
            evaluation: {
              status: scenario.preferredStatus,
              ...(scenario.preferredReason === undefined
                ? {}
                : { reason: scenario.preferredReason }),
            },
          },
          { role: "fallback", evaluation: { status: "qualified" } },
        ],
      },
    });
    const [primary] = await db
      .select({ sourceSeries: thresholdEvaluationEfforts.source_series })
      .from(thresholdEvaluationEfforts)
      .where(eq(thresholdEvaluationEfforts.evaluation_id, evaluation.id));
    expect(primary?.sourceSeries).toBe(scenario.selectedSeries);
  });

  it("persists the measured fallback rejection with its exact source-local effort", async () => {
    const profileId = await seedProfile();
    const source = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawValue: 12.5,
    });

    await reconcile(source);

    const [evaluation] = await db
      .select()
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.source_activity_id, source.activityId));
    expect(evaluation).toMatchObject({
      outcome: "rejected",
      rejection_reason: "value_implausible",
    });
    if (!evaluation) throw new Error("Expected rejected threshold evaluation");
    const links = await db
      .select()
      .from(thresholdEvaluationEfforts)
      .where(eq(thresholdEvaluationEfforts.evaluation_id, evaluation.id));
    expect(links).toMatchObject([
      {
        effort_id: source.rawEffortId,
        activity_id: source.activityId,
        source_revision: 1,
        role: "primary",
      },
    ]);
    await expect(
      db.select().from(thresholds).where(eq(thresholds.profile_id, profileId)),
    ).resolves.toEqual([]);
  });

  it("persists the Core lifecycle value with complete immutable links and replays exactly", async () => {
    const profileId = await seedProfile();
    const first = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-08T12:00:00.000Z"),
      rawValue: 4,
    });
    const second = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawValue: 4.02,
    });

    await reconcile(first);
    await reconcile(second);
    await reconcile(second);

    const evaluations = await db
      .select()
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.profile_id, profileId))
      .orderBy(thresholdEvaluations.observed_at);
    expect(evaluations).toHaveLength(2);
    expect(evaluations.map(({ value }) => value)).toEqual([4, 4.01]);
    expect(evaluations[1]?.diagnostics).toMatchObject({
      selection: {
        status: "qualified",
        selectedRole: "fallback",
        attempts: [
          { role: "preferred", evaluation: { status: "rejected" } },
          { role: "fallback", evaluation: { status: "qualified" } },
        ],
      },
      candidate: { value: 4.02 },
    });

    const latestEvaluation = evaluations[1];
    if (!latestEvaluation) throw new Error("Expected confirmed threshold evaluation");
    const links = await db
      .select()
      .from(thresholdEvaluationEfforts)
      .where(eq(thresholdEvaluationEfforts.evaluation_id, latestEvaluation.id))
      .orderBy(thresholdEvaluationEfforts.role, thresholdEvaluationEfforts.ordinal);
    expect(links).toMatchObject([
      { effort_id: second.rawEffortId, source_series: "raw_speed", role: "primary", ordinal: 0 },
      {
        effort_id: first.rawEffortId,
        source_series: "raw_speed",
        role: "supporting",
        ordinal: 0,
      },
    ]);

    const [published] = await db
      .select()
      .from(thresholds)
      .where(eq(thresholds.evaluation_id, latestEvaluation.id));
    expect(published?.value).toBe(4.01);
    await expect(
      readThresholdsAsOf(db, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        value: 4.01,
        state: "confirmed",
        sourceEvaluationIds: evaluations.map(({ id }) => id),
        sourceEffortIds: [first.rawEffortId, second.rawEffortId],
        sourceActivityIds: [first.activityId, second.activityId],
      }),
    ]);
    await expect(
      readThresholdsAsOf(db, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
        excludedActivityId: second.activityId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        value: 4,
        state: "provisional",
        sourceActivityIds: [first.activityId],
      }),
    ]);
    await expect(
      readThresholdsAsOf(db, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
        excludedActivityId: first.activityId,
      }),
    ).resolves.toEqual([]);

    await expect(
      db
        .update(thresholdEvaluationEfforts)
        .set({ ordinal: 1 })
        .where(eq(thresholdEvaluationEfforts.evaluation_id, latestEvaluation.id)),
    ).rejects.toMatchObject({ cause: { code: "23514", constraint: "threshold_truth_immutable" } });
  });

  it("keeps threshold selection and provenance coherent across concurrent source deletion", async () => {
    const profileId = await seedProfile();
    const first = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-08T12:00:00.000Z"),
      rawValue: 4,
    });
    const second = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawValue: 4.02,
    });
    await reconcile(first);
    await reconcile(second);

    const synchronized = pauseRepeatableReadAfterExecute(1);

    const readDuringDeletion = readThresholdsAsOf(synchronized.root, {
      profileId,
      asOf: new Date("2026-08-10T12:00:00.000Z"),
    });
    await synchronized.pauseReached;
    await deleteActivityForProfile({
      db,
      artifactStorage,
      activityId: second.activityId,
      profileId,
    });
    synchronized.resume();

    await expect(readDuringDeletion).resolves.toEqual([
      expect.objectContaining({
        value: 4.01,
        state: "confirmed",
        sourceActivityIds: [first.activityId, second.activityId],
        sourceEffortIds: [first.rawEffortId, second.rawEffortId],
      }),
    ]);
    await expect(
      readThresholdsAsOf(db, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        value: 4,
        state: "provisional",
        sourceActivityIds: [first.activityId],
      }),
    ]);
  });

  it("keeps published athlete state and canonical thresholds on one deletion-safe snapshot", async () => {
    const profileId = await seedProfile();
    const first = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-08T12:00:00.000Z"),
      rawValue: 4,
    });
    const second = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawValue: 4.02,
    });
    await reconcile(first);
    await reconcile(second);
    const synchronized = pauseRepeatableReadAfterExecute(1);

    const overlayDuringDeletion = readPublishedAthleteStateSnapshot({
      db: synchronized.root,
      profileId,
      now: new Date("2026-08-10T12:00:00.000Z"),
    });
    await synchronized.pauseReached;
    await deleteActivityForProfile({
      db,
      artifactStorage,
      activityId: second.activityId,
      profileId,
    });
    synchronized.resume();

    await expect(overlayDuringDeletion).resolves.toMatchObject({
      performanceTargets: {
        thresholds: {
          run: {
            status: "available",
            value: 4.01,
            state: "confirmed",
            sourceActivityIds: [first.activityId, second.activityId],
            sourceEffortIds: [first.rawEffortId, second.rawEffortId],
          },
        },
      },
    });
    await expect(
      readPublishedAthleteStateSnapshot({
        db,
        profileId,
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      performanceTargets: {
        thresholds: {
          run: {
            status: "available",
            value: 4,
            state: "provisional",
            sourceActivityIds: [first.activityId],
          },
        },
      },
    });
  });

  it("cascades source replacement and deletion atomically through application transactions", async () => {
    const profileId = await seedProfile();
    const first = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-08T12:00:00.000Z"),
      rawValue: 4,
    });
    const second = await seedRunEvidence({
      profileId,
      finishedAt: new Date("2026-08-09T12:00:00.000Z"),
      rawValue: 4.02,
    });
    await reconcile(first);
    await reconcile(second);

    const [beforeState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    const [obsoleteEvaluation] = await db
      .select()
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.source_activity_id, second.activityId));
    if (!beforeState || !obsoleteEvaluation) throw new Error("Expected confirmed threshold state");

    const replacementDigest = "c".repeat(64);
    const replacementArtifactId = randomUUID();
    const replacement = calculateActivityFileStreamDerivedCalculations({
      activityId: second.activityId,
      profileId,
      segmentId: second.segmentId,
      sourceArtifactId: replacementArtifactId,
      sourceRevision: 2,
      activityStartedAt: second.startedAt,
      segmentStartOffsetSeconds: 0,
      segmentEndOffsetSeconds: 1_800,
      activityCategory: "run",
      distance: 7_272,
      duration: 1_800,
      streamMetadata: collectActivityFileStreamMetadata(
        Array.from({ length: 1_801 }, (_, secondOffset) => ({
          timestamp: new Date(second.startedAt.getTime() + secondOffset * 1_000),
          speed: 4.04,
          altitude: secondOffset * 0.01,
        })),
      ),
    });
    const replacementSummary = buildActivityFileDerivedSegmentSummary({
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
        normalizedPowerResult: replacement.normalizedPowerResult,
      },
      metrics: replacement,
    });
    await submitActivity(
      db,
      {
        kind: "enrich",
        activityId: second.activityId,
        profileId,
        deviceManufacturer: null,
        deviceProduct: null,
        summaryValues: {
          elapsed_ms: 1_800_000,
          active_ms: 1_800_000,
          moving_ms: 1_800_000,
          timing_coverage: "complete",
        },
        segmentSet: {
          version: 1,
          elapsedMs: 1_800_000,
          segments: [
            {
              id: second.segmentId,
              ordinal: 0,
              role: "activity",
              activity_category: "run",
              startOffsetMs: 0,
              endOffsetMs: 1_800_000,
              source: {
                kind: "artifact",
                artifactId: replacementArtifactId,
                source: { standard: "fit", format: "fit" },
                sessionMessageIndex: 0,
              },
              summary: replacementSummary,
            },
          ],
        },
        efforts: replacement.effortsToInsert,
        detectedLTHR: null,
        ingestion: {
          source: "manual_import",
          artifact: {
            sha256: replacementDigest,
            byteSize: 1_024,
            bucket: "activity-files",
            path: `artifacts/sha256/${profileId}/${replacementDigest}`,
            mediaType: "application/vnd.ant.fit",
            format: "fit",
          },
        },
      },
      { deferAthleteStateRefresh: true },
    );

    const [afterReplacementState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    if (!afterReplacementState) throw new Error("Expected dirty state after source replacement");
    expect(afterReplacementState).toMatchObject({
      source_revision: beforeState.source_revision + 1,
      dirty_from_at: second.finishedAt,
    });
    const persistedReplacementWindows = await db
      .select({
        id: activityEfforts.id,
        sourceArtifactId: activityEfforts.source_artifact_id,
        sourceSeries: activityEfforts.source_series,
        startOffsetMs: activityEfforts.start_offset_ms,
        endOffsetMs: activityEfforts.end_offset_ms,
      })
      .from(activityEfforts)
      .where(
        and(
          eq(activityEfforts.activity_id, second.activityId),
          eq(activityEfforts.source_revision, 2),
          eq(activityEfforts.duration_seconds, 1_800),
        ),
      );
    expect(persistedReplacementWindows.map(({ sourceSeries }) => sourceSeries).sort()).toEqual([
      "grade_adjusted_speed",
      "raw_speed",
    ]);
    expect(new Set(persistedReplacementWindows.map(({ id }) => id)).size).toBe(2);
    for (const effort of persistedReplacementWindows) {
      expect(effort.id).toBe(
        thresholdEffortId({
          activityId: second.activityId,
          segmentId: second.segmentId,
          sourceArtifactId: effort.sourceArtifactId,
          sourceRevision: 2,
          effortType: "speed",
          sourceSeries: effort.sourceSeries,
          startOffsetMs: effort.startOffsetMs,
          endOffsetMs: effort.endOffsetMs,
          method: "activity_file_best_effort",
          calculationVersion: "best-effort-extraction-v1",
        }),
      );
    }
    await expect(
      db
        .select()
        .from(thresholdEvaluations)
        .where(eq(thresholdEvaluations.id, obsoleteEvaluation.id)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(thresholdEvaluationEfforts)
        .where(eq(thresholdEvaluationEfforts.evaluation_id, obsoleteEvaluation.id)),
    ).resolves.toHaveLength(0);
    const replacementEvaluations = await db
      .select()
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.profile_id, profileId))
      .orderBy(thresholdEvaluations.observed_at);
    expect(replacementEvaluations).toHaveLength(2);
    expect(replacementEvaluations[1]).toMatchObject({
      source_activity_id: second.activityId,
      source_revision: 2,
      diagnostics: { selection: { status: "qualified", selectedRole: "preferred" } },
    });
    await expect(
      db.select().from(thresholds).where(eq(thresholds.profile_id, profileId)),
    ).resolves.toHaveLength(2);

    await deleteActivityForProfile({
      db,
      artifactStorage,
      activityId: first.activityId,
      profileId,
    });

    const [afterDeletionState] = await db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    expect(afterDeletionState).toMatchObject({
      source_revision: afterReplacementState.source_revision + 1,
      dirty_from_at: first.finishedAt,
    });
    await expect(
      db.select().from(thresholdEvaluations).where(eq(thresholdEvaluations.profile_id, profileId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(thresholdEvaluationEfforts)
        .where(eq(thresholdEvaluationEfforts.profile_id, profileId)),
    ).resolves.toHaveLength(0);
    await expect(
      db.select().from(thresholds).where(eq(thresholds.profile_id, profileId)),
    ).resolves.toHaveLength(0);
  });
});
