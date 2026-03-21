import { type TrainingQualityProfile } from "../calculations/training-quality";
import { calculateATL, calculateCTL, calculateTSB } from "./progression";

export interface DatedTssEntry {
  date: string;
  tss: number;
}

export interface ReplayTrainingLoadByDateInput {
  dailyTss: DatedTssEntry[];
  initialCTL?: number;
  initialATL?: number;
  userAge?: number;
  userGender?: "male" | "female" | null;
  trainingQuality?: TrainingQualityProfile;
}

export interface ReplayTrainingLoadPoint {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export function buildDailyTssByDateSeries(input: {
  startDate: string;
  endDate: string;
  tssByDate: Map<string, number> | Record<string, number>;
}): DatedTssEntry[] {
  const results: DatedTssEntry[] = [];
  const cursor = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const date = cursor.toISOString().split("T")[0]!;
    const tss =
      input.tssByDate instanceof Map
        ? (input.tssByDate.get(date) ?? 0)
        : (input.tssByDate[date] ?? 0);
    results.push({ date, tss });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

export function replayTrainingLoadByDate(
  input: ReplayTrainingLoadByDateInput,
): ReplayTrainingLoadPoint[] {
  const results: ReplayTrainingLoadPoint[] = [];
  let currentCTL = input.initialCTL ?? 0;
  let currentATL = input.initialATL ?? 0;

  for (const item of input.dailyTss) {
    currentCTL = calculateCTL(currentCTL, item.tss, input.userAge);
    currentATL = calculateATL(
      currentATL,
      item.tss,
      input.userAge,
      input.userGender,
      input.trainingQuality,
    );
    const tsb = calculateTSB(currentCTL, currentATL);

    results.push({
      date: item.date,
      tss: item.tss,
      ctl: currentCTL,
      atl: currentATL,
      tsb,
    });
  }

  return results;
}
