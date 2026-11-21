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
      onOpenAthleteContext: () => openSheet("athleteContext"),
      onUpdateDetails: (details: { name: string; description: string }) =>
        builder.actions.updateDetails({
          ...details,
          contentVisibility: builder.state.details.contentVisibility,
        }),
      onOpenGoals: () => openSheet("goals"),
      onUpdateVisibility: (contentVisibility: typeof builder.state.details.contentVisibility) =>
        builder.actions.updateDetails({ ...builder.state.details, contentVisibility }),
      onOpenPlanningConstraints: () => openSheet("preferences"),
      showEditConfiguration: controller.mode === "edit",
    }),
    [
      controller.chartReview,
      controller.mode,
      builder.derived.savePlan.readiness,
      controller.actions.addSession,
      builder.actions.updateDetails,
      builder.state.details,
      openSheet,
      strategy,
    ],
  );
}
