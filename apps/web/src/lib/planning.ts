import { commonLoadResultSchema, scheduledDateTimeToIsoInstant } from "@repo/core";

export type PlanningEvent = {
  id: string;
  title?: string | null;
  event_type?: string | null;
  scheduled_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean | null;
  status?: string | null;
  notes?: string | null;
  timezone?: string | null;
  training_plan_id?: string | null;
  activity_plan?: {
    id: string;
    name?: string | null;
    description?: string | null;
    activity_category?: string | null;
    common_load?: unknown;
  } | null;
};

const recurrenceWeekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey() {
  return toDateKey(new Date());
}

export function getMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonthKey(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return false;
  }

  const [year = Number.NaN, month = Number.NaN] = monthKey.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return false;
  }

  return getMonthKey(new Date(year, month - 1, 1, 12, 0, 0, 0)) === monthKey;
}

export function parseMonthKey(monthKey: string) {
  const [year = 1970, month = 1] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

export function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = dateKey.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  return toDateKey(new Date(year, month - 1, day, 12, 0, 0, 0)) === dateKey;
}

export function getMonthWindow(monthKey: string) {
  const monthStart = parseMonthKey(monthKey);
  const rangeStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1, 12, 0, 0, 0);
  const rangeEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12, 0, 0, 0);

  return {
    rangeStart,
    rangeEnd,
    startKey: toDateKey(rangeStart),
    endKey: toDateKey(rangeEnd),
  };
}

export function shiftMonthKey(monthKey: string, offset: number) {
  const base = parseMonthKey(monthKey);
  return getMonthKey(new Date(base.getFullYear(), base.getMonth() + offset, 1, 12, 0, 0, 0));
}

export function shiftDateKey(dateKey: string, offset: number) {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function getWeekWindow(dateKey: string) {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  const startKey = shiftDateKey(dateKey, -value.getUTCDay());
  const days = Array.from({ length: 7 }, (_, index) => shiftDateKey(startKey, index));

  return {
    startKey,
    endKey: days[6] ?? startKey,
    days,
  };
}

export function buildWeeklyRecurrence({
  count,
  scheduledDate,
  timezone,
}: {
  count: number;
  scheduledDate: string;
  timezone: string;
}) {
  if (!Number.isInteger(count) || count <= 1) return null;

  const weekday = recurrenceWeekdays[new Date(`${scheduledDate}T12:00:00.000Z`).getUTCDay()];
  if (!weekday) return null;

  return {
    rule: `FREQ=WEEKLY;INTERVAL=1;COUNT=${count};BYDAY=${weekday}`,
    timezone,
  };
}

export type PlannedLoadPathPoint = {
  eventCount: number;
  load: number | null;
  status: "complete" | "partial" | "unavailable";
};

export function getTrainingLoadPath(events: PlanningEvent[]) {
  const dailyBuckets = new Map<
    string,
    PlannedLoadPathPoint & {
      date: string;
      contributingEventCount: number;
      partialEventCount: number;
    }
  >();

  for (const event of events) {
    if (!event.scheduled_date) continue;
    const parsed = commonLoadResultSchema.safeParse(event.activity_plan?.common_load);
    const bucket = dailyBuckets.get(event.scheduled_date) ?? {
      date: event.scheduled_date,
      eventCount: 0,
      contributingEventCount: 0,
      partialEventCount: 0,
      load: null,
      status: "unavailable" as const,
    };
    bucket.eventCount += 1;
    if (parsed.success && parsed.data.status !== "unavailable" && parsed.data.load !== null) {
      bucket.load = bucket.load === null ? parsed.data.load : bucket.load + parsed.data.load;
      bucket.contributingEventCount += 1;
      if (parsed.data.status === "partial") bucket.partialEventCount += 1;
    }
    bucket.status =
      bucket.contributingEventCount === bucket.eventCount && bucket.partialEventCount === 0
        ? "complete"
        : bucket.load === null
          ? "unavailable"
          : "partial";
    dailyBuckets.set(event.scheduled_date, bucket);
  }

  const daily = [...dailyBuckets.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({
      date: point.date,
      eventCount: point.eventCount,
      load: point.load,
      status: point.status,
    }));
  const weeklyBuckets = new Map<
    string,
    PlannedLoadPathPoint & { weekStart: string; completeDayCount: number; dayCount: number }
  >();
  for (const day of daily) {
    const weekStart = getWeekWindow(day.date).startKey;
    const bucket = weeklyBuckets.get(weekStart) ?? {
      weekStart,
      eventCount: 0,
      completeDayCount: 0,
      dayCount: 0,
      load: null,
      status: "unavailable" as const,
    };
    bucket.eventCount += day.eventCount;
    bucket.dayCount += 1;
    if (day.status === "complete") bucket.completeDayCount += 1;
    if (day.load !== null) bucket.load = bucket.load === null ? day.load : bucket.load + day.load;
    bucket.status =
      bucket.completeDayCount === bucket.dayCount
        ? "complete"
        : bucket.load === null
          ? "unavailable"
          : "partial";
    weeklyBuckets.set(weekStart, bucket);
  }

  return {
    daily,
    weekly: [...weeklyBuckets.values()]
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
      .map((point) => ({
        weekStart: point.weekStart,
        eventCount: point.eventCount,
        load: point.load,
        status: point.status,
      })),
  };
}

export function getCalendarGrid(monthKey: string) {
  const monthStart = parseMonthKey(monthKey);
  const firstVisible = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1, 12, 0, 0, 0);
  const startWeekday = firstVisible.getDay();
  firstVisible.setDate(firstVisible.getDate() - startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(firstVisible);
    value.setDate(firstVisible.getDate() + index);
    return value;
  });
}

