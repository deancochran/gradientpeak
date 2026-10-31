import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanEditor } from "../../../components/training-plan/training-plan-editor";

export const Route = createFileRoute("/_protected/training-plans/create")({
  component: CreateTrainingPlanPage,
});

function CreateTrainingPlanPage() {
  const navigate = Route.useNavigate();
  return (
    <TrainingPlanEditor
      onCancel={() => void navigate({ to: "/training-plans", search: { q: undefined } })}
      onSaved={(planId) =>
        void navigate({
          to: "/training-plans/$planId",
          params: { planId },
          replace: true,
        } as never)
      }
    />
  );
}
