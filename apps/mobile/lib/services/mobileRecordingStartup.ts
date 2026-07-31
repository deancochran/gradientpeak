import {
  clearRecordingCheckpoint,
  inspectRecordingCheckpoint,
  type RecordingCheckpointRecovery,
} from "./ActivityRecorder/checkpointStorage";
import {
  garbageCollectDueAcceptedQueueEvidence,
  garbageCollectDueDiscardedRecordingEvidence,
} from "./ActivityRecorder/finalizedArtifactStorage";
import {
  garbageCollectExpiredRecordingEvidence,
  hasQuarantinedRecordingEvidence,
  inspectFinalizedArtifactReferences,
  inspectRecordingEvidenceSession,
  loadFinalizedArtifactHandoffs,
  type RecordingEvidenceRecovery,
} from "./ActivityRecorder/recordingEvidenceJournal";
import {
  type ActivitySubmissionQueueJob,
  ensureFinalizedArtifactQueueHandoff,
  loadActivitySubmissionQueueJobs,
  loadDueActivitySubmissionQueueJobs,
} from "./activitySubmissionQueue";

export type MobileRecordingStartupState = {
  checkpoint: RecordingCheckpointRecovery;
  queueJobs: ActivitySubmissionQueueJob[];
  hasQuarantinedEvidence: boolean;
  evidence?: RecordingEvidenceRecovery;
  finalizedArtifactRecovery: Awaited<ReturnType<typeof inspectFinalizedArtifactReferences>>;
};

const preparations = new Map<string, Promise<MobileRecordingStartupState>>();

/** Single startup fence shared by orphan cleanup, recorder recovery, and queue drain. */
export function prepareMobileRecordingStartup(
  profileId: string,
): Promise<MobileRecordingStartupState> {
  const active = preparations.get(profileId);
  if (active) return active;
  const preparation = (async () => {
    // Accepted file deletion is a separate retryable effect. Run it before raw
    // retention so a failed OS operation cannot lose its recovery reference.
    await garbageCollectDueAcceptedQueueEvidence().catch(() => undefined);
    await garbageCollectDueDiscardedRecordingEvidence().catch(() => undefined);
    void garbageCollectExpiredRecordingEvidence().catch(() => undefined);
    let checkpoint = await inspectRecordingCheckpoint(profileId);
    const finalizedArtifactRecovery = await inspectFinalizedArtifactReferences(profileId);
    const sqliteArtifacts = await loadFinalizedArtifactHandoffs(profileId);
    for (const pendingArtifact of sqliteArtifacts) {
      if (pendingArtifact.profileId !== profileId) continue;
      const pendingRebuild = finalizedArtifactRecovery.some(
        (candidate) =>
          candidate.status !== "healthy" && candidate.sessionId === pendingArtifact.sessionId,
      );
      if (!pendingRebuild) await ensureFinalizedArtifactQueueHandoff(pendingArtifact, profileId);
    }
    const allQueueJobs = await loadActivitySubmissionQueueJobs(profileId);
    const queueJobs = await loadDueActivitySubmissionQueueJobs(profileId);
    const checkpointSessionId =
      checkpoint.status === "recovered" ? checkpoint.checkpoint.sessionId : null;
    const checkpointRebuildPending = finalizedArtifactRecovery.some(
      (candidate) => candidate.sessionId === checkpointSessionId && candidate.status !== "healthy",
    );
    if (
      checkpointSessionId &&
      !checkpointRebuildPending &&
      allQueueJobs.some(
        (job) =>
          job.sessionId === checkpointSessionId &&
          (!job.draft || job.draft.profileId === profileId),
      )
    ) {
      await clearRecordingCheckpoint(checkpointSessionId);
      checkpoint = { status: "none" };
    }
    const evidenceSessionId =
      checkpoint.status === "recovered" ? checkpoint.checkpoint.sessionId : null;
    const evidence = evidenceSessionId
      ? await inspectRecordingEvidenceSession(evidenceSessionId, profileId)
      : undefined;
    return {
      checkpoint,
      queueJobs,
      hasQuarantinedEvidence: await hasQuarantinedRecordingEvidence(),
      ...(evidence === undefined ? {} : { evidence }),
      finalizedArtifactRecovery,
    };
  })().catch((error) => {
    preparations.delete(profileId);
    throw error;
  });
  preparations.set(profileId, preparation);
  return preparation;
}

export function resetMobileRecordingStartupForTests(): void {
  preparations.clear();
}
