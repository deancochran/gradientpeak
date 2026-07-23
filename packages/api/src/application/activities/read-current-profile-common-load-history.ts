import { type CommonLoadHistoryResult, commonLoadHistoryResultSchema } from "@repo/core/load";
import { getScheduledDateKey } from "@repo/core/utils/schedule-date";
import { profiles } from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { getCommonLoadHistory } from "./common-load-history";

type Db = ReturnType<typeof getRequiredDb>;

export interface CurrentProfileCommonLoadHistory {
  computedAt: string;
  planningTimezone: string | null;
  currentPlanningDate: string | null;
  result: CommonLoadHistoryResult;
}

function missingPlanningTimezoneResult(): CommonLoadHistoryResult {
  return commonLoadHistoryResultSchema.parse({
    status: "unavailable",
    policyVersion: "common_load_history_v1",
    reason: "invalid_input",
    context: {
      path: "planningTimezone",
      message: "A profile planning timezone is required for common Load history",
    },
  });
}

export async function readCurrentProfileCommonLoadHistory(input: {
  db: Db;
  profileId: string;
  now?: Date;
}): Promise<CurrentProfileCommonLoadHistory> {
  const computedAt = (input.now ?? new Date()).toISOString();
  const [profile] = await input.db
    .select({ planningTimezone: profiles.planning_timezone })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);
  const planningTimezone = profile?.planningTimezone?.trim() || null;
  if (planningTimezone === null) {
    return {
      computedAt,
      planningTimezone: null,
      currentPlanningDate: null,
      result: missingPlanningTimezoneResult(),
    };
  }
  const currentPlanningDate = getScheduledDateKey(computedAt, planningTimezone);
  return {
    computedAt,
    planningTimezone,
    currentPlanningDate,
    result: await getCommonLoadHistory({
      db: input.db,
      profileId: input.profileId,
      currentPlanningDate,
      planningTimezone,
    }),
  };
}
