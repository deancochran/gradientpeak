const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const localDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getLocalDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = localDateTimeFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  localDateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
  const parts = getLocalDateTimeFormatter(timeZone).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", number>;

  return values;
}

function isValidDateKey(value: string): boolean {
  const match = dateKeyPattern.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseLocalDateTime(scheduledDate: string, time: string): LocalDateTime {
  if (!isValidDateKey(scheduledDate)) {
    throw new RangeError("scheduledDate must be a valid YYYY-MM-DD date");
  }

  const match = timePattern.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new RangeError("time must be a valid HH:mm time");
  }

  const [year = 0, month = 0, day = 0] = scheduledDate.split("-").map(Number);
  return { year, month, day, hour: Number(match[1]), minute: Number(match[2]) };
}

function hasSameLocalDateTime(left: LocalDateTime, right: LocalDateTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function getOffsetMinutes(instant: Date, timeZone: string): number {
  const local = getLocalDateTime(instant, timeZone);
  return (
    (Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) -
      instant.getTime()) /
    60_000
  );
}

/** Returns whether a value is an IANA time-zone identifier supported by this runtime. */
export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Canonicalizes an explicitly offset UTC instant without consulting device locale. */
export function canonicalUtcInstant(isoInstant: string): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(isoInstant)) {
    throw new RangeError("isoInstant must include an explicit UTC offset");
  }
  const instant = new Date(isoInstant);
  if (Number.isNaN(instant.getTime())) throw new RangeError("isoInstant must be valid");
  return instant.toISOString();
}

/** Derives a calendar date in one required IANA zone; no fallback is applied. */
export function getCalendarDateInIanaZone(isoInstant: string, timeZone: string): string {
  if (!isValidIanaTimeZone(timeZone)) throw new RangeError("timeZone must be a valid IANA zone");
  const instant = new Date(canonicalUtcInstant(isoInstant));
  const local = getLocalDateTime(instant, timeZone);
  return `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(
    local.day,
  ).padStart(2, "0")}`;
}

/** Formats an explicit instant as a `YYYY-MM-DDTHH:mm` wall time in one required IANA zone. */
export function formatIsoInstantInIanaZone(isoInstant: string, timeZone: string): string {
  if (!isValidIanaTimeZone(timeZone)) throw new RangeError("timeZone must be a valid IANA zone");
  const instant = new Date(canonicalUtcInstant(isoInstant));
  const local = getLocalDateTime(instant, timeZone);
  return `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(
    local.day,
  ).padStart(2, "0")}T${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(
    2,
    "0",
  )}`;
}

export function getCalendarDateInUtc(isoInstant: string): string {
  return getCalendarDateInIanaZone(isoInstant, "UTC");
}

/** Device-local is explicit: callers must supply the device's resolved IANA zone. */
export function getCalendarDateInDeviceZone(isoInstant: string, deviceTimeZone: string): string {
  return getCalendarDateInIanaZone(isoInstant, deviceTimeZone);
}

/**
 * Converts a local scheduled date and wall time to an ISO instant.
 *
 * Nonexistent spring-forward times and ambiguous fall-back times throw RangeError.
 * Scheduled events must therefore use a wall time that maps to exactly one instant.
 */
export function scheduledDateTimeToIsoInstant({
  scheduledDate,
  time,
  timeZone,
}: {
  scheduledDate: string;
  time: string;
  timeZone: string;
}): string {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new RangeError("timeZone must be a valid IANA time zone");
  }

  const requested = parseLocalDateTime(scheduledDate, time);
  const nominalUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  );
  const offsets = new Set(
    [-36, 0, 36].map((hours) =>
      getOffsetMinutes(new Date(nominalUtc + hours * 60 * 60 * 1_000), timeZone),
    ),
  );
  const matches = [...offsets]
    .map((offset) => new Date(nominalUtc - offset * 60_000))
    .filter((candidate) => hasSameLocalDateTime(getLocalDateTime(candidate, timeZone), requested));

  if (matches.length !== 1) {
    throw new RangeError(
      matches.length === 0
        ? "The local wall time does not exist in this time zone"
        : "The local wall time is ambiguous in this time zone",
    );
  }

  const match = matches[0];
  if (!match) {
    throw new RangeError("The local wall time could not be resolved");
  }
  return match.toISOString();
}

/** Resolves the final millisecond of a local calendar date in an explicit IANA zone. */
export function endOfScheduledDateToIsoInstant(input: {
  scheduledDate: string;
  timeZone: string;
}): string {
  const finalMinute = scheduledDateTimeToIsoInstant({
    scheduledDate: input.scheduledDate,
    time: "23:59",
    timeZone: input.timeZone,
  });
  return new Date(Date.parse(finalMinute) + 59_999).toISOString();
}
