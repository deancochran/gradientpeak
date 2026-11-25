import { randomUUID } from "node:crypto";
import {
  type ActivitySubmission,
  activityArtifactId,
  processAthleteStateJobs,
  readGoalProgress,
  readThresholdOverview,
  readyActivityIngestion,
  submitActivity,
} from "@repo/api/test-support/activity-evidence-acceptance";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  activities,
  type activityEfforts,
  profileAthleteState,
  thresholdEvaluations,
  thresholds,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { AuthenticatedE2EActor } from "./actors";
import type { LocalE2EDatabase } from "./database";
import type { E2EExecutionIdentity } from "./identity";

export type GoalProgressFixture = {
  activityName: string;
  activityId: string;
  advancePublication: (goalId: string) => Promise<GoalProgressPublicationTransition>;
  assertReadModels: (goalId: string) => Promise<void>;
  publishedRevision: number;
};

export type GoalProgressPublicationTransition = {
  activityId: string;
  nextOverview: Awaited<ReturnType<typeof readThresholdOverview>>;
  previousProgress: Awaited<ReturnType<typeof readGoalProgress>>;
  previousPublishedRevision: number;
  publishedRevision: number;
};

/**
 * Creates the observation through the canonical ingestion/submission path. The
 * athlete-state worker, rather than this fixture, is the sole publisher of the
 * derived threshold baseline.
 */
