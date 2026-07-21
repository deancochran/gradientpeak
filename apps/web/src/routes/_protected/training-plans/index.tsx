import { createFileRoute } from "@tanstack/react-router";

import { TrainingPlanLibrary } from "../../../components/training-plan/training-plan-library";

export const Route = createFileRoute("/_protected/training-plans/")({
  component: TrainingPlansPage,
});

function TrainingPlansPage() {
  return (
    <TrainingPlanLibrary
      onCreate={() => window.location.assign("/training-plans/create")}
      onOpen={(planId) => window.location.assign(`/training-plans/${planId}`)}
    />
  );
}
