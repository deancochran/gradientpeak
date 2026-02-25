const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnlyUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDaysDateOnlyUtc(value: string, days: number): string {
  const date = parseDateOnlyUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyUtc(date);
}

export function diffDateOnlyUtcDays(
  startDate: string,
  endDate: string,
): number {
  const start = parseDateOnlyUtc(startDate).getTime();
  const end = parseDateOnlyUtc(endDate).getTime();
  return Math.floor((end - start) / DAY_MS);
}
