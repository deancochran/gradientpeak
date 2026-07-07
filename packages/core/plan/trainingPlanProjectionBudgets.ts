import { addDaysDateOnlyUtc, diffDateOnlyUtcDays, isValidDateOnlyUtc } from "./dateOnlyUtc";

export const TRAINING_PLAN_PROJECTION_RECENT_HISTORY_DAYS = 45;
export const TRAINING_PLAN_PROJECTION_FUTURE_HORIZON_DAYS = 365;
export const TRAINING_PLAN_PROJECTION_MAX_WINDOW_DAYS =
  TRAINING_PLAN_PROJECTION_RECENT_HISTORY_DAYS + TRAINING_PLAN_PROJECTION_FUTURE_HORIZON_DAYS;

export type TrainingPlanProjectionWindow = {
  startDate: string;
  endDate: string;
  wasClamped: boolean;
};

export function resolveTrainingPlanProjectionWindow(input: {
  anchorDate: string;
  requestedStartDate?: string | null;
  requestedEndDate?: string | null;
  recentHistoryDays?: number;
  futureHorizonDays?: number;
}): TrainingPlanProjectionWindow {
  const recentHistoryDays = input.recentHistoryDays ?? TRAINING_PLAN_PROJECTION_RECENT_HISTORY_DAYS;
  const futureHorizonDays = input.futureHorizonDays ?? TRAINING_PLAN_PROJECTION_FUTURE_HORIZON_DAYS;
  const fallbackStartDate = addDaysDateOnlyUtc(input.anchorDate, -recentHistoryDays);
  const fallbackEndDate = addDaysDateOnlyUtc(input.anchorDate, futureHorizonDays);
  const requestedStartDate = input.requestedStartDate ?? fallbackStartDate;
  const requestedEndDate = input.requestedEndDate ?? fallbackEndDate;
  const startDate = isValidDateOnlyUtc(requestedStartDate) ? requestedStartDate : fallbackStartDate;
  const endDate = isValidDateOnlyUtc(requestedEndDate) ? requestedEndDate : fallbackEndDate;
  const minStartDate = fallbackStartDate;
  const maxEndDate = fallbackEndDate;
  const boundedStartDate = startDate < minStartDate ? minStartDate : startDate;
  const boundedEndDate = endDate > maxEndDate ? maxEndDate : endDate;
  const normalizedEndDate = boundedEndDate < boundedStartDate ? boundedStartDate : boundedEndDate;

  return {
    startDate: boundedStartDate,
    endDate: normalizedEndDate,
    wasClamped:
      boundedStartDate !== requestedStartDate ||
      normalizedEndDate !== requestedEndDate ||
      diffDateOnlyUtcDays(boundedStartDate, normalizedEndDate) >
        recentHistoryDays + futureHorizonDays,
  };
}

export function filterDateKeyedItemsToProjectionWindow<TItem>(
  items: TItem[],
  input: {
    getDate: (item: TItem) => string | null | undefined;
    window: Pick<TrainingPlanProjectionWindow, "startDate" | "endDate">;
  },
): TItem[] {
  return items.filter((item) => {
    const date = input.getDate(item);
    return !!date && date >= input.window.startDate && date <= input.window.endDate;
  });
}
