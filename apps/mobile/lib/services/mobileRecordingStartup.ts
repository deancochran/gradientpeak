import {
  type ActivityRecorderCheckpoint,
  clearRecordingCheckpoint,
  hasQuarantinedRecordingEvidence,
  inspectRecordingCheckpoint,
  type RecordingCheckpointRecovery,
} from "./ActivityRecorder/checkpointStorage";
import {
  garbageCollectDueAcceptedQueueEvidence,
  garbageCollectDueDiscardedRecordingEvidence,
} from "./ActivityRecorder/finalizedArtifactStorage";
import {
  blockFinalizedArtifactRebuild,
  garbageCollectExpiredRecordingEvidence,
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
type FinalizationRecoveryOwner = (
  checkpoint: ActivityRecorderCheckpoint | import("@repo/core").RecordingCheckpoint,
) => Promise<void>;
const finalizationRecoveryOwners = new Map<string, FinalizationRecoveryOwner>();
const finalizationRebuilds = new Map<string, Promise<void>>();

/** Registered by the single recorder instance for this profile. */
export function registerFinalizationRecoveryOwner(
  profileId: string,
  owner: FinalizationRecoveryOwner,
): () => void {
  finalizationRecoveryOwners.set(profileId, owner);
  return () => {
    if (finalizationRecoveryOwners.get(profileId) === owner)
      finalizationRecoveryOwners.delete(profileId);
  };
}

async function scheduleFinalizationRebuild(
  profileId: string,
  checkpoint: ActivityRecorderCheckpoint | import("@repo/core").RecordingCheckpoint,
): Promise<void> {
  const key = `${profileId}:${checkpoint.sessionId}`;
  const active = finalizationRebuilds.get(key);
  if (active) return active;
  const owner = finalizationRecoveryOwners.get(profileId);
  if (!owner) {
    await blockFinalizedArtifactRebuild(
      checkpoint.sessionId,
      "finalization-recovery-owner-unavailable",
    );
    return;
  }
  const rebuild = owner(checkpoint).catch(async (error) => {
    await blockFinalizedArtifactRebuild(
      checkpoint.sessionId,
      error instanceof Error ? error.message : "finalization-rebuild-failed",
    );
  });
  finalizationRebuilds.set(key, rebuild);
  return rebuild;
}

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
    for (const candidate of finalizedArtifactRecovery) {
      if (candidate.status !== "rebuild-pending") continue;
      if (
        checkpoint.status !== "recovered" ||
        checkpoint.checkpoint.sessionId !== candidate.sessionId
      ) {
        await blockFinalizedArtifactRebuild(candidate.sessionId, "required-checkpoint-unavailable");
        continue;
      }
      await scheduleFinalizationRebuild(profileId, checkpoint.checkpoint);
    }
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
  finalizationRecoveryOwners.clear();
  finalizationRebuilds.clear();
}
