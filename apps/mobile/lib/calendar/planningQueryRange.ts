import { ianaTimezoneSchema } from "@repo/core";
import { addDaysToDateKey, isCanonicalDateKey, toPlanningDayStartIso } from "./dateMath";

export type PlanningQueryUnavailableReason =
  | "date_unavailable"
  | "invalid_date_range"
  | "planning_day_boundary_unavailable"
  | "timezone_unavailable";

export type PlanningQueryReadiness<T> =
  | { status: "ready"; value: T }
  | { status: "unavailable"; reason: PlanningQueryUnavailableReason };

export type PlanningDayQueryRange = {
  dateKey: string;
  endsAtInclusive: string;
  startsAfter: string;
  startsBefore: string;
  timezone: string;
};

export type BoundedPlanningDateRange = {
  endDate: string;
  startDate: string;
  timezone: string;
};

function resolveTimezone(timezone: string | null | undefined) {
  const parsed = ianaTimezoneSchema.safeParse(timezone);
  return parsed.success ? parsed.data : null;
}

export function resolvePlanningDayQueryRange(input: {
  dateKey: string | null | undefined;
  timezone: string | null | undefined;
}): PlanningQueryReadiness<PlanningDayQueryRange> {
  const timezone = resolveTimezone(input.timezone);
  if (!timezone) return { status: "unavailable", reason: "timezone_unavailable" };
  if (!input.dateKey || !isCanonicalDateKey(input.dateKey)) {
    return { status: "unavailable", reason: "date_unavailable" };
  }

  try {
    const startsAfter = toPlanningDayStartIso(input.dateKey, timezone);
    const startsBefore = toPlanningDayStartIso(addDaysToDateKey(input.dateKey, 1), timezone);
    if (startsBefore <= startsAfter) {
      return { status: "unavailable", reason: "planning_day_boundary_unavailable" };
    }
    return {
      status: "ready",
      value: {
        dateKey: input.dateKey,
        endsAtInclusive: new Date(Date.parse(startsBefore) - 1).toISOString(),
        startsAfter,
        startsBefore,
        timezone,
      },
    };
  } catch {
    return { status: "unavailable", reason: "planning_day_boundary_unavailable" };
  }
}

export function resolveBoundedPlanningDateRange(input: {
  endDate: string | null | undefined;
  maxInclusiveDays: number;
  startDate: string | null | undefined;
  timezone: string | null | undefined;
}): PlanningQueryReadiness<BoundedPlanningDateRange> {
  const timezone = resolveTimezone(input.timezone);
  if (!timezone) return { status: "unavailable", reason: "timezone_unavailable" };
  if (
    !input.startDate ||
    !input.endDate ||
    !isCanonicalDateKey(input.startDate) ||
    !isCanonicalDateKey(input.endDate)
  ) {
    return { status: "unavailable", reason: "date_unavailable" };
  }
  if (
    !Number.isInteger(input.maxInclusiveDays) ||
    input.maxInclusiveDays < 1 ||
    input.startDate > input.endDate
  ) {
    return { status: "unavailable", reason: "invalid_date_range" };
  }

  const earliestDate = addDaysToDateKey(input.endDate, -(input.maxInclusiveDays - 1));
  return {
    status: "ready",
    value: {
      startDate: input.startDate > earliestDate ? input.startDate : earliestDate,
      endDate: input.endDate,
      timezone,
    },
  };
}
