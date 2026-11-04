import { type PlannedSession, plannedSessionActivityPlanId } from "@repo/core/calendar";
import type {
  ActivityPlanPrescriptionSource,
  PlannedSessionRepositoryPort,
} from "../../repositories/planned-session-repository-port";

/**
 * Resolves the mutable authority for a planned session.  The persisted
 * resolution manifest is intentionally not used as a substitute for current
 * plan content or athlete context; it remains provenance for compatibility
 * and later execution capture.
 */
export async function resolveCurrentPlannedSessionPlan(input: {
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  session: PlannedSession;
}): Promise<ActivityPlanPrescriptionSource | null> {
  if (input.session.profileId !== input.profileId) return null;
  return input.repository.getActivityPlanPrescriptionSource({
    profileId: input.profileId,
    activityPlanId: plannedSessionActivityPlanId(input.session),
  });
}
