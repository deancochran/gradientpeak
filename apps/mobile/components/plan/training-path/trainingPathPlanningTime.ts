import { toDateKeyInTimeZone } from "@/lib/calendar/dateMath";
import { resolvePlanningDayQueryRange } from "@/lib/calendar/planningQueryRange";

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
  const readiness = resolvePlanningDayQueryRange({ dateKey, timezone: planningTimezone });
  if (readiness.status === "unavailable") return null;
  return {
    startsAfter: readiness.value.startsAfter,
    startsBefore: readiness.value.startsBefore,
  };
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
