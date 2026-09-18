import type { SessionDemand } from "@repo/core/plan";
import { createPlannedSessionDtoRequestSchema } from "./contracts/planned-sessions";

export function isPlannedSessionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "CONFLICT"
  );
}

/** Builds the safe request used to create a server-owned prescription snapshot. */
export function buildDirectPlannedSessionCreateInput(input: {
  profileId: string;
  planningDate: string;
  operationId: string;
  activityPlanId: string;
  demand?: SessionDemand;
  groupEventId?: string | null;
}) {
  return createPlannedSessionDtoRequestSchema.parse({
    profileId: input.profileId,
    session: {
      planningDate: input.planningDate,
      source: { kind: "direct", operationId: input.operationId },
      activityPlanId: input.activityPlanId,
      ...(input.demand ? { demand: input.demand } : {}),
      groupEventId: input.groupEventId,
    },
  });
}
