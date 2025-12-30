/**
 * Date grouping utilities for activities and events
 * Centralizes logic for grouping activities by date ranges
 */

import {
  getEndOfWeek,
  getStartOfWeek,
  getWeekDates,
  isDateInRange,
  isSameDay,
  normalizeDate,
} from "./dates";

// Re-export date utilities that are commonly used with grouping
export { getWeekDates, isDateInRange, isSameDay, normalizeDate };

export interface GroupedActivities<T = any> {
  today: T[];
  tomorrow: T[];
  thisWeek: T[];
  nextWeek: T[];
  later: T[];
}

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get date ranges for grouping activities
 */
export function getDateRanges(referenceDate: Date = new Date()) {
  const now = normalizeDate(referenceDate);
  const today = now;

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const startOfWeek = getStartOfWeek(today);
  const endOfWeek = getEndOfWeek(today);

  const nextWeekStart = new Date(endOfWeek);
  nextWeekStart.setDate(endOfWeek.getDate() + 1);
  nextWeekStart.setHours(0, 0, 0, 0);

  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
  nextWeekEnd.setHours(23, 59, 59, 999);

  return {
    today,
    tomorrow,
    startOfWeek,
    endOfWeek,
    nextWeekStart,
    nextWeekEnd,
  };
}

/**
 * Group activities by date ranges (today, tomorrow, this week, next week, later)
 */
export function groupActivitiesByDate<
  T extends { scheduled_date: string | Date },
>(activities: T[]): GroupedActivities<T> {
  const ranges = getDateRanges();

  const groups: GroupedActivities<T> = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };

  activities.forEach((activity) => {
    const activityDate = normalizeDate(new Date(activity.scheduled_date));

    if (isSameDay(activityDate, ranges.today)) {
      groups.today.push(activity);
    } else if (isSameDay(activityDate, ranges.tomorrow)) {
      groups.tomorrow.push(activity);
    } else if (
      isDateInRange(activityDate, ranges.startOfWeek, ranges.endOfWeek) &&
      activityDate > ranges.today
    ) {
      groups.thisWeek.push(activity);
    } else if (
      isDateInRange(activityDate, ranges.nextWeekStart, ranges.nextWeekEnd)
    ) {
      groups.nextWeek.push(activity);
    } else if (activityDate > ranges.nextWeekEnd) {
      groups.later.push(activity);
    }
  });

  return groups;
}

/**
 * Get activities for a specific week
 */
export function getActivitiesForWeek<
  T extends { scheduled_date: string | Date },
>(activities: T[], weekOffset: number = 0): T[][] {
  const now = new Date();
  const startOfWeek = getStartOfWeek(now);
  startOfWeek.setDate(startOfWeek.getDate() + weekOffset * 7);

  const weekActivities: T[][] = Array.from({ length: 7 }, () => []);

  activities.forEach((activity) => {
    const activityDate = new Date(activity.scheduled_date);
    const daysDiff = Math.floor(
      (normalizeDate(activityDate).getTime() - startOfWeek.getTime()) /
        (24 * 60 * 60 * 1000),
    );

    if (daysDiff >= 0 && daysDiff < 7) {
      weekActivities[daysDiff]?.push(activity);
    }
  });

  return weekActivities;
}

/**
 * Get week dates array for calendar display
 */
export function getWeekDatesArray(weekOffset: number = 0): Date[] {
  const now = new Date();
  const startOfWeek = getStartOfWeek(now);
  startOfWeek.setDate(startOfWeek.getDate() + weekOffset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    return day;
  });
}

/**
 * Check if an activity is completed
 */
export function isActivityCompleted(activity: any): boolean {
  return activity?.completed === true || activity?.status === "completed";
}

/**
 * Get activity summary for a day
 */
export interface DayActivitySummary {
  date: Date;
  hasActivities: boolean;
  completed: boolean;
  activityType: string;
  activityCount: number;
}

export function getDayActivitySummary<
  T extends { scheduled_date: string | Date },
>(activities: T[], date: Date): DayActivitySummary {
  const dayActivities = activities.filter((a) =>
    isSameDay(new Date(a.scheduled_date), date),
  );

  return {
    date,
    hasActivities: dayActivities.length > 0,
    completed: dayActivities.every((a) => isActivityCompleted(a)),
    activityType:
      (dayActivities[0] as any)?.activity_plan?.activity_category || "rest",
    activityCount: dayActivities.length,
  };
}
