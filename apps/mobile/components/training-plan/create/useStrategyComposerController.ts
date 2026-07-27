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
      canUseStructureProposal: strategy.canUseStructureProposal,
      onAddWorkout: controller.actions.addSession,
      onApplyStructureProposal: controller.actions.applyStructureProposal,
      onEditMetadata: () => openSheet("metadata"),
      onOpenAthleteContext: () => openSheet("athleteContext"),
      onOpenGoals: () => openSheet("goals"),
      onOpenPlanningConstraints: () => openSheet("preferences"),
      onOpenSchedulePreview: () => openSheet("schedulePreview"),
    }),
    [
      controller.chartReview,
      builder.derived.savePlan.readiness,
      controller.actions.addSession,
      controller.actions.applyStructureProposal,
      openSheet,
      strategy,
    ],
  );
}
