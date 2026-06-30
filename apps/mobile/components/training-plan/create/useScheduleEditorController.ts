import { derivePlannedTrainingSessionEstimate } from "@repo/core";
import { useMemo } from "react";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

export function useScheduleEditorController(controller: TrainingPlanBuilderController) {
  const { builder } = controller;
  const { schedule } = builder.derived.viewModel;
  const { openSheet } = controller.sheetStack;
  const { actions, selection } = controller;
  const activityPlansById = useMemo(
    () =>
      Object.fromEntries(
        builder.activityPlanItems.map((activityPlan) => [activityPlan.id, activityPlan] as const),
      ),
    [builder.activityPlanItems],
  );
  const estimateBySessionId = useMemo(
    () =>
      new Map(
        schedule.viewModel.sessions.flatMap((session) => {
          const estimate = derivePlannedTrainingSessionEstimate({
            activityPlansById,
            athleteContext: builder.state.athleteContext,
            session,
          });
          return estimate ? [[session.localId, estimate] as const] : [];
        }),
      ),
    [activityPlansById, builder.state.athleteContext, schedule.viewModel.sessions],
  );

  return useMemo(
    () => ({
      viewModel: schedule.viewModel,
      chartReview: controller.chartReview,
      estimateBySessionId,
      onAddSessionAtOffset: actions.addSessionAtOffset,
      onDuplicateSession: (sessionId: string) => {
        const session = builder.actions.duplicateSession(sessionId);
        if (session) {
          selection.setSessionId(session.localId);
        }
      },
      onMoveSessionByDays: (sessionId: string, days: number) => {
        const session = builder.actions.getSessionById(sessionId);
        if (!session) return;
        builder.actions.updateSession({
          ...session,
          offsetDays: Math.max(0, session.offsetDays + days),
        });
      },
      onPressSession: (sessionId: string) => {
        selection.setSessionId(sessionId);
        openSheet("session");
      },
      onRemoveSession: (sessionId: string) => {
        builder.actions.removeSession(sessionId);
        if (selection.sessionId === sessionId) {
          selection.setSessionId(null);
        }
      },
    }),
    [
      actions.addSessionAtOffset,
      builder.actions,
      controller.chartReview,
      estimateBySessionId,
      openSheet,
      schedule.viewModel,
      selection,
    ],
  );
}
