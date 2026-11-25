import { randomUUID } from "node:crypto";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { type activityEfforts, profileAthleteState } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import {
  type ActivitySubmission,
  activityArtifactId,
  submitActivity,
} from "../../../../packages/api/src/application/activities/submit-activity";
import { AthleteStateWorkerService } from "../../../../packages/api/src/application/athlete-intelligence/athlete-state-worker";
import { readyActivityIngestion } from "../../../../packages/api/src/test-support/ready-activity-ingestion";
import type { AuthenticatedE2EActor } from "./actors";
import type { LocalE2EDatabase } from "./database";
import type { E2EExecutionIdentity } from "./identity";

export type GoalProgressFixture = {
  activityName: string;
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

  const worker = new AthleteStateWorkerService({ db: input.database.db });
  await worker.processDueJobs({ limit: 10, now: new Date() });
  await worker.processDueJobs({ limit: 10, now: new Date() });
  const [state] = await input.database.db
    .select({ publishedRevision: profileAthleteState.published_revision })
    .from(profileAthleteState)
    .where(eq(profileAthleteState.profile_id, input.actor.profileId));
  if (state?.publishedRevision === null || state?.publishedRevision === undefined)
    throw new Error("The athlete-state worker did not publish the qualified threshold.");

  return { activityName, publishedRevision: state.publishedRevision };
}
