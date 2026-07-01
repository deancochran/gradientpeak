import { useMemo } from "react";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

export function useStrategyComposerController(controller: TrainingPlanBuilderController) {
  const { builder } = controller;
  const { strategy } = builder.derived.viewModel;
  const { openSheet } = controller.sheetStack;

  return useMemo(
    () => ({
      chartReview: controller.chartReview,
      savePlan: builder.derived.savePlan,
      state: strategy.state,
      onEditMetadata: () => openSheet("metadata"),
      onOpenAthleteContext: () => openSheet("athleteContext"),
      onOpenGoals: () => openSheet("goals"),
      onOpenPlanningConstraints: () => openSheet("preferences"),
    }),
    [builder.derived.savePlan, controller.chartReview, openSheet, strategy.state],
  );
}
