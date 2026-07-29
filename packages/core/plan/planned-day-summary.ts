import type { CanonicalActivityCategory } from "../schemas/activity-category";

export type PlannedDaySummaryEvent = {
  activityCategory: CanonicalActivityCategory | null;
  estimatedDurationSeconds: number | null;
  estimatedTss: number | null;
};

export type PlannedDaySummary = {
  eventCount: number;
  activity_categories: CanonicalActivityCategory[];
  totalDurationSeconds: number | null;
  totalTss: number | null;
};

/** Summarizes already-authorized independent planned events without combining their execution. */
export function summarizePlannedDay(events: readonly PlannedDaySummaryEvent[]): PlannedDaySummary {
  const activity_categories: CanonicalActivityCategory[] = [];
  const seenActivityCategories = new Set<CanonicalActivityCategory>();
  let totalDurationSeconds = 0;
  let totalTss = 0;
  let hasUnknownDuration = false;
  let hasUnknownTss = false;

  for (const event of events) {
    if (event.estimatedDurationSeconds === null) hasUnknownDuration = true;
    else totalDurationSeconds += event.estimatedDurationSeconds;
    if (event.estimatedTss === null) hasUnknownTss = true;
    else totalTss += event.estimatedTss;

    if (event.activityCategory && !seenActivityCategories.has(event.activityCategory)) {
      seenActivityCategories.add(event.activityCategory);
      activity_categories.push(event.activityCategory);
    }
  }

  return {
    eventCount: events.length,
    activity_categories,
    totalDurationSeconds: hasUnknownDuration ? null : totalDurationSeconds,
    totalTss: hasUnknownTss ? null : totalTss,
  };
}
