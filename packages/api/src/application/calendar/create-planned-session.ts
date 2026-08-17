import { type PlannedSession, plannedSessionSchema } from "@repo/core/calendar";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import {
  PlannedSessionAccessError,
  PlannedSessionIdentityConflictError,
  PlannedSessionStateConflictError,
  sourceDescription,
} from "./planned-session-errors";

export async function createPlannedSession(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  session: PlannedSession;
}) {
  const session = plannedSessionSchema.parse(input.session);
  if (session.profileId !== input.profileId) {
    throw new PlannedSessionAccessError("A planned session can be created only for its owner");
  }
  if (
    session.sessionRevision !== 1 ||
    session.lifecycle.status !== "scheduled" ||
    session.planningDate !== session.originalTargetDate
  ) {
    throw new PlannedSessionIdentityConflictError(
      "A new planned session must start at revision 1 on its original target date",
    );
  }
  if (
    !(await input.repository.activityPlanExistsForProfile({
      profileId: input.profileId,
      activityPlanId: session.prescription.activityPlanId,
    }))
  ) {
    throw new PlannedSessionAccessError(
      "The prescribed activity plan is not owned or system-provided",
    );
  }
  if (
    session.source.kind === "training_plan" &&
    !(await input.repository.trainingPlanExistsForProfile({
      profileId: input.profileId,
      trainingPlanId: session.source.trainingPlanId,
    }))
  ) {
    throw new PlannedSessionAccessError("The training plan is not owned or system-provided");
  }
  if (session.source.kind === "recurrence") {
    const series = await input.repository.getOwned({
      profileId: input.profileId,
      sessionId: session.source.seriesId,
    });
    if (!series) {
      throw new PlannedSessionAccessError("The recurrence series is not owned by this profile");
    }
  }
  if (
    session.groupEventId &&
    !(await input.repository.groupEventExistsForProfile({
      profileId: input.profileId,
      groupEventId: session.groupEventId,
    }))
  ) {
    throw new PlannedSessionAccessError("The group event is unavailable to this profile");
  }

  const result = await input.repository.createOwned({ profileId: input.profileId, session });
  switch (result.status) {
    case "created":
    case "unchanged":
      return result;
    case "identity_conflict":
      throw new PlannedSessionIdentityConflictError(
        `A different planned session already uses source ${sourceDescription(session.source)}`,
      );
    case "conflict":
      throw new PlannedSessionStateConflictError(result.reason);
  }
}
