import { z } from "zod";

const uuid = z.string().uuid();
const returnToValues = ["athlete-workspace"] as const;

export type ActivityPlanPreparationContext = {
  athleteId: string;
  calendarStartDate?: string;
  organizationId: string;
  planningDate: string;
  returnTo: (typeof returnToValues)[number];
};

export type ActivityPlanPreparationSearch = ActivityPlanPreparationContext & {
  activityPlanId?: string;
};

export type AthleteWorkspaceSearch = {
  activityPlanId?: string;
  athleteId?: string;
  calendarStartDate?: string;
  organizationId?: string;
  planningDate?: string;
  returnTo?: (typeof returnToValues)[number];
};

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * URL context only preserves a coach's navigation intent. It is never an
 * authorization assertion; the athlete workspace and publication APIs remain
 * responsible for access checks.
 */
export function parseActivityPlanPreparationContext(
  search: Record<string, unknown>,
): ActivityPlanPreparationContext | null {
  const organizationId = uuid.safeParse(search.organizationId);
  const athleteId = uuid.safeParse(search.athleteId);
  const calendarStartDate =
    typeof search.calendarStartDate === "string" && isRealDate(search.calendarStartDate)
      ? search.calendarStartDate
      : undefined;
  const planningDate = typeof search.planningDate === "string" ? search.planningDate : null;
  const returnTo = search.returnTo;
  if (
    !organizationId.success ||
    !athleteId.success ||
    !planningDate ||
    !isRealDate(planningDate) ||
    returnTo !== "athlete-workspace"
  )
    return null;
  return {
    athleteId: athleteId.data,
    ...(calendarStartDate ? { calendarStartDate } : {}),
    organizationId: organizationId.data,
    planningDate,
    returnTo,
  };
}

export function parseActivityPlanPreparationSearch(
  search: Record<string, unknown>,
): ActivityPlanPreparationSearch | null {
  const context = parseActivityPlanPreparationContext(search);
  if (!context) return null;
  const activityPlanId = uuid.safeParse(search.activityPlanId);
  return activityPlanId.success ? { ...context, activityPlanId: activityPlanId.data } : context;
}

/** Validates the route-owned context without treating an incomplete form draft as a return flow. */
export function parseAthleteWorkspaceSearch(
  search: Record<string, unknown>,
): AthleteWorkspaceSearch {
  const calendarStartDate =
    typeof search.calendarStartDate === "string" && isRealDate(search.calendarStartDate)
      ? search.calendarStartDate
      : undefined;
  const preparation = parseActivityPlanPreparationSearch(search);
  return {
    ...(calendarStartDate ? { calendarStartDate } : {}),
    ...(preparation ?? {}),
  };
}

export function activityPlanPreparationSearch(
  context: ActivityPlanPreparationContext,
  activityPlanId?: string,
): ActivityPlanPreparationSearch {
  return { ...context, ...(activityPlanId ? { activityPlanId } : {}) };
}

export function preparationMatchesWorkspace(
  context: ActivityPlanPreparationContext | null,
  organizationId: string,
  athleteId: string,
) {
  return context?.organizationId === organizationId && context.athleteId === athleteId;
}
