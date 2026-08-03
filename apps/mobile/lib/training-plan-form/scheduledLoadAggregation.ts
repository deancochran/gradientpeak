import type { ActivityPrescriptionQuantificationBundle } from "@repo/core";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";

export type ScheduledLoadEventInput = {
  id?: string | null;
  series_id?: string | null;
  title?: string | null;
  name?: string | null;
  starts_at?: string | null;
  scheduled_date?: string | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  activity_plan?: {
    id?: string | null;
    name?: string | null;
    prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
  } | null;
  tentative?: boolean | null;
};

function getScheduledEventDateKey(event: ScheduledLoadEventInput) {
  return event.scheduled_date ?? event.starts_at?.split("T")[0] ?? null;
}

function getScheduledEventDedupeKey(event: ScheduledLoadEventInput, date: string, load: number) {
  const activityPlan = event.activity_plan;
  return [
    event.id ?? event.series_id ?? event.starts_at ?? event.scheduled_date ?? "event",
    date,
    activityPlan?.id ?? activityPlan?.name ?? event.title ?? event.name ?? "plan",
    Math.round(load),
    event.tentative ? "tentative" : "scheduled",
  ].join("|");
}

export function aggregateScheduledLoadByDate(input: {
  scheduledEvents?: ScheduledLoadEventInput[] | null;
  scheduledWindowStart?: string | null;
  scheduledWindowEnd?: string | null;
}) {
  const scheduledLoadByDate = new Map<string, number>();
  const tentativeScheduledLoadByDate = new Map<string, number>();
  const dates = new Set<string>();
  const countedScheduledEvents = new Set<string>();

  for (const event of input.scheduledEvents ?? []) {
    const load = getActivityPlanQuantitySummary(event.activity_plan).commonLoad;
    if (typeof load !== "number" || !Number.isFinite(load)) continue;

    const date = getScheduledEventDateKey(event);
    if (!date) continue;
    if (input.scheduledWindowStart && date < input.scheduledWindowStart) continue;
    if (input.scheduledWindowEnd && date > input.scheduledWindowEnd) continue;

    const dedupeKey = getScheduledEventDedupeKey(event, date, load);
    if (countedScheduledEvents.has(dedupeKey)) continue;
    countedScheduledEvents.add(dedupeKey);

    dates.add(date);
    const loadByDate = event.tentative ? tentativeScheduledLoadByDate : scheduledLoadByDate;
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + load);
  }

  return { dates, scheduledLoadByDate, tentativeScheduledLoadByDate };
}
