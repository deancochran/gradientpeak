import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanDetail } from "../../../../components/training-plan/training-plan-detail";

export const Route = createFileRoute("/_protected/training-plans/$planId/")({
  component: TrainingPlanDetailPage,
});

function TrainingPlanDetailPage() {
  const { planId } = Route.useParams();
  return (
    <TrainingPlanDetail
      onDeleted={() => window.location.replace("/training-plans")}
      onEdit={() => window.location.assign(`/training-plans/${planId}/edit`)}
      onOpenDuplicate={(duplicateId) => window.location.replace(`/training-plans/${duplicateId}`)}
      planId={planId}
    />
  );
}
