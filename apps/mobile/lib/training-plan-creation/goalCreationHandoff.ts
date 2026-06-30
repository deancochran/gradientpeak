import type { TrainingPlanCreationProfileGoalSnapshot } from "./service-types";

type Listener = (goal: TrainingPlanCreationProfileGoalSnapshot) => void;

const listeners = new Set<Listener>();

export function publishTrainingPlanGoalCreation(goal: TrainingPlanCreationProfileGoalSnapshot) {
  for (const listener of listeners) {
    listener(goal);
  }
}

export function subscribeToTrainingPlanGoalCreation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
