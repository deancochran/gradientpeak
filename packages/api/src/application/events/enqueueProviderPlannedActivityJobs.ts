import type { Context } from "../../context";
import { type DrizzleTransactionClient, getRequiredDb } from "../../db";
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
  input: {
    drainDueJobs?: boolean;
    eventIds: string[];
    operation: "publish" | "unsync";
    profileId?: string;
    transaction?: DrizzleTransactionClient;
  },
): Promise<PlannedWorkoutQueueResult | null> {
  return enqueuePlannedWorkoutSyncAfterCalendarMutation({
    db: getRequiredDb(ctx),
    ...(input.drainDueJobs === undefined ? {} : { drainDueJobs: input.drainDueJobs }),
    eventIds: input.eventIds,
    operation: input.operation,
    profileId: input.profileId ?? ctx.session.user.id,
    ...(input.transaction === undefined ? {} : { transaction: input.transaction }),
  });
}