export function formatMonthLabel(monthKey: string) {
  return parseMonthKey(monthKey).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function formatDayLabel(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDayLabel(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatEventTimeRange(event: PlanningEvent) {
  if (event.all_day) {
    return "All day";
  }

  if (!event.starts_at) {
    return "Scheduled";
  }

  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) {
    return "Scheduled";
  }

  const startLabel = start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone ?? "UTC",
  });

  if (!event.ends_at) {
    return startLabel;
  }

  const end = new Date(event.ends_at);
  if (Number.isNaN(end.getTime())) {
    return startLabel;
  }

  return `${startLabel} - ${end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone ?? "UTC",
  })}`;
}

export function compareEventsByStart(a: PlanningEvent, b: PlanningEvent) {
  return (a.starts_at ?? "").localeCompare(b.starts_at ?? "");
}

export function buildAllDayStartIso(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).toISOString();
}

export function getEventDurationMs(event: PlanningEvent) {
  if (!event.starts_at || !event.ends_at) {
    return null;
  }

  const duration = new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return duration;
}

export function buildCalendarEventUpdatePatch({
  allDay,
  event,
  notes,
  scheduledDate,
  time,
  title,
}: {
  allDay: boolean;
  event: PlanningEvent;
  notes?: string;
  scheduledDate: string;
  time?: string;
  title: string;
}) {
  const timezone = event.timezone ?? "UTC";
  const startsAt = allDay
    ? buildAllDayStartIso(scheduledDate)
    : scheduledDateTimeToIsoInstant({
        scheduledDate,
        time: time ?? "09:00",
        timeZone: timezone,
      });
  const durationMs = getEventDurationMs(event);

  return {
    all_day: allDay,
    ends_at:
      allDay || durationMs === null
        ? undefined
        : new Date(new Date(startsAt).getTime() + durationMs).toISOString(),
    notes: notes?.trim() ? notes.trim() : null,
    scheduled_date: scheduledDate,
    starts_at: startsAt,
    timezone,
    title,
  };
}

export function getEventTypeLabel(eventType: string | null | undefined) {
  return String(eventType ?? "event").replaceAll("_", " ");
}

export function getEventTitle(event: PlanningEvent) {
  return event.title?.trim() || event.activity_plan?.name?.trim() || "Untitled event";
}
