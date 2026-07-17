import {
  clearRecordingCheckpoint,
  hasQuarantinedRecordingEvidence,
  inspectRecordingCheckpoint,
  type RecordingCheckpointRecovery,
} from "./ActivityRecorder/checkpointStorage";
import { loadPendingFinalizedArtifact } from "./ActivityRecorder/finalizedArtifactStorage";
import {
  type ActivitySubmissionQueueJob,
  ensureFinalizedArtifactQueueHandoff,
  loadActivitySubmissionQueueJobs,
} from "./activitySubmissionQueue";
import { migrateSingleSportLocalStateToV3Once } from "./activitySubmissionQueue/migration-only-v3";

export type MobileRecordingStartupState = {
  checkpoint: RecordingCheckpointRecovery;
  queueJobs: ActivitySubmissionQueueJob[];
  hasQuarantinedEvidence: boolean;
};

const preparations = new Map<string, Promise<MobileRecordingStartupState>>();

/** Single startup fence shared by orphan cleanup, recorder recovery, and queue drain. */
export function prepareMobileRecordingStartup(
  profileId: string,
): Promise<MobileRecordingStartupState> {
  const active = preparations.get(profileId);
  if (active) return active;
  const preparation = (async () => {
    await migrateSingleSportLocalStateToV3Once();
    const pendingArtifact = await loadPendingFinalizedArtifact();
    if (pendingArtifact?.profileId === profileId) {
      await ensureFinalizedArtifactQueueHandoff(pendingArtifact, profileId);
    }
    const queueJobs = await loadActivitySubmissionQueueJobs(profileId);
    let checkpoint = await inspectRecordingCheckpoint(profileId);
    const checkpointSessionId =
      checkpoint.status === "recovered" ? checkpoint.checkpoint.sessionId : null;
    if (checkpointSessionId && queueJobs.some((job) => job.sessionId === checkpointSessionId)) {
      await clearRecordingCheckpoint(checkpointSessionId);
      checkpoint = { status: "none" };
    }
    return {
      checkpoint,
      queueJobs,
      hasQuarantinedEvidence: await hasQuarantinedRecordingEvidence(),
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
