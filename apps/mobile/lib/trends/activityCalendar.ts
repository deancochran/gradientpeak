export type ActivityCalendarCell = {
  active: boolean;
  dateKey: string;
};

const millisecondsPerDay = 86_400_000;

const toDateKey = (date: Date) => date.toISOString().split("T")[0] ?? "";

export function buildActivityCalendarCells({
  points,
  endDate,
  maxDays,
  startDate,
}: {
  points: Array<{ date?: Date }>;
  endDate: Date;
  maxDays: number;
  startDate?: Date;
}): ActivityCalendarCell[] {
  if (maxDays <= 0) return [];
  const endDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const requestedStartDay = startDate
    ? Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
    : endDay - (maxDays - 1) * millisecondsPerDay;
  const startDay = Math.max(requestedStartDay, endDay - (maxDays - 1) * millisecondsPerDay);
  const activeDates = new Set(
    points
      .map((point) => point.date)
      .filter((date): date is Date => date instanceof Date && Number.isFinite(date.getTime()))
      .map(toDateKey),
  );

  return Array.from(
    { length: Math.max(0, Math.floor((endDay - startDay) / millisecondsPerDay) + 1) },
    (_, index) => {
      const dateKey = toDateKey(new Date(startDay + index * millisecondsPerDay));
      return { active: activeDates.has(dateKey), dateKey };
    },
  );
}
