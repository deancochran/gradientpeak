import { toDateKeyInTimeZone, toPlanningDayStartIso } from "@/lib/calendar/dateMath";
import { addDays } from "./trainingPathUtils";

const MINUTE_MS = 60_000;

export function getTrainingPathTodayKey(
  now: Date,
  planningTimezone: string | null | undefined,
): string | null {
  if (!planningTimezone?.trim()) return null;

  try {
    return toDateKeyInTimeZone(now, planningTimezone);
  } catch {
    return null;
  }
}

export function getTrainingPathPlanningDayRange(
  dateKey: string,
  planningTimezone: string | null | undefined,
) {
  if (!planningTimezone?.trim()) return null;

  try {
    return {
      startsAfter: toPlanningDayStartIso(dateKey, planningTimezone),
      startsBefore: toPlanningDayStartIso(addDays(dateKey, 1), planningTimezone),
    };
  } catch {
    // A planning zone with no unambiguous midnight cannot safely define this day.
    return null;
  }
}

export function getTrainingPathDateKey(
  instant: string | Date | null | undefined,
  planningTimezone: string | null | undefined,
): string | null {
  if (!instant || !planningTimezone?.trim()) return null;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return toDateKeyInTimeZone(date, planningTimezone);
  } catch {
    return null;
  }
}

export function millisecondsUntilNextTrainingPathDay(
  now: Date,
  planningTimezone: string | null | undefined,
): number | null {
  const todayKey = getTrainingPathTodayKey(now, planningTimezone);
  if (!todayKey) return null;
  const todayRange = getTrainingPathPlanningDayRange(todayKey, planningTimezone);
  if (!todayRange) return null;
  const nextDayStart = new Date(todayRange.startsBefore);
  if (Number.isNaN(nextDayStart.getTime())) return null;
  return Math.max(MINUTE_MS, nextDayStart.getTime() - now.getTime());
}
