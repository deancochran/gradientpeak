import {
  deriveTrainingPlanSchedulingPreview as deriveCoreTrainingPlanSchedulingPreview,
  diffDateOnlyUtcDays,
  type TrainingPlanSchedulingPreview,
} from "@repo/core";
import { getBuilderWeekdayIndex } from "./formatters";
import type { TrainingPlanBuilderState } from "./types";

function sessionLabel(session: TrainingPlanBuilderState["structure"]["sessions"][number]): string {
  return (
    session.eventOverrides?.title ?? session.activityPlan?.name ?? `Day ${session.offsetDays + 1}`
  );
}

export function deriveTrainingPlanSchedulingPreview(
  state: TrainingPlanBuilderState,
): TrainingPlanSchedulingPreview {
  const preview = deriveCoreTrainingPlanSchedulingPreview({
    startDate: state.scheduling.startDate,
    preferredWeekdays: [],
    sessionDateOverrides: state.scheduling.sessionDateOverrides,
    sessions: state.structure.sessions.map((session) => ({
      id: session.localId,
      label: sessionLabel(session),
      offsetDays: session.offsetDays,
      estimatedTss: session.activityPlan?.estimatedTss ?? null,
      intentType: session.intent?.type,
    })),
  });

  const preferredWeekdays = new Set(state.scheduling.preferredWeekdays);
  const sessions = preview.sessions.map((session) => {
    const relativeWeekday = getBuilderWeekdayIndex(
      diffDateOnlyUtcDays(state.scheduling.startDate, session.date),
    );
    const conflictCodes = [...session.conflictCodes];

    if (preferredWeekdays.size > 0 && !preferredWeekdays.has(relativeWeekday)) {
      conflictCodes.push("non_preferred_day");
    }

    return {
      ...session,
      weekday: relativeWeekday,
      conflictCodes,
    };
  });

  return {
    ...preview,
    checks: [
      ...preview.checks,
      ...sessions
        .filter((session) => session.conflictCodes.includes("non_preferred_day"))
        .map((session) => ({
          code: "non_preferred_day" as const,
          sessionId: session.id,
          weekIndex: session.weekIndex,
          message: `${session.label} lands outside preferred training days.`,
        })),
    ],
    sessions,
    weeks: preview.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map(
        (weekSession) => sessions.find((session) => session.id === weekSession.id) ?? weekSession,
      ),
    })),
  };
}

export type { TrainingPlanSchedulingPreview };
