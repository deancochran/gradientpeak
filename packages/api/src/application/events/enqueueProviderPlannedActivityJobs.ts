import type { Context } from "../../context";
import { getRequiredDb } from "../../db";
import {
  enqueuePlannedWorkoutSyncAfterCalendarMutation,
  type PlannedWorkoutQueueResult,
} from "../../lib/provider-sync/planned-workouts";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

export async function enqueueProviderPlannedActivityJobs(
  ctx: ProtectedContext,
  input: { eventIds: string[]; operation: "publish" | "unsync"; profileId?: string },
): Promise<PlannedWorkoutQueueResult | null> {
  return enqueuePlannedWorkoutSyncAfterCalendarMutation({
    db: getRequiredDb(ctx),
    eventIds: input.eventIds,
    operation: input.operation,
    profileId: input.profileId ?? ctx.session.user.id,
  });
}
