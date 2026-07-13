import { useCallback, useMemo } from "react";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import type { BuilderViewModelTarget } from "@/lib/training-plan-creation/view-model";

export function useStrategyComposerController(controller: TrainingPlanBuilderController) {
  const { builder } = controller;
  const { strategy } = builder.derived.viewModel;
  const { openSheet } = controller.sheetStack;

  const openTarget = useCallback(
    (target: BuilderViewModelTarget) => {
      if (target.type === "session") {
        controller.selection.setSessionId(target.sessionId);
        openSheet("session");
        return;
      }
      if (target.type === "week") {
        const week = controller.chartReview.chart.weeks[target.weekIndex];
        if (week) controller.chartReview.selectWeekStart(week.weekStart);
        return;
      }
      if (target.type === "goals") openSheet("goals");
      if (target.type === "athleteContext") openSheet("athleteContext");
      if (target.type === "addSession") controller.actions.addSession();
    },
    [controller.actions, controller.chartReview, controller.selection, openSheet],
  );

  return useMemo(
    () => ({
      chartReview: controller.chartReview,
      savePlan: builder.derived.savePlan,
      state: strategy.state,
      modules: builder.derived.modules,
      planChecks: strategy.viewModel.planCheckRows,
      timelineWeeks: strategy.viewModel.timelineWeeks,
      onOpenTarget: openTarget,
      onEditMetadata: () => openSheet("metadata"),
      onOpenAthleteContext: () => openSheet("athleteContext"),
      onOpenGoals: () => openSheet("goals"),
      onOpenPlanningConstraints: () => openSheet("preferences"),
    }),
    [
      builder.derived.modules,
      builder.derived.savePlan,
      controller.chartReview,
      openSheet,
      openTarget,
      strategy,
    ],
  );
}
