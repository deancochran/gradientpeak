import type { TrainingPlanBuilderSession, TrainingPlanBuilderState } from "./types";

export type BuilderPlanningBriefRowViewModel = {
  key: "athleteContext" | "goals" | "planningConstraints" | "schedulePreview";
  label: string;
  value: string;
  detail: string;
};

export type BuilderTimelineSessionViewModel = {
  session: TrainingPlanBuilderSession;
  dayIndex: number;
  dayLabel: string;
  title: string;
  estimatedCommonLoad: number;
  assigned: boolean;
};

export type BuilderTimelineWeekViewModel = {
  weekIndex: number;
  label: string;
  sessions: BuilderTimelineSessionViewModel[];
};

export type BuilderPlanPresentation = {
  sessions: TrainingPlanBuilderSession[];
  timelineWeeks: BuilderTimelineWeekViewModel[];
  planningBriefRows: BuilderPlanningBriefRowViewModel[];
};

export function deriveBuilderPlanPresentation(
  state: TrainingPlanBuilderState,
): BuilderPlanPresentation {
  const sessions = [...state.structure.sessions].sort(
    (left, right) =>
      left.offsetDays - right.offsetDays || left.localId.localeCompare(right.localId),
  );
  const weekIndexes = Array.from(
    new Set(sessions.map((session) => Math.floor(session.offsetDays / 7))),
  ).sort((left, right) => left - right);
  const timelineWeeks = weekIndexes.map((weekIndex) => ({
    weekIndex,
    label: `Week ${weekIndex + 1}`,
    sessions: sessions
      .filter((session) => Math.floor(session.offsetDays / 7) === weekIndex)
      .map((session) => ({
        session,
        dayIndex: session.offsetDays,
        dayLabel: `Day ${session.offsetDays + 1}`,
        title:
          session.eventOverrides?.title ??
          session.activityPlan?.name ??
          `Day ${session.offsetDays + 1}`,
        estimatedCommonLoad: 0,
        assigned: session.activityPlan !== null,
      })),
  }));
  const preferenceCount = Object.values(state.planPreferences).filter(
    (value) => value !== null && value !== undefined,
  ).length;
  const goalCount = state.goalContext.selectedGoals.length;
  const weekCount = timelineWeeks.length;

  return {
    sessions,
    timelineWeeks,
    planningBriefRows: [
      {
        key: "athleteContext",
        label: "Athlete context",
        value:
          state.athleteContext.evidence.metricCount > 0
            ? `${state.athleteContext.evidence.metricCount} metrics`
            : "Defaults",
        detail: "Published athlete context plus your entered values.",
      },
      {
        key: "goals",
        label: "Goals",
        value: goalCount === 0 ? "No goals selected" : `${goalCount} selected`,
        detail: "Goals included in the canonical server preview.",
      },
      {
        key: "planningConstraints",
        label: "Preferences",
        value: preferenceCount === 0 ? "Defaults" : `${preferenceCount} configured`,
        detail: "Preferences submitted with the plan.",
      },
      {
        key: "schedulePreview",
        label: "Schedule",
        value:
          sessions.length === 0
            ? "No activities"
            : `${sessions.length} activities · ${weekCount} week${weekCount === 1 ? "" : "s"}`,
        detail: "Calendar dates are materialized only by the authoritative commit flow.",
      },
    ],
  };
}
