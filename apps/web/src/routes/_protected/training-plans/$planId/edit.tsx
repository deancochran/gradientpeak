import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanEditor } from "../../../../components/training-plan/training-plan-editor";
import { loadRouteQuery } from "../../../../lib/api/route-loading";

export const Route = createFileRoute("/_protected/training-plans/$planId/edit")({
  loader: ({ context, params }) => {
    const input = { id: params.planId };
    return loadRouteQuery(
      () => context.apiUtils.trainingPlans.get.getData(input),
      () => context.apiUtils.trainingPlans.get.fetch(input),
    );
  },
  component: EditTrainingPlanPage,
});

function EditTrainingPlanPage() {
  const { planId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <TrainingPlanEditor
      onCancel={() => void navigate({ to: "/training-plans/$planId", params: { planId } })}
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
