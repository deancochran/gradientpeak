import { useMemo } from "react";
import type {
  TrainingPathFitnessPoint,
  TrainingPathLoadPoint,
  TrainingPathRange,
  TrainingPathSourceGoalMarker,
} from "./trainingPathTypes";
import { buildTrainingPathViewModel } from "./trainingPathUtils";

type UseTrainingPathViewModelParams = {
  timeline?: TrainingPathLoadPoint[] | null;
  fitnessHistory?: TrainingPathFitnessPoint[] | null;
  projectedFitness?: TrainingPathFitnessPoint[] | null;
  idealFitnessCurve?: TrainingPathFitnessPoint[] | null;
  goalMarkers?: TrainingPathSourceGoalMarker[] | null;
  selectedWeekStart?: string | null;
  range: TrainingPathRange;
  todayKey: string;
};

export function useTrainingPathViewModel(params: UseTrainingPathViewModelParams) {
  return useMemo(
    () =>
      buildTrainingPathViewModel({
        ...params,
        timeline: params.timeline ?? [],
        fitnessHistory: params.fitnessHistory ?? [],
        projectedFitness: params.projectedFitness ?? [],
        idealFitnessCurve: params.idealFitnessCurve ?? [],
        goalMarkers: params.goalMarkers ?? [],
      }),
    [
      params.fitnessHistory,
      params.goalMarkers,
      params.idealFitnessCurve,
      params.projectedFitness,
      params.range,
      params.selectedWeekStart,
      params.timeline,
      params.todayKey,
    ],
  );
}
