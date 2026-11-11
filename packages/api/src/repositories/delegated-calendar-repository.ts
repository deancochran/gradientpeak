import { canonicalActivityCategorySchema } from "@repo/core/schemas";
import { activityPlans, plannedSessions } from "@repo/db";
import { and, asc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import type { DelegatedCalendarRangeRequest } from "../contracts/delegated-calendar";
import type { DrizzleQueryExecutor } from "../db";

export type DelegatedCalendarRepository = {
  listScopedRange(input: DelegatedCalendarRangeRequest): Promise<{
    items: Array<{
      activityCategory: "run" | "bike" | "swim" | "strength" | "other";
      activityPlanId: string;
      eventId: string;
      planningDate: string;
      status: "scheduled" | "completed" | "cancelled";
    }>;
    truncated: boolean;
  }>;
};

/**
 * Calendar consent exposes only planned-session scheduling facts. Personal
 * `events` are deliberately excluded: their title, notes, description, route,
 * recurrence, and linked activity are not in the calendar scope projection.
 */
export function createDelegatedCalendarRepository(
  db: DrizzleQueryExecutor,
): DelegatedCalendarRepository {
  return {
    async listScopedRange(input) {
      const cursorPredicate = input.cursor
        ? or(
            gt(plannedSessions.planning_date, input.cursor.planningDate),
            and(
              eq(plannedSessions.planning_date, input.cursor.planningDate),
              gt(plannedSessions.id, input.cursor.eventId),
            ),
          )
        : undefined;
      const rows = await db
        .select({
          activityPlanId: plannedSessions.activity_plan_id,
          eventId: plannedSessions.id,
          planningDate: plannedSessions.planning_date,
          status: plannedSessions.status,
          activityCategory: sql<string>`${activityPlans.structure}->>'activity_category'`,
        })
        .from(plannedSessions)
        .innerJoin(activityPlans, eq(activityPlans.id, plannedSessions.activity_plan_id))
        .where(
          and(
            eq(plannedSessions.profile_id, input.athleteProfileId),
            gte(plannedSessions.planning_date, input.startDate),
            lt(plannedSessions.planning_date, input.endDateExclusive),
            cursorPredicate,
          ),
        )
        .orderBy(asc(plannedSessions.planning_date), asc(plannedSessions.id))
        .limit(input.limit + 1);
      return {
        items: rows.slice(0, input.limit).map((row) => ({
          activityCategory: canonicalActivityCategorySchema.parse(row.activityCategory),
          activityPlanId: row.activityPlanId,
          eventId: row.eventId,
          planningDate: row.planningDate,
          status: row.status,
        })),
        truncated: rows.length > input.limit,
      };
    },
  };
}
