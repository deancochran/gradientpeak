import type { RecordingSessionArtifact } from "@repo/core";
import { clearRecordingCheckpoint } from "../ActivityRecorder/checkpointStorage";
import { clearPendingFinalizedArtifact } from "../ActivityRecorder/finalizedArtifactStorage";
import {
  loadActivitySubmissionQueueJobByArtifactId,
  upsertActivitySubmissionQueueJob,
} from "./storage";
import { type ActivitySubmissionQueueJob, activitySubmissionQueueJobSchema } from "./types";

/** Idempotent finalized-artifact -> durable-queue compare-and-set handoff. */
const activeHandoffs = new Map<string, Promise<ActivitySubmissionQueueJob>>();

async function handoffOnce(
  artifact: RecordingSessionArtifact,
  profileId: string,
): Promise<ActivitySubmissionQueueJob> {
  if (artifact.profileId !== profileId) {
    throw new Error("Finalized recording belongs to a different profile");
  }
  const existing = await loadActivitySubmissionQueueJobByArtifactId(artifact.sessionId, profileId);
  if (existing) {
    await clearPendingFinalizedArtifact();
    await clearRecordingCheckpoint(artifact.sessionId);
    return existing;
  }
  if (!artifact.activityFilePath || !artifact.executionManifest) {
    throw new Error("Finalized recording is missing its FIT path or execution manifest");
  }
  const firstActivity = artifact.executionManifest.occurrences.find(
    (occurrence) => occurrence.role === "activity" && occurrence.category,
  );
  const category = firstActivity?.category ?? artifact.snapshot.activity.category;
  const now = new Date().toISOString();
  const job = activitySubmissionQueueJobSchema.parse({
    schemaVersion: 2,
    id: artifact.sessionId,
    artifactId: artifact.sessionId,
    sessionId: artifact.sessionId,
    localActivityFilePath: artifact.activityFilePath,
    streamArtifactPaths: artifact.streamArtifactPaths,
    executionManifest: artifact.executionManifest,
    draft: {
      recordingSessionId: artifact.sessionId,
      profileId,
      startedAt: artifact.snapshot.identity.startedAt,
      finishedAt: artifact.completedAt,
      name: `${category} activity`,
      activityType: category,
      durationSeconds: artifact.finalStats.durationSeconds,
      movingSeconds: artifact.finalStats.movingSeconds,
      distanceMeters: artifact.finalStats.distanceMeters,
      calories: artifact.finalStats.calories ?? null,
      activityPlanId: artifact.snapshot.activity.activityPlanId,
    },
    status: "queued",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  await upsertActivitySubmissionQueueJob(job);
  await clearPendingFinalizedArtifact();
  await clearRecordingCheckpoint(artifact.sessionId);
  return job;
}

export function ensureFinalizedArtifactQueueHandoff(
  artifact: RecordingSessionArtifact,
  profileId = artifact.profileId,
): Promise<ActivitySubmissionQueueJob> {
  if (artifact.profileId !== profileId) {
    return Promise.reject(new Error("Finalized recording belongs to a different profile"));
  }
  const active = activeHandoffs.get(artifact.sessionId);
  if (active) return active;
  const handoff = handoffOnce(artifact, profileId).finally(() => {
    if (activeHandoffs.get(artifact.sessionId) === handoff)
      activeHandoffs.delete(artifact.sessionId);
  });
  activeHandoffs.set(artifact.sessionId, handoff);
  return handoff;
}
