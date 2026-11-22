const DAY_MS = 24 * 60 * 60 * 1000;

function getDateOnlyFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnlyUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Formats an instant as a calendar date in an explicitly supplied IANA timezone. */
export function formatDateOnlyInTimeZone(value: Date, timeZone: string): string {
  const parts = getDateOnlyFormatter(timeZone).formatToParts(value);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;

  return `${values.year}-${values.month}-${values.day}`;
}

export function addDaysDateOnlyUtc(value: string, days: number): string {
  const date = parseDateOnlyUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyUtc(date);
}

export function diffDateOnlyUtcDays(startDate: string, endDate: string): number {
  const start = parseDateOnlyUtc(startDate).getTime();
  const end = parseDateOnlyUtc(endDate).getTime();
  return Math.floor((end - start) / DAY_MS);
}

export function isValidDateOnlyUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = parseDateOnlyUtc(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return formatDateOnlyUtc(parsed) === value;
}
