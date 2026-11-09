import { Directory, File } from "expo-file-system";
import type { ActivitySubmissionQueueJob } from "../activitySubmissionQueue/types";
import {
  completeAcceptedRecordingEvidenceCleanup,
  completeDiscardedRecordingEvidenceCleanup,
  loadDueAcceptedRecordingEvidenceCleanups,
  loadDueDiscardedRecordingEvidenceCleanups,
  retryAcceptedRecordingEvidenceCleanup,
  retryDiscardedRecordingEvidenceCleanup,
  tombstoneAcceptedRecordingEvidence,
} from "./recordingEvidenceJournal";
import type { RecordingSessionArtifact } from "./types";

export function finalizedArtifactReferencesLocalFiles(
  artifact: RecordingSessionArtifact | null,
): boolean {
  return Boolean(
    artifact && (artifact.activityFilePath || (artifact.streamArtifactPaths?.length ?? 0) > 0),
  );
}

export async function deleteFinalizedArtifactFiles(
  artifact: RecordingSessionArtifact | null,
): Promise<void> {
  if (!artifact) {
    return;
  }

  if (artifact.activityFilePath) {
    try {
      const activityFile = new File(artifact.activityFilePath);
      if (activityFile.exists) {
        activityFile.delete();
      }
    } catch (error) {
      throw new Error("activity-file-delete-failed", { cause: error });
    }
  }

  for (const streamArtifactPath of artifact.streamArtifactPaths) {
    try {
      const directory = new Directory(streamArtifactPath);
      if (directory.exists) {
        directory.delete();
      }
    } catch (error) {
      throw new Error("stream-directory-delete-failed", { cause: error });
    }
  }
}

/**
 * The caller supplies the durable acceptance transition (a completed exact operation).
 * Evidence shared by any non-complete queue row is never collected.
 */
export async function garbageCollectAcceptedQueueEvidence(
  job: ActivitySubmissionQueueJob,
): Promise<boolean> {
  if (job.status !== "complete" || !job.activityId) return false;
  // The SQLite tombstone/delete is the durable acceptance boundary.  File
  // deletion is intentionally after it and remains retryable if the OS fails.
  if (!(await tombstoneAcceptedRecordingEvidence(job))) return false;
  const sessionId = job.sessionId ?? job.draft.recordingSessionId ?? job.artifactId;
  try {
    await deleteFinalizedArtifactFiles({
      activityFilePath: job.localActivityFilePath,
      streamArtifactPaths: job.streamArtifactPaths,
    } as RecordingSessionArtifact);
    await completeAcceptedRecordingEvidenceCleanup(sessionId);
  } catch (error) {
    const category =
      error instanceof Error && /stream-directory/.test(error.message)
        ? "stream-directory-delete-failed"
        : "activity-file-delete-failed";
    await retryAcceptedRecordingEvidenceCleanup(sessionId, category);
  }
  return true;
}

/** Executes due accepted cleanup effects. Failed deletion remains accepted and is
 * retried from SQLite; raw evidence is released only after success. */
export async function garbageCollectDueAcceptedQueueEvidence(now = Date.now()): Promise<number> {
  const due = await loadDueAcceptedRecordingEvidenceCleanups(now);
  let cleaned = 0;
  for (const item of due) {
    try {
      await deleteFinalizedArtifactFiles({
        activityFilePath: item.activityFilePath,
        streamArtifactPaths: item.streamArtifactPaths,
      } as RecordingSessionArtifact);
      await completeAcceptedRecordingEvidenceCleanup(item.sessionId);
      cleaned += 1;
    } catch (error) {
      const category =
        error instanceof Error && /stream-directory/.test(error.message)
          ? "stream-directory-delete-failed"
          : "activity-file-delete-failed";
      await retryAcceptedRecordingEvidenceCleanup(item.sessionId, category, now);
    }
  }
  return cleaned;
}

/** User-discarded evidence is terminal before this retryable OS effect runs. */
export async function garbageCollectDueDiscardedRecordingEvidence(
  now = Date.now(),
): Promise<number> {
  const due = await loadDueDiscardedRecordingEvidenceCleanups(now);
  let cleaned = 0;
  for (const item of due) {
    try {
      await deleteFinalizedArtifactFiles({
        activityFilePath: item.activityFilePath,
        streamArtifactPaths: item.streamArtifactPaths,
      } as RecordingSessionArtifact);
      await completeDiscardedRecordingEvidenceCleanup(item.sessionId);
      cleaned += 1;
    } catch {
      await retryDiscardedRecordingEvidenceCleanup(item.sessionId);
    }
  }
  return cleaned;
}
