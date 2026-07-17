/**
 * Migration-only, bounded converter for the final pre-V3 single-sport local state.
 * Runtime readers must never consult these legacy keys.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type RecordingActivityCategory,
  type RecordingExecutionManifest,
  recordingSessionArtifactSchema,
} from "@repo/core";
import { z } from "zod";
import { PENDING_FINALIZED_ARTIFACT_KEY } from "../ActivityRecorder/finalizedArtifactStorage";
import { ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY } from "./storage";
import { activitySubmissionQueueJobSchema } from "./types";

export const LEGACY_PENDING_FINALIZED_ARTIFACT_KEY = "activity-recorder:pending-finalized-artifact";
export const LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY = "activity-submission-queue:jobs";

function singleSportManifest(input: {
  segmentId: string;
  sessionId: string;
  category: RecordingActivityCategory;
  startedAt: string;
  completedAt: string;
  activeSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
}): RecordingExecutionManifest {
  return {
    version: 1,
    compilerVersion: 1,
    planHash: "0".repeat(64),
    occurrences: [
      {
        occurrenceId: `migration:${input.sessionId}`,
        globalOrdinal: 0,
        segmentId: input.segmentId,
        role: "activity",
        category: input.category,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        activeSeconds: input.activeSeconds,
        movingSeconds: input.movingSeconds,
        distanceMeters: input.distanceMeters,
        timerEvents: [],
        laps: [],
      },
    ],
  };
}

export async function migrateSingleSportLocalStateToV3Once(): Promise<void> {
  const [legacyArtifactRaw, legacyJobsRaw] = await Promise.all([
    AsyncStorage.getItem(LEGACY_PENDING_FINALIZED_ARTIFACT_KEY),
    AsyncStorage.getItem(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY),
  ]);
  if (!legacyArtifactRaw && !legacyJobsRaw) return;
  const legacyArtifactSchema = recordingSessionArtifactSchema.omit({
    schemaVersion: true,
    profileId: true,
    executionManifest: true,
  });
  const legacyJobSchema = activitySubmissionQueueJobSchema.omit({
    schemaVersion: true,
    executionManifest: true,
  });
  const { randomUUID } = await import("expo-crypto");

  if (legacyArtifactRaw) {
    const artifact = legacyArtifactSchema.parse(JSON.parse(legacyArtifactRaw));
    const converted = recordingSessionArtifactSchema.parse({
      ...artifact,
      schemaVersion: 2,
      profileId: artifact.sessionId.split(":")[0] || artifact.sessionId,
      executionManifest: singleSportManifest({
        segmentId: randomUUID(),
        sessionId: artifact.sessionId,
        category: artifact.snapshot.activity.category,
        startedAt: artifact.snapshot.identity.startedAt,
        completedAt: artifact.completedAt,
        activeSeconds: artifact.finalStats.durationSeconds,
        movingSeconds: artifact.finalStats.movingSeconds,
        distanceMeters: artifact.finalStats.distanceMeters,
      }),
    });
    await AsyncStorage.setItem(PENDING_FINALIZED_ARTIFACT_KEY, JSON.stringify(converted));
  }

  if (legacyJobsRaw) {
    const jobs = z.array(legacyJobSchema).parse(JSON.parse(legacyJobsRaw));
    const converted = jobs.map((job) =>
      activitySubmissionQueueJobSchema.parse({
        ...job,
        schemaVersion: 2,
        executionManifest: singleSportManifest({
          segmentId: randomUUID(),
          sessionId: job.sessionId ?? job.artifactId,
          category: job.draft.activityType,
          startedAt: job.draft.startedAt,
          completedAt: job.draft.finishedAt,
          activeSeconds: job.draft.durationSeconds,
          movingSeconds: job.draft.movingSeconds,
          distanceMeters: job.draft.distanceMeters,
        }),
      }),
    );
    await AsyncStorage.setItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, JSON.stringify(converted));
  }

  await AsyncStorage.multiRemove([
    LEGACY_PENDING_FINALIZED_ARTIFACT_KEY,
    LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
  ]);
}
