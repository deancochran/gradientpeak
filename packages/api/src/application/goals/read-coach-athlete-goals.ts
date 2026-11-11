import {
  formatDateOnlyInTimeZone,
  getProfileGoalLifecycleStatus,
  ianaTimezoneSchema,
  type ProfileGoal,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import { profileGoals, profiles } from "@repo/db";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { CoachAthleteGoalsResponse } from "../../contracts/coach-athlete-goals";
import type { DrizzleTransactionClient } from "../../db";
import { withAuthorizedAthleteRead } from "../organizations/authorize-athlete-read";

type GoalCursor = Exclude<CoachAthleteGoalsResponse["nextCursor"], null>;
type GoalRow = {
  id: string;
  profile_id: string;
  target_date: string;
  title: string;
  priority: number;
  activity_category: string;
  created_at_key: string;
};

type ReadCoachAthleteGoalsDependencies = {
  authorize: typeof withAuthorizedAthleteRead;
  list: (input: {
    transaction: DrizzleTransactionClient;
    athleteProfileId: string;
    limit: number;
    cursor: GoalCursor | null;
  }) => Promise<GoalRow[]>;
  getPlanningTimezone: (input: {
    transaction: DrizzleTransactionClient;
    athleteProfileId: string;
  }) => Promise<string>;
};

function parseCursor(cursor: GoalCursor) {
  const separator = cursor.lastIndexOf("|");
  return { createdAt: cursor.slice(0, separator), id: cursor.slice(separator + 1) };
}

async function listGoals(input: {
  transaction: DrizzleTransactionClient;
  athleteProfileId: string;
  limit: number;
  cursor: GoalCursor | null;
}): Promise<GoalRow[]> {
  const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;
  const cursorCondition = parsedCursor
    ? or(
        lt(profileGoals.created_at, sql`${parsedCursor.createdAt}::timestamptz`),
        and(
          eq(profileGoals.created_at, sql`${parsedCursor.createdAt}::timestamptz`),
          lt(profileGoals.id, parsedCursor.id),
        ),
      )
    : undefined;
  return input.transaction
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      created_at_key: sql<string>`to_char(${profileGoals.created_at} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(profileGoals)
    .where(and(eq(profileGoals.profile_id, input.athleteProfileId), cursorCondition))
    .orderBy(desc(profileGoals.created_at), desc(profileGoals.id))
    .limit(input.limit + 1);
}

async function getPlanningTimezone(input: {
  transaction: DrizzleTransactionClient;
  athleteProfileId: string;
}): Promise<string> {
  const [profile] = await input.transaction
    .select({ planningTimezone: profiles.planning_timezone })
    .from(profiles)
    .where(eq(profiles.id, input.athleteProfileId))
    .limit(1);
  return ianaTimezoneSchema.parse(profile?.planningTimezone);
}

const defaultDependencies: ReadCoachAthleteGoalsDependencies = {
  authorize: withAuthorizedAthleteRead,
  list: listGoals,
  getPlanningTimezone,
};

/**
 * Selected-workspace goal headers only. Consent authorization and the allowlisted
 * projection share one repeatable-read transaction; this deliberately has no
 * owner or cross-organization fallback.
 */
export async function readCoachAthleteGoals(
  input: {
    db: DrizzleDbClient;
    actorProfileId: string;
    organizationId: string;
    athleteProfileId: string;
    limit: number;
    cursor: GoalCursor | null;
    now: Date;
  },
  dependencies: Partial<ReadCoachAthleteGoalsDependencies> = {},
): Promise<CoachAthleteGoalsResponse | null> {
  const services = { ...defaultDependencies, ...dependencies };
  const result = await services.authorize({
    db: input.db,
    actorProfileId: input.actorProfileId,
    organizationId: input.organizationId,
    athleteProfileId: input.athleteProfileId,
    scope: "goals",
    read: async (transaction) => {
      const rows = await services.list({
        transaction,
        athleteProfileId: input.athleteProfileId,
        limit: input.limit,
        cursor: input.cursor,
      });
      const planningTimezone = await services.getPlanningTimezone({
        transaction,
        athleteProfileId: input.athleteProfileId,
      });
      const todayDate = formatDateOnlyInTimeZone(input.now, planningTimezone);
      const page = rows.slice(0, input.limit);
      const hasMore = rows.length > input.limit;
      const last = page.at(-1);
      return {
        items: page.map((row) => {
          // The existing lifecycle contract reads only target_date. Keep the
          // persistence projection header-only; objective payload is never read.
          const goalHeader = { target_date: row.target_date } as ProfileGoal;
          return {
            id: row.id,
            name: row.title,
            targetDate: row.target_date,
            category: row.activity_category as "bike" | "run" | "swim" | "strength" | "other",
            priority: row.priority,
            status: getProfileGoalLifecycleStatus({
              goal: goalHeader,
              todayDate,
            }).status,
          };
        }),
        nextCursor: hasMore && last ? `${last.created_at_key}|${last.id}` : null,
      };
    },
  });
  return "value" in result ? result.value : null;
}