export async function createGoalProgressFixture(input: {
  actor: AuthenticatedE2EActor;
  database: LocalE2EDatabase;
  identity: E2EExecutionIdentity;
}): Promise<GoalProgressFixture> {
  const [existingActivities, existingThresholds, existingEvaluations] = await Promise.all([
    input.database.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, input.actor.profileId)),
    input.database.db
      .select({ id: thresholds.id })
      .from(thresholds)
      .where(eq(thresholds.profile_id, input.actor.profileId)),
    input.database.db
      .select({ id: thresholdEvaluations.id })
      .from(thresholdEvaluations)
      .where(eq(thresholdEvaluations.profile_id, input.actor.profileId)),
  ]);
  if (existingActivities.length || existingThresholds.length || existingEvaluations.length)
    throw new Error(
      "The canonical goal-progress fixture requires an athlete without seeded evidence.",
    );

  const activityId = input.identity.uuid("goal-progress-activity");
  const segmentId = input.identity.uuid("goal-progress-segment");
  const effortId = input.identity.uuid("goal-progress-effort");
  const activityName = "Playwright qualified threshold source";
  const finishedAt = new Date(Date.now() - 86_400_000);
  const startedAt = new Date(finishedAt.getTime() - 1_800_000);
  const digest = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
  const artifact = {
    sha256: digest,
    byteSize: 1_024,
    bucket: "activity-files",
    path: `artifacts/sha256/${input.actor.profileId}/${digest}`,
    mediaType: "application/vnd.ant.fit" as const,
    format: "fit" as const,
  };
  const sourceArtifactId = activityArtifactId(
    input.actor.profileId,
    artifact.sha256,
    artifact.byteSize,
  );
  const ingestion = await readyActivityIngestion(input.database.db, {
    profileId: input.actor.profileId,
    operationId: input.identity.suffix("goal-progress-ingestion", 32),
    source: "manual_import",
    artifact,
  });
  const normalizedPowerResult = calculateCyclingNormalizedPower({
    samples: Array.from({ length: 361 }, (_, index) => ({
      timestampSeconds: index * 5,
      powerWatts: 300,
    })),
  });
  if (normalizedPowerResult.status === "unavailable")
    throw new Error("The qualified cycling fixture did not produce normalized power.");

  const effort = {
    id: effortId,
    created_at: new Date(),
    profile_id: input.actor.profileId,
    activity_id: activityId,
    segment_id: segmentId,
    recorded_at: finishedAt,
    activity_category: "bike" as const,
    effort_type: "power" as const,
    source_series: "power" as const,
    duration_seconds: 1_800,
    distance_meters: null,
    source_artifact_id: sourceArtifactId,
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
      observation_id: effortId,
      activity_id: activityId,
      segment_id: segmentId,
      derived_from: "activity_file_stream",
      source_series: "power",
      interval_convention: "current_sample_applies_to_preceding_interval",
      exact_window_start_timestamp_seconds: startedAt.getTime() / 1_000,
      exact_window_end_timestamp_seconds: finishedAt.getTime() / 1_000,
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
  const submission: ActivitySubmission = {
    requestedActivityId: activityId,
    profileId: input.actor.profileId,
    name: activityName,
    nameStrategy: "provided",
    notes: null,
    contentVisibility: "private",
    startedAt,
    finishedAt,
    elapsedMs: 1_800_000,
    activeMs: 1_800_000,
    movingMs: 1_800_000,
    timingCoverage: "complete",
    distanceMeters: 20_000,
    calories: null,
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPower: 300,
    maxPower: 300,
    avgCadence: null,
    maxCadence: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    normalizedSpeedMps: null,
    avgTemperature: null,
    deviceManufacturer: null,
    deviceProduct: null,
    laps: null,
    mapBounds: null,
    polyline: null,
    segmentSet: {
      version: 1,
      elapsedMs: 1_800_000,
      segments: [
        {
          id: segmentId,
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 1_800_000,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
            sessionMessageIndex: 0,
          },
          summary: {
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
            distanceMeters: 20_000,
            averagePowerWatts: 300,
            normalizedPowerResult,
          },
        },
      ],
    },
    analysis: {
      efforts: [effort],
      detectedLTHR: null,
      ingestion: { source: "manual_import", ...ingestion, artifact },
    },
  };
  const submitted = await submitActivity(input.database.db, submission);
  if (submitted.id !== activityId || submitted.noOp)
    throw new Error("The canonical goal-progress activity submission was not accepted.");

  await processAthleteStateJobs({ db: input.database.db, limit: 10, now: new Date() });
  await processAthleteStateJobs({ db: input.database.db, limit: 10, now: new Date() });
  const [state] = await input.database.db
    .select({ publishedRevision: profileAthleteState.published_revision })
    .from(profileAthleteState)
    .where(eq(profileAthleteState.profile_id, input.actor.profileId));
  if (state?.publishedRevision === null || state?.publishedRevision === undefined)
    throw new Error("The athlete-state worker did not publish the qualified threshold.");

  return {
    activityName,
    activityId,
    publishedRevision: state.publishedRevision,
    advancePublication: async (goalId) => {
      const previousProgress = await readGoalProgress({
        db: input.database.db,
        profileId: input.actor.profileId,
        goalId,
      });
      const previousPublishedRevision = previousProgress.publication?.publishedRevision;
      if (previousPublishedRevision === null || previousPublishedRevision === undefined)
        throw new Error("Goal progress must expose a published revision before it can advance.");

      const nextActivityId = input.identity.uuid("goal-progress-advance-activity");
      const nextSegmentId = input.identity.uuid("goal-progress-advance-segment");
      const nextEffortId = input.identity.uuid("goal-progress-advance-effort");
      const nextActivityName = "Playwright advanced threshold source";
      const finishedAt = new Date(Date.now() - 43_200_000);
      const startedAt = new Date(finishedAt.getTime() - 1_800_000);
      const digest = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
      const artifact = {
        sha256: digest,
        byteSize: 1_024,
        bucket: "activity-files",
        path: `artifacts/sha256/${input.actor.profileId}/${digest}`,
        mediaType: "application/vnd.ant.fit" as const,
        format: "fit" as const,
      };
      const sourceArtifactId = activityArtifactId(
        input.actor.profileId,
        artifact.sha256,
        artifact.byteSize,
      );
      const ingestion = await readyActivityIngestion(input.database.db, {
        profileId: input.actor.profileId,
        operationId: input.identity.suffix("goal-progress-advance-ingestion", 32),
        source: "manual_import",
        artifact,
      });
      const normalizedPowerResult = calculateCyclingNormalizedPower({
        samples: Array.from({ length: 361 }, (_, index) => ({
          timestampSeconds: index * 5,
          powerWatts: 320,
        })),
      });
      if (normalizedPowerResult.status === "unavailable")
        throw new Error("The advanced cycling fixture did not produce normalized power.");

      const effort = {
        id: nextEffortId,
        created_at: new Date(),
        profile_id: input.actor.profileId,
        activity_id: nextActivityId,
        segment_id: nextSegmentId,
        recorded_at: finishedAt,
        activity_category: "bike" as const,
        effort_type: "power" as const,
        source_series: "power" as const,
        duration_seconds: 1_800,
        distance_meters: null,
        source_artifact_id: sourceArtifactId,
        source_revision: 1,
        start_offset_ms: 0,
        end_offset_ms: 1_800_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "watts",
        value: 320,
        source: "imported" as const,
        method: "activity_file_best_effort",
        calculation_version: "best-effort-extraction-v1",
        quality_score: null,
        provenance: {
          observation_id: nextEffortId,
          activity_id: nextActivityId,
          segment_id: nextSegmentId,
          derived_from: "activity_file_stream",
          source_series: "power",
          interval_convention: "current_sample_applies_to_preceding_interval",
          exact_window_start_timestamp_seconds: startedAt.getTime() / 1_000,
          exact_window_end_timestamp_seconds: finishedAt.getTime() / 1_000,
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
      const submission: ActivitySubmission = {
        requestedActivityId: nextActivityId,
        profileId: input.actor.profileId,
        name: nextActivityName,
        nameStrategy: "provided",
        notes: null,
        contentVisibility: "private",
        startedAt,
        finishedAt,
        elapsedMs: 1_800_000,
        activeMs: 1_800_000,
        movingMs: 1_800_000,
        timingCoverage: "complete",
        distanceMeters: 20_000,
        calories: null,
        elevationGainMeters: null,
        avgHeartRate: null,
        maxHeartRate: null,
        avgPower: 320,
        maxPower: 320,
        avgCadence: null,
        maxCadence: null,
        avgSpeedMps: null,
        maxSpeedMps: null,
        normalizedSpeedMps: null,
        avgTemperature: null,
        deviceManufacturer: null,
        deviceProduct: null,
        laps: null,
        mapBounds: null,
        polyline: null,
        segmentSet: {
          version: 1,
          elapsedMs: 1_800_000,
          segments: [
            {
              id: nextSegmentId,
              ordinal: 0,
              role: "activity",
              activity_category: "bike" as const,
              startOffsetMs: 0,
              endOffsetMs: 1_800_000,
              source: {
                kind: "artifact",
                artifactId: sourceArtifactId,
                source: { standard: "fit", format: "fit" },
                sessionMessageIndex: 0,
              },
              summary: {
                version: 1,
                timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
                distanceMeters: 20_000,
                averagePowerWatts: 320,
                normalizedPowerResult,
              },
            },
          ],
        },
        analysis: {
          efforts: [effort],
          detectedLTHR: null,
          ingestion: { source: "manual_import", ...ingestion, artifact },
        },
      };
      const submitted = await submitActivity(input.database.db, submission);
      if (submitted.id !== nextActivityId || submitted.noOp)
        throw new Error("The advanced canonical activity submission was not accepted.");

      await processAthleteStateJobs({ db: input.database.db, limit: 10, now: new Date() });
      await processAthleteStateJobs({ db: input.database.db, limit: 10, now: new Date() });
      const nextOverview = await readThresholdOverview({
        db: input.database.db,
        profileId: input.actor.profileId,
        historyLimit: 100,
      });
      const publishedRevision = nextOverview.publication.publishedRevision;
      if (
        publishedRevision === null ||
        publishedRevision === undefined ||
        publishedRevision <= previousPublishedRevision
      )
        throw new Error("The second canonical activity did not advance the published revision.");

      return {
        activityId: nextActivityId,
        nextOverview,
        previousProgress,
        previousPublishedRevision,
        publishedRevision,
      };
    },
    assertReadModels: async (goalId) => {
      const [goalProgress, thresholdOverview] = await Promise.all([
        readGoalProgress({
          db: input.database.db,
          profileId: input.actor.profileId,
          goalId,
        }),
        readThresholdOverview({
          db: input.database.db,
          profileId: input.actor.profileId,
          historyLimit: 100,
        }),
      ]);
      if (
        goalProgress.publication?.publishedRevision === null ||
        goalProgress.publication?.publishedRevision === undefined ||
        thresholdOverview.publication.publishedRevision === null ||
        thresholdOverview.publication.publishedRevision === undefined ||
        goalProgress.publication.publishedRevision !==
          thresholdOverview.publication.publishedRevision ||
        goalProgress.publication.publishedRevision !== state.publishedRevision
      )
        throw new Error(
          "Goal progress and threshold overview did not read one published revision.",
        );
      if (
        goalProgress.result.status === "unsupported" ||
        goalProgress.result.current?.value !== 285 ||
        goalProgress.result.target.targetValue !== 300 ||
        goalProgress.result.metrics.remainingGap !== 15
      )
        throw new Error(
          "The canonical qualified effort did not produce the expected 285 W progress.",
        );
      const history = thresholdOverview.history.items;
      const sourceActivities = history[0]?.sourceActivities;
      if (
        history.length !== 1 ||
        sourceActivities?.length !== 1 ||
        sourceActivities[0]?.id !== activityId ||
        sourceActivities[0]?.name !== activityName ||
        goalProgress.provenance?.current?.sourceActivities.length !== 1 ||
        goalProgress.provenance.current.sourceActivities[0]?.id !== activityId
      )
        throw new Error(
          "Published threshold history was not solely derived from the canonical source.",
        );
    },
  };
}
