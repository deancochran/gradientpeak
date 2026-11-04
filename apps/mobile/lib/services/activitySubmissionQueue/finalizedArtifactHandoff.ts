import type { RecordingSessionArtifact } from "@repo/core";
import { assertRecordingPlanExecutionStructureHashes } from "@/lib/recording/structureHash";
import { clearRecordingCheckpoint } from "../ActivityRecorder/checkpointStorage";
import { createFinalizedArtifactQueueHandoff } from "../ActivityRecorder/recordingEvidenceJournal";
import { type ActivitySubmissionQueueJob, activitySubmissionQueueJobSchema } from "./types";

/** Idempotent finalized-artifact -> durable-queue compare-and-set handoff. */
const activeHandoffs = new Map<string, Promise<ActivitySubmissionQueueJob | null>>();

async function handoffOnce(
  artifact: RecordingSessionArtifact,
  profileId: string,
): Promise<ActivitySubmissionQueueJob | null> {
  if (artifact.profileId !== profileId) {
    throw new Error("Finalized recording belongs to a different profile");
  }
  if (!artifact.activityFilePath || !artifact.executionManifest) {
    throw new Error("Finalized recording is missing its FIT path or execution manifest");
  }
  await assertRecordingPlanExecutionStructureHashes(artifact.snapshot.planExecution);
  const firstActivity = artifact.executionManifest.occurrences.find(
    (occurrence) => occurrence.role === "activity" && occurrence.activity_category,
  );
  const activity_category =
    firstActivity?.activity_category ?? artifact.snapshot.activity.activity_category;
  const now = new Date().toISOString();
  const job = activitySubmissionQueueJobSchema.parse({
    schemaVersion: 3,
    id: artifact.sessionId,
    artifactId: artifact.sessionId,
    sessionId: artifact.sessionId,
    localActivityFilePath: artifact.activityFilePath,
    streamArtifactPaths: artifact.streamArtifactPaths,
    executionManifest: artifact.executionManifest,
    planExecution: artifact.snapshot.planExecution ?? null,
    draft: {
      recordingSessionId: artifact.sessionId,
      profileId,
      startedAt: artifact.snapshot.identity.startedAt,
      finishedAt: artifact.completedAt,
      name: `${activity_category} activity`,
      activity_category,
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
  const handoff = await createFinalizedArtifactQueueHandoff(job);
  if (handoff === "absent" || handoff === "rejected") return null;
  await clearRecordingCheckpoint(artifact.sessionId);
  return handoff === "discarded"
    ? activitySubmissionQueueJobSchema.parse({
        ...job,
        status: "failed",
        retryClass: "permanent",
        errorCategory: "discarded",
        lastError: "discarded",
      })
    : job;
}

export function ensureFinalizedArtifactQueueHandoff(
  artifact: RecordingSessionArtifact,
  profileId = artifact.profileId,
): Promise<ActivitySubmissionQueueJob | null> {
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
