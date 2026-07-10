import type { TrainingTimelineWindow } from "@repo/core/training-timeline";
import {
  type DailyTrainingAdjustmentPoint,
  normalizeDailyTrainingAdjustmentPoints,
  type TrainingPathDailyFitnessInput,
} from "./dailyTrainingPathModel";

export function buildDailyTrainingAdjustmentPointsFromTimelineWindow(input: {
  completedActivityDates?: readonly string[];
  timelineWindow: TrainingTimelineWindow;
  fitnessHistory?: TrainingPathDailyFitnessInput[] | null;
  idealFitnessCurve?: TrainingPathDailyFitnessInput[] | null;
  scheduledFitnessTrend?: TrainingPathDailyFitnessInput[] | null;
}): DailyTrainingAdjustmentPoint[] {
  const completedActivityDates = new Set(input.completedActivityDates);
  const fitnessByDate = new Map((input.fitnessHistory ?? []).map((point) => [point.date, point]));
  const targetFitnessByDate = new Map(
    (input.idealFitnessCurve ?? []).map((point) => [point.date, point]),
  );
  const scheduledFitnessByDate = new Map(
    (input.scheduledFitnessTrend ?? []).map((point) => [point.date, point]),
  );

  return normalizeDailyTrainingAdjustmentPoints({
    startDate: input.timelineWindow.startDate,
    endDate: input.timelineWindow.endDate,
    points: input.timelineWindow.days.map((day) => {
      const fitness = fitnessByDate.get(day.date);
      const targetFitness = targetFitnessByDate.get(day.date);
      const scheduledFitness = scheduledFitnessByDate.get(day.date);
      return {
        date: day.date,
        hasCompletedActivity: completedActivityDates.has(day.date),
        plannedLoadTss: day.load.scheduledTss,
        tentativePlannedLoadTss: day.load.tentativeScheduledTss,
        completedLoadTss: day.load.completedTss,
        targetLoadTss: day.load.recommendedTss ?? day.load.plannedTss,
        actualOrScheduledLoadTss:
          day.load.completedTss + day.load.scheduledTss + day.load.tentativeScheduledTss,
        fitnessCtl: fitness?.ctl ?? null,
        targetFitnessCtl: targetFitness?.ctl ?? null,
        scheduledFitnessCtl: scheduledFitness?.ctl ?? null,
        fatigueAtl: scheduledFitness?.atl ?? fitness?.atl ?? null,
        formTsb: scheduledFitness?.tsb ?? fitness?.tsb ?? null,
      };
    }),
  });
}
