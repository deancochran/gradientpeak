import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanDetail } from "../../../../components/training-plan/training-plan-detail";

export const Route = createFileRoute("/_protected/training-plans/$planId/")({
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
          search: { q: undefined, tab: "owned" },
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
