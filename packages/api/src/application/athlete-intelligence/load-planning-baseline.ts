import type { PlanningBaseline } from "@repo/core/plan";
import type { DrizzleQueryExecutor } from "../../db";
import { readAthleteReadModel } from "./athlete-read-model";

/** Loads one published planning context, deliberately degrading to no_context. */
export async function loadPlanningBaseline(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  now: Date;
}): Promise<PlanningBaseline> {
  const model = await readAthleteReadModel({
    db: input.db,
    profileId: input.profileId,
    now: input.now,
    sections: { status: true, currentBaseline: { includePlanningContext: true } },
  });
  if (
    model.status?.freshness === "fresh" &&
    model.publishedRevision !== null &&
    model.currentBaseline?.planningContext
  ) {
    return {
      status: "available",
      context: model.currentBaseline.planningContext,
      revision: model.publishedRevision,
    };
  }
  return { status: "no_context", as_of: input.now.toISOString() };
}
