import { useMemo } from "react";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

export function useStrategyComposerController(controller: TrainingPlanBuilderController) {
  const { builder } = controller;
  const { strategy } = builder.derived.viewModel;
  const { openSheet } = controller.sheetStack;

  return useMemo(
    () => ({
      chartReview: controller.chartReview,
      saveReadiness: builder.derived.savePlan.readiness,
      state: strategy.state,
      planningBriefRows: strategy.viewModel.planningBriefRows,
      onAddActivity: controller.actions.addSession,
      onEditMetadata: () => openSheet("metadata"),
      onOpenAthleteContext: () => openSheet("athleteContext"),
      onOpenGoals: () => openSheet("goals"),
      onOpenPlanningConstraints: () => openSheet("preferences"),
    }),
    [
      controller.chartReview,
      builder.derived.savePlan.readiness,
      controller.actions.addSession,
      openSheet,
      strategy,
    ],
  );
}
