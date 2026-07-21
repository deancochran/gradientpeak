import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanEditor } from "../../../../components/training-plan/training-plan-editor";

export const Route = createFileRoute("/_protected/training-plans/$planId/edit")({
  component: EditTrainingPlanPage,
});

function EditTrainingPlanPage() {
  const { planId } = Route.useParams();
  return (
    <TrainingPlanEditor
      onSaved={(savedId) => window.location.replace(`/training-plans/${savedId}`)}
      planId={planId}
    />
  );
}
