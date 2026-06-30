export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

export function diffDateOnlyDays(startDate: string, endDate: string): number {
  return Math.round(
    (parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / 86_400_000,
  );
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return toDateKey(parseDateKey(value)) === value;
}
