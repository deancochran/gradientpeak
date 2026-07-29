import type { Context } from "../../context";
import { type DrizzleTransactionClient, getRequiredDb } from "../../db";
import {
  enqueuePlannedActivitySyncAfterCalendarMutation,
  type PlannedActivityQueueResult,
} from "../../lib/provider-sync/planned-activities";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

export async function enqueueProviderPlannedActivityJobs(
  ctx: ProtectedContext,
  input: {
    eventIds: string[];
    operation: "publish" | "unsync";
    profileId?: string;
    transaction?: DrizzleTransactionClient;
  },
): Promise<PlannedActivityQueueResult | null> {
  return enqueuePlannedActivitySyncAfterCalendarMutation({
    db: getRequiredDb(ctx),
    eventIds: input.eventIds,
    operation: input.operation,
    profileId: input.profileId ?? ctx.session.user.id,
    ...(input.transaction === undefined ? {} : { transaction: input.transaction }),
  });
}
