import type { DrizzleDbClient } from "@repo/db/client";
import {
  listPlannedSessionCompletionCandidates,
  type PlannedSessionCompletionCandidate,
  type PlannedSessionCompletionCandidateCursor,
  readActiveManualCompletionActivityId,
} from "../../repositories/planned-session-completion-candidate-repository";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { getCurrentAthletePlanningDate } from "../training-plan/appliedScheduleUseCases";
import { PlannedSessionNotFoundError } from "./planned-session-errors";

export type PlannedSessionCompletionCandidatesResult = {
  canAssociate: boolean;
  reason: "scheduled_in_future" | "manual_completion_unavailable" | null;
  currentActivityId: string | null;
  items: PlannedSessionCompletionCandidate[];
  nextCursor: PlannedSessionCompletionCandidateCursor | null;
};

/** Determines whether a planned session can replace its manual completion with a trusted activity. */
export async function readPlannedSessionCompletionCandidates(input: {
  db: DrizzleDbClient;
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  limit: number;
  cursor?: PlannedSessionCompletionCandidateCursor;
}): Promise<PlannedSessionCompletionCandidatesResult> {
  const session = await input.repository.getOwned({
    profileId: input.profileId,
    sessionId: input.sessionId,
  });
  if (!session) throw new PlannedSessionNotFoundError();

  let currentActivityId: string | null = null;
  if (session.lifecycle.status === "scheduled") {
    const today = await getCurrentAthletePlanningDate({ db: input.db, profileId: input.profileId });
    if (session.planningDate > today) {
      return {
        canAssociate: false,
        reason: "scheduled_in_future",
        currentActivityId,
        items: [],
        nextCursor: null,
      };
    }
  } else if (
    session.lifecycle.status === "completed" &&
    session.lifecycle.completion.state === "linked"
  ) {
    currentActivityId = await readActiveManualCompletionActivityId(input.db, {
      profileId: input.profileId,
      activityId: session.lifecycle.completion.activityId,
    });
    if (!currentActivityId) {
      return {
        canAssociate: false,
        reason: "manual_completion_unavailable",
        currentActivityId: null,
        items: [],
        nextCursor: null,
      };
    }
  } else {
    return {
      canAssociate: false,
      reason: "manual_completion_unavailable",
      currentActivityId: null,
      items: [],
      nextCursor: null,
    };
  }

  const activityCategory =
    session.prescription.resolutionManifest.resolved_structure.activity_category;
  const page = await listPlannedSessionCompletionCandidates(input.db, {
    profileId: input.profileId,
    sessionId: input.sessionId,
    activityCategory,
    limit: input.limit,
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
  return { canAssociate: true, reason: null, currentActivityId, ...page };
}
