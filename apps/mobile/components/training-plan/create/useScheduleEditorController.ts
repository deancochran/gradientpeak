import { copyTrainingPlanWeek, summarizeTrainingPlanWeek } from "@repo/core";
import { randomUUID } from "expo-crypto";
import { useMemo } from "react";
import { Alert } from "react-native";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

export function useScheduleEditorController(controller: TrainingPlanBuilderController) {
  const { builder } = controller;
  const { schedule } = builder.derived.viewModel;
  const { actions, selection, sheetStack } = controller;
  const focusedSession =
    builder.state.selection.type === "session"
      ? builder.actions.getSessionById(builder.state.selection.sessionId)
      : null;
  // Preview estimates are resolver-owned and returned by the authoritative API preview.
  const estimateBySessionId = useMemo(() => new Map(), []);
  const canonicalSessions = builder.state.structure.sessions.map((session) => ({
    id: session.id,
    offset_days: session.offsetDays,
    demand: session.demand,
    activity_plan_id: session.activityPlan?.id ?? null,
    ...(session.eventOverrides ? { event_overrides: session.eventOverrides } : {}),
  }));
  const weekSummary = Object.entries(
    summarizeTrainingPlanWeek({
      sessions: canonicalSessions,
      weekIndex: controller.chartReview.selectedWeekIndex,
    }),
  )
    .filter(([, summary]) => summary.sessionCount > 0)
    .map(
      ([category, summary]) =>
        `${category} ${summary.knownDurationMinutes} min${summary.unknownDurationSessionCount ? ` + ${summary.unknownDurationSessionCount} unknown` : ""}`,
    )
    .join(" · ");

  return useMemo(
    () => ({
      viewModel: schedule.viewModel,
      ...(focusedSession ? { focusOffsetDays: focusedSession.offsetDays } : {}),
      chartReview: controller.chartReview,
      creationChart: controller.mode === "create" ? controller.creationChart : undefined,
      estimateBySessionId,
      weekSummary,
      onAddSessionAtOffset: actions.addSessionAtOffset,
      onCopyWeek: (sourceWeekIndex: number, destinationWeekIndex: number) => {
        const result = copyTrainingPlanWeek({
          sessions: canonicalSessions,
          sourceWeekIndex,
          destinationWeekIndex,
          createId: randomUUID,
        });
        if (result.status !== "copied") {
          Alert.alert("Week couldn’t be copied", "This plan has reached its activity limit.");
          return;
        }
        for (const session of builder.state.structure.sessions) {
          if (Math.floor(session.offsetDays / 7) === sourceWeekIndex) {
            builder.actions.duplicateSession(
              session.localId,
              destinationWeekIndex * 7 + (session.offsetDays % 7),
            );
          }
        }
      },
      onDuplicateSession: (sessionId: string) => {
        const session = builder.actions.duplicateSession(sessionId);
        if (session) {
          selection.setSessionId(session.localId);
          sheetStack.openSheet("session");
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
        builder.actions.selectSession(sessionId);
        selection.setSessionId(sessionId);
        sheetStack.openSheet("session");
      },
      onRemoveSession: actions.confirmRemoveSession,
    }),
    [
      actions.addSessionAtOffset,
      focusedSession,
      actions.confirmRemoveSession,
      builder.actions,
      canonicalSessions,
      controller.chartReview,
      controller.creationChart,
      controller.mode,
      estimateBySessionId,
      schedule.viewModel,
      selection,
      sheetStack.openSheet,
      weekSummary,
      builder.state.structure.sessions,
    ],
  );
}
