import {
  deriveTrainingPlanSchedulingPreview as deriveCoreTrainingPlanSchedulingPreview,
  type TrainingPlanSchedulingPreview,
} from "@repo/core";
import type { TrainingPlanBuilderState } from "./types";

function sessionLabel(session: TrainingPlanBuilderState["structure"]["sessions"][number]): string {
  return (
    session.eventOverrides?.title ?? session.activityPlan?.name ?? `Day ${session.offsetDays + 1}`
  );
}

export function deriveTrainingPlanSchedulingPreview(
  state: TrainingPlanBuilderState,
): TrainingPlanSchedulingPreview {
  return deriveCoreTrainingPlanSchedulingPreview({
    startDate: state.scheduling.startDate,
    preferredWeekdays: state.scheduling.preferredWeekdays,
    sessionDateOverrides: state.scheduling.sessionDateOverrides,
    sessions: state.structure.sessions.map((session) => ({
      id: session.localId,
      label: sessionLabel(session),
      offsetDays: session.offsetDays,
      estimatedTss: session.activityPlan?.estimatedTss ?? null,
      intentType: session.intent?.type,
    })),
  });
}

export type { TrainingPlanSchedulingPreview };
