import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";

export type ScheduledLoadEventInput = {
  id?: string | null;
  series_id?: string | null;
  title?: string | null;
  name?: string | null;
  starts_at?: string | null;
  scheduled_date?: string | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  activity_plan?: unknown;
  tentative?: boolean | null;
};

function getScheduledEventDateKey(event: ScheduledLoadEventInput) {
  return event.scheduled_date ?? event.starts_at?.split("T")[0] ?? null;
}

function getScheduledEventDedupeKey(event: ScheduledLoadEventInput, date: string, tss: number) {
  const activityPlan = event.activity_plan as { id?: string | null; name?: string | null } | null;
  return [
    event.id ?? event.series_id ?? event.starts_at ?? event.scheduled_date ?? "event",
    date,
    activityPlan?.id ?? activityPlan?.name ?? event.title ?? event.name ?? "plan",
    Math.round(tss),
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
    const tss = getAuthoritativeActivityPlanMetrics(
      event.activity_plan as Parameters<typeof getAuthoritativeActivityPlanMetrics>[0],
    ).estimated_tss;
    if (typeof tss !== "number" || !Number.isFinite(tss)) continue;

    const date = getScheduledEventDateKey(event);
    if (!date) continue;
    if (input.scheduledWindowStart && date < input.scheduledWindowStart) continue;
    if (input.scheduledWindowEnd && date > input.scheduledWindowEnd) continue;

    const dedupeKey = getScheduledEventDedupeKey(event, date, tss);
    if (countedScheduledEvents.has(dedupeKey)) continue;
    countedScheduledEvents.add(dedupeKey);

    dates.add(date);
    const loadByDate = event.tentative ? tentativeScheduledLoadByDate : scheduledLoadByDate;
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + tss);
  }

  return { dates, scheduledLoadByDate, tentativeScheduledLoadByDate };
}
