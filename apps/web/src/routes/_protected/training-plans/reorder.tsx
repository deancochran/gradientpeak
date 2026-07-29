import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanActivityReorder } from "../../../components/training-plan/training-plan-activity-reorder";

export const Route = createFileRoute("/_protected/training-plans/reorder")({
  component: TrainingPlanActivityReorder,
});
