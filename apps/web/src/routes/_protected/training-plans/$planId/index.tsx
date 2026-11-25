import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanDetail } from "../../../../components/training-plan/training-plan-detail";
import { loadRouteQuery } from "../../../../lib/api/route-loading";

export const Route = createFileRoute("/_protected/training-plans/$planId/")({
  loader: ({ context, params }) => {
    const input = { id: params.planId };
    return loadRouteQuery(
      () => context.apiUtils.trainingPlans.get.getData(input),
      () => context.apiUtils.trainingPlans.get.fetch(input),
    );
  },
  component: TrainingPlanDetailPage,
});

function TrainingPlanDetailPage() {
  const { planId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <TrainingPlanDetail
      onDeleted={() =>
        void navigate({
          to: "/training-plans",
          search: { tab: "owned" },
          replace: true,
        })
      }
      onEdit={() =>
        void navigate({ to: "/training-plans/$planId/edit", params: { planId } } as never)
      }
      onOpenDuplicate={(duplicateId) =>
        void navigate({
          to: "/training-plans/$planId",
          params: { planId: duplicateId },
          replace: true,
        } as never)
      }
      planId={planId}
    />
  );
}
