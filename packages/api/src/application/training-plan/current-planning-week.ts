import { addDaysDateOnlyUtc } from "@repo/core";
import { getScheduledDateKey, scheduledDateTimeToIsoInstant } from "@repo/core/utils/schedule-date";

export type PlanningDateRange = {
  endDate: string;
  endExclusiveInstant: Date;
  startDate: string;
  startInstant: Date;
  timezone: string;
};

/** Converts inclusive planning-calendar dates to their profile-local instant bounds. */
export function getPlanningDateRange(input: {
  endDate: string;
  startDate: string;
  timezone: string;
}): PlanningDateRange {
  return {
    ...input,
    startInstant: new Date(
      scheduledDateTimeToIsoInstant({
        scheduledDate: input.startDate,
        time: "00:00",
        timeZone: input.timezone,
      }),
    ),
    endExclusiveInstant: new Date(
      scheduledDateTimeToIsoInstant({
        scheduledDate: addDaysDateOnlyUtc(input.endDate, 1),
        time: "00:00",
        timeZone: input.timezone,
      }),
    ),
  };
}

/** Server-owned Sunday-Saturday bounds in the athlete's planning calendar. */
export function getCurrentPlanningWeek(instant: Date, timezone: string): PlanningDateRange {
  const currentDate = getScheduledDateKey(instant.toISOString(), timezone);
  const weekday = new Date(`${currentDate}T00:00:00.000Z`).getUTCDay();
  const startDate = addDaysDateOnlyUtc(currentDate, -weekday);
  return getPlanningDateRange({
    startDate,
    endDate: addDaysDateOnlyUtc(startDate, 6),
    timezone,
  });
}
