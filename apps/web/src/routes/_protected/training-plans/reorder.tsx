import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanWorkoutReorder } from "../../../components/training-plan/training-plan-workout-reorder";

export const Route = createFileRoute("/_protected/training-plans/reorder")({
  component: TrainingPlanWorkoutReorder,
});
