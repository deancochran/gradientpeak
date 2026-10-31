import type { TrainingQualityProfile } from "../calculations/training-quality";
import { calculateLoadBalance, calculateLongTermLoad, calculateRecentLoad } from "./progression";

export interface DatedLoadEntry {
  date: string;
  load: number;
}

export interface ReplayCommonLoadFitnessByDateInput {
  dailyLoad: DatedLoadEntry[];
  initialLongTermLoad?: number;
  initialRecentLoad?: number;
  userAge?: number;
  userGender?: "male" | "female" | null;
  trainingQuality?: TrainingQualityProfile;
}

export interface ReplayCommonLoadFitnessPoint {
  date: string;
  load: number;
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
}

export function buildDailyLoadByDateSeries(input: {
  startDate: string;
  endDate: string;
  loadByDate: Map<string, number> | Record<string, number>;
}): DatedLoadEntry[] {
  const results: DatedLoadEntry[] = [];
  const cursor = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const load =
      input.loadByDate instanceof Map
        ? (input.loadByDate.get(date) ?? 0)
        : (input.loadByDate[date] ?? 0);
    results.push({ date, load });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

export function replayCommonLoadFitnessByDate(
  input: ReplayCommonLoadFitnessByDateInput,
): ReplayCommonLoadFitnessPoint[] {
  const results: ReplayCommonLoadFitnessPoint[] = [];
  let currentLongTermLoad = input.initialLongTermLoad ?? 0;
  let currentRecentLoad = input.initialRecentLoad ?? 0;

  for (const item of input.dailyLoad) {
    currentLongTermLoad = calculateLongTermLoad(currentLongTermLoad, item.load, input.userAge);
    currentRecentLoad = calculateRecentLoad(
      currentRecentLoad,
      item.load,
      input.userAge,
      input.userGender,
      input.trainingQuality,
    );
    const loadBalance = calculateLoadBalance(currentLongTermLoad, currentRecentLoad);

    results.push({
      date: item.date,
      load: item.load,
      longTermLoad: currentLongTermLoad,
      recentLoad: currentRecentLoad,
      loadBalance,
    });
  }

  return results;
}
