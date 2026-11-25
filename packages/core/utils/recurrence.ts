type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export type MaterializedRecurrenceOccurrence = {
  startsAt: string;
  endsAt: string | null;
  occurrenceKey: string;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, value);
  return value;
}

function localParts(instant: Date, format: Intl.DateTimeFormat): LocalDateTime {
  const parts = Object.fromEntries(
    format
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;

  return { ...parts, millisecond: instant.getUTCMilliseconds() };
}

function sameLocalDateTime(left: LocalDateTime, right: LocalDateTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second &&
    left.millisecond === right.millisecond
  );
}

function wallClockToDate(value: LocalDateTime, format: Intl.DateTimeFormat): Date {
  const nominalUtc = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
  );
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const instant = new Date(nominalUtc + hours * 60 * 60 * 1_000);
      const local = localParts(instant, format);
      return (
        (Date.UTC(
          local.year,
          local.month - 1,
          local.day,
          local.hour,
          local.minute,
          local.second,
          local.millisecond,
        ) -
          instant.getTime()) /
        60_000
      );
    }),
  );
  const matches = [...offsets]
    .map((offset) => new Date(nominalUtc - offset * 60_000))
    .filter((candidate) => sameLocalDateTime(localParts(candidate, format), value));

  if (matches.length !== 1) {
    throw new RangeError(
      matches.length === 0
        ? "The recurring local wall time does not exist in this time zone"
        : "The recurring local wall time is ambiguous in this time zone",
    );
  }

  return matches[0] as Date;
}

function addInterval(
  original: LocalDateTime,
  frequency: RecurrenceFrequency,
  interval: number,
  index: number,
): LocalDateTime {
  const date = new Date(
    Date.UTC(
      original.year,
      original.month - 1,
      original.day,
      original.hour,
      original.minute,
      original.second,
      original.millisecond,
    ),
  );
  if (frequency === "DAILY") date.setUTCDate(date.getUTCDate() + interval * index);
  if (frequency === "WEEKLY") date.setUTCDate(date.getUTCDate() + interval * index * 7);
  if (frequency === "MONTHLY") date.setUTCMonth(date.getUTCMonth() + interval * index);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: original.hour,
    minute: original.minute,
    second: original.second,
    millisecond: original.millisecond,
  };
}

function dateKey(value: LocalDateTime): string {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

/**
 * Materializes recurrence dates in the recurrence timezone, falling back to the event timezone.
 * Each occurrence retains the source event's local start and end wall-clock values across DST.
 */
export function materializeRecurrenceOccurrences(input: {
  startsAt: string;
  endsAt: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  count: number;
  untilDateKey?: string | null;
  recurrenceTimeZone?: string | null;
  eventTimeZone?: string | null;
}): MaterializedRecurrenceOccurrence[] {
  const timeZone = input.recurrenceTimeZone ?? input.eventTimeZone;
  if (!timeZone) throw new RangeError("A recurrence or event timezone is required");

  const start = new Date(input.startsAt);
  const end = input.endsAt ? new Date(input.endsAt) : null;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
    throw new RangeError("Recurring event times must be valid instants");
  }

  const recurrenceFormat = formatter(timeZone);
  const originalStart = localParts(start, recurrenceFormat);
  const originalEnd = end ? localParts(end, recurrenceFormat) : null;
  const occurrences: MaterializedRecurrenceOccurrence[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const startWall = addInterval(originalStart, input.frequency, input.interval, index);
    const occurrenceKey = dateKey(startWall);
    if (input.untilDateKey && occurrenceKey > input.untilDateKey) break;

    occurrences.push({
      startsAt: wallClockToDate(startWall, recurrenceFormat).toISOString(),
      endsAt: originalEnd
        ? wallClockToDate(
            addInterval(originalEnd, input.frequency, input.interval, index),
            recurrenceFormat,
          ).toISOString()
        : null,
      occurrenceKey,
    });
  }

  return occurrences;
}
