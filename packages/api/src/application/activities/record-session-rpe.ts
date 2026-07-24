import type { getRequiredDb } from "../../db";
import {
  type ActivitySessionRpeEvidenceProjection,
  findOwnedCompletedActivity,
  findOwnedEffectiveSessionRpeEvidence,
  findOwnedSessionRpeEvidenceByOperation,
  insertSessionRpeEvidence,
  lockSessionRpeActivity,
} from "../../repositories/activity-session-rpe-repository";

type DbClient = ReturnType<typeof getRequiredDb>;

export class SessionRpeEvidenceNotFoundError extends Error {
  constructor(message = "Completed activity or correction evidence was not found") {
    super(message);
    this.name = "SessionRpeEvidenceNotFoundError";
  }
}

export class SessionRpeEvidenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionRpeEvidenceConflictError";
  }
}

export type RecordSessionRpeInput = {
  activityId: string;
  correctionOfId?: string;
  operationId: string;
  profileId: string;
  rpe: number;
  scale: "borg_cr10";
  scaleVersion: "1";
  source: "user" | "manual";
};

function matchesOperation(
  evidence: ActivitySessionRpeEvidenceProjection,
  input: RecordSessionRpeInput,
) {
  return (
    evidence.activityId === input.activityId &&
    evidence.rpe === input.rpe &&
    evidence.scale === input.scale &&
    evidence.scaleVersion === input.scaleVersion &&
    evidence.source === input.source &&
    evidence.correctionOfId === (input.correctionOfId ?? null)
  );
}

/**
 * Appends user-entered completed-session RPE evidence. It never updates source
 * rows; a correction is a manual replacement linked to the prior observation.
 */
export async function recordSessionRpe(
  db: DbClient,
  input: RecordSessionRpeInput,
): Promise<ActivitySessionRpeEvidenceProjection> {
  return db.transaction(async (tx) => {
    // Check replay before any other business validation so retrying a completed
    // operation is stable even if the activity is no longer otherwise writable.
    const replay = await findOwnedSessionRpeEvidenceByOperation(tx, input);
    if (replay) {
      if (matchesOperation(replay, input)) return replay;
      throw new SessionRpeEvidenceConflictError(
        "Session-RPE operation ID was already used with different evidence",
      );
    }
    if (input.correctionOfId && input.source !== "manual") {
      throw new SessionRpeEvidenceConflictError("Corrections must be recorded as manual evidence");
    }

    await lockSessionRpeActivity(tx, input);
    // A concurrent operation can commit while this one waits for the activity
    // lock; repeat the idempotency check under that serialization boundary.
    const lockedReplay = await findOwnedSessionRpeEvidenceByOperation(tx, input);
    if (lockedReplay) {
      if (matchesOperation(lockedReplay, input)) return lockedReplay;
      throw new SessionRpeEvidenceConflictError(
        "Session-RPE operation ID was already used with different evidence",
      );
    }

    const activity = await findOwnedCompletedActivity(tx, { ...input, now: new Date() });
    if (!activity) throw new SessionRpeEvidenceNotFoundError();

    const effective = await findOwnedEffectiveSessionRpeEvidence(tx, {
      activityId: input.activityId,
      profileId: input.profileId,
    });
    if (input.correctionOfId) {
      if (!effective || effective.id !== input.correctionOfId) {
        throw new SessionRpeEvidenceConflictError(
          "Corrections must replace the current effective Session-RPE evidence",
        );
      }
    } else if (effective) {
      throw new SessionRpeEvidenceConflictError(
        "Session-RPE evidence already exists; submit a correction for the effective evidence",
      );
    }

    const now = new Date();
    return insertSessionRpeEvidence(tx, {
      profile_id: input.profileId,
      activity_id: input.activityId,
      // User/manual observations receive their observation instant at this
      // trusted server boundary. Provider observations are not accepted here.
      recorded_at: now,
      corrected_at: input.correctionOfId ? now : null,
      rpe: input.rpe,
      scale: input.scale,
      scale_version: input.scaleVersion,
      source: input.source,
      operation_id: input.operationId,
      correction_of_id: input.correctionOfId ?? null,
      provenance: {
        observation_type: "completed_session_rpe",
        entered_by: "athlete",
        operation_id: input.operationId,
        correction_of_id: input.correctionOfId ?? null,
      },
    });
  });
}
