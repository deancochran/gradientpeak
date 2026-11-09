import type { Context } from "../../context";
import type { DrizzleTransactionClient } from "../../db";
import type { WahooPlannedActivityQueueResult } from "../../lib/provider-sync/planned-activities";

type ProtectedContext = Context & {
  session: NonNullable<Context["session"]> & {
    user: NonNullable<NonNullable<Context["session"]>["user"]>;
  };
};

export async function enqueueWahooPlannedActivityJobs(
  ctx: ProtectedContext,
  input: {
    eventIds: string[];
    operation: "publish" | "unsync";
    profileId?: string;
    transaction?: DrizzleTransactionClient;
  },
): Promise<WahooPlannedActivityQueueResult | null> {
  // Executable activities are planned sessions. Generic events never enter the Wahoo queue.
  void ctx;
  void input;
  return null;
}
