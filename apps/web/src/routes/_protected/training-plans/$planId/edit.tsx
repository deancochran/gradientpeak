import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanEditor } from "../../../../components/training-plan/training-plan-editor";

export const Route = createFileRoute("/_protected/training-plans/$planId/edit")({
  component: EditTrainingPlanPage,
});

function EditTrainingPlanPage() {
  const { planId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <TrainingPlanEditor
      onSaved={(savedId) =>
        void navigate({
          to: "/training-plans/$planId",
          params: { planId: savedId },
          replace: true,
        } as never)
      }
      planId={planId}
    />
  );
}
