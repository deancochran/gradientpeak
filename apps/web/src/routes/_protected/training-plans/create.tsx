import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanEditor } from "../../../components/training-plan/training-plan-editor";

export const Route = createFileRoute("/_protected/training-plans/create")({
  component: CreateTrainingPlanPage,
});

function CreateTrainingPlanPage() {
  return (
    <TrainingPlanEditor
      onSaved={(planId) => window.location.replace(`/training-plans/${planId}`)}
    />
  );
}
