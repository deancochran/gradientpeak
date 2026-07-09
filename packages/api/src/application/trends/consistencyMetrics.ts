export type ConsistencyMetricsActivityRow = {
  started_at: Date;
};

export type ConsistencyMetricsResult = {
  activityDays: string[];
  weeklyAvg: number;
  currentStreak: number;
  longestStreak: number;
  totalActivities: number;
  totalDays: number;
};

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

export function buildConsistencyMetrics(
  activityRows: ConsistencyMetricsActivityRow[],
  startDate: Date,
  endDate: Date,
): ConsistencyMetricsResult {
  if (activityRows.length === 0) {
    return {
      activityDays: [],
      weeklyAvg: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalActivities: 0,
      totalDays: 0,
    };
  }

  const activityDaysSet = new Set<string>();
  for (const activity of activityRows) {
    const dateStr = toDateKey(new Date(activity.started_at));
    if (dateStr) activityDaysSet.add(dateStr);
  }

  const activityDays = Array.from(activityDaysSet).sort();

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;

  const today = toDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateKey(yesterday);

  if (activityDays.includes(today || "") || activityDays.includes(yesterdayStr || "")) {
    currentStreak = 1;

    for (let i = activityDays.length - 2; i >= 0; i--) {
      const currentDate = new Date(activityDays[i]!);
      const nextDate = new Date(activityDays[i + 1]!);
      const diffDays = Math.round(
        (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  for (let i = 1; i < activityDays.length; i++) {
    const prevDate = new Date(activityDays[i - 1]!);
    const currDate = new Date(activityDays[i]!);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  longestStreak = Math.max(longestStreak, tempStreak);

  const totalDays =
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = totalDays / 7;
  const weeklyAvg = totalWeeks > 0 ? Math.round((activityRows.length / totalWeeks) * 10) / 10 : 0;

  return {
    activityDays,
    weeklyAvg,
    currentStreak,
    longestStreak,
    totalActivities: activityRows.length,
    totalDays,
  };
}
