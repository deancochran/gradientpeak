import {
  addDaysDateOnlyUtc,
  buildDailyTssByDateSeries,
  replayTrainingLoadByDate,
  type TrainingPlanCreationPreview,
} from "@repo/core";
import type { DailyTrainingAdjustmentPoint } from "@/lib/training-path/dailyTrainingPathModel";
import {
  BUILDER_WEEKDAY_LABELS,
  formatBuilderGender,
  formatBuilderGoalOffsetDetail,
  formatBuilderNumberWithUnit,
  formatBuilderSessionTitle,
  formatBuilderWeekdayWithWeek,
  formatBuilderWeekLabel,
  getBuilderWeekdayIndex,
} from "./formatters";
import { selectBuilderGoalBlueprints } from "./selectors";
import type { TrainingPlanBuilderSession, TrainingPlanBuilderState } from "./types";

export type BuilderViewModelTarget =
  | { type: "addSession" }
  | { type: "athleteContext" }
  | { type: "goals" }
  | { type: "session"; sessionId: string }
  | { type: "week"; weekIndex: number };

export interface BuilderPlanningBriefRowViewModel {
  key: "athleteContext" | "goals" | "planningConstraints" | "schedulePreview";
  label: string;
  value: string;
  detail: string;
}

export interface BuilderSessionCanvasRowViewModel {
  session: TrainingPlanBuilderSession;
  dayLabel: string;
  heightPercent: number;
  assigned: boolean;
}

export interface BuilderWeeklyCanvasRowViewModel {
  weekIndex: number;
  assignedSessionCount: number;
  sessionCount: number;
  estimatedTss: number;
  estimatedDurationSeconds: number;
  tssBarPercent: number;
  recommendedTssMarkerPercent: number | null;
  targetDeltaLabel: string | null;
}

export interface BuilderTimelineSessionViewModel {
  session: TrainingPlanBuilderSession;
  dayIndex: number;
  dayLabel: string;
  title: string;
  estimatedTss: number;
  assigned: boolean;
}

export interface BuilderTimelineGoalMarkerViewModel {
  key: string;
  title: string;
  dayIndex: number;
}

export interface BuilderTimelineWeekViewModel {
  weekIndex: number;
  label: string;
  phaseLabel: "Base" | "Build" | "Peak" | "Taper";
  estimatedTss: number;
  plannedLoadPercent: number;
  recommendedLoadPercent: number | null;
  recommendedTss: number | null;
  targetDeltaLabel: string | null;
  sessions: BuilderTimelineSessionViewModel[];
  goals: BuilderTimelineGoalMarkerViewModel[];
}

type BuilderDailyTrainingPathWeek = {
  weekStart: string;
  weekEnd: string;
  label: string;
  completedLoad: number | null;
  plannedLoad: number | null;
  tentativePlannedLoad: number | null;
  targetLoad: number | null;
  fitness: number | null;
  scheduledFitness: number | null;
  targetFitness: number | null;
  fatigue: number | null;
  form: number | null;
  riskZone: null;
  isCurrent: boolean;
  isSelected: boolean;
};

export interface BuilderDailyTrainingPathChartViewModel {
  dailyPoints: DailyTrainingAdjustmentPoint[];
  weeks: BuilderDailyTrainingPathWeek[];
  selectedWeekSummary: null;
  goalMarkers: Array<{ id: string; label: string; targetDate: string; weekStart: string }>;
  todayKey: string;
  domains: {
    load: [number, number];
    fitness: [number, number];
  };
  emptyState: null;
}

export interface BuilderRecommendedLoadViewModel {
  weeklyTss: number;
  rangeMinTss: number;
  rangeMaxTss: number;
  baselineWeeklyTss: number | null;
  plannedAverageTss: number;
  markerPercent: number;
  label: string;
  guidance: string;
  sourceLabel: string;
  loadDeltaLabel: string | null;
  status: "below" | "on_track" | "above" | "needs_sessions";
}

export interface BuilderPlanCheckRowViewModel {
  key: string;
  message: string;
  target: BuilderViewModelTarget | null;
}

export interface BuilderActionRecommendationViewModel {
  key: string;
  label: string;
  detail: string;
  target: BuilderViewModelTarget | null;
}

export interface BuilderCurrentBaselineViewModel {
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  sourceLabel: string;
  summaryLabel: string;
  detail: string;
  target: BuilderViewModelTarget;
}

export interface BuilderGoalSupportViewModel {
  id: string;
  title: string;
  role: "Primary" | "Secondary" | "Maintenance";
  targetDateLabel: string | null;
  supportLevel: "Strong" | "Moderate" | "Weak" | "Unsupported";
  detail: string;
}

export interface BuilderPlanHealthItemViewModel {
  key: string;
  status: "ok" | "warning" | "risk";
  label: string;
  detail: string;
}

export interface BuilderStrategyInsightViewModel {
  key: string;
  severity: "info" | "warning" | "risk";
  title: string;
  detail: string;
  target: BuilderViewModelTarget | null;
}

export interface BuilderStrategyViewModel {
  goals: BuilderGoalSupportViewModel[];
  planHealth: BuilderPlanHealthItemViewModel[];
  insights: BuilderStrategyInsightViewModel[];
  readiness: {
    label: string;
    status: "strong" | "moderate" | "weak" | "unknown";
    detail: string;
  };
}

export interface BuilderPlanCreationViewModel {
  sessions: TrainingPlanBuilderSession[];
  latestOffsetDays: number;
  durationDays: number;
  assignedSessionCount: number;
  totalEstimatedTss: number;
  totalEstimatedDurationSeconds: number;
  goalCount: number;
  firstUnassignedSession: TrainingPlanBuilderSession | null;
  firstCheck: TrainingPlanCreationPreview["checks"][number] | null;
  nextBestAction: {
    text: string;
    target: BuilderViewModelTarget | null;
    needsAttention: boolean;
  };
  actionRecommendations: BuilderActionRecommendationViewModel[];
  currentBaseline: BuilderCurrentBaselineViewModel;
  planningBriefRows: BuilderPlanningBriefRowViewModel[];
  recommendedLoad: BuilderRecommendedLoadViewModel | null;
  dailyTrainingPathChart: BuilderDailyTrainingPathChartViewModel;
  sessionCanvasRows: BuilderSessionCanvasRowViewModel[];
  timelineWeeks: BuilderTimelineWeekViewModel[];
  weeklyCanvasRows: BuilderWeeklyCanvasRowViewModel[];
  planCheckRows: BuilderPlanCheckRowViewModel[];
  strategy: BuilderStrategyViewModel;
}

export function deriveBuilderPlanCreationViewModel({
  creationPreview,
  state,
}: {
  creationPreview?: TrainingPlanCreationPreview;
  state: TrainingPlanBuilderState;
}): BuilderPlanCreationViewModel {
  const sessions = [...state.structure.sessions].sort((left, right) => {
    if (left.offsetDays === right.offsetDays) {
      return left.localId.localeCompare(right.localId);
    }
    return left.offsetDays - right.offsetDays;
  });
  const latestOffsetDays = sessions.reduce(
    (latest, session) => Math.max(latest, session.offsetDays),
    -1,
  );
  const totalEstimatedTss =
    creationPreview?.totalEstimatedTss ??
    sessions.reduce((total, session) => total + (session.activityPlan?.estimatedTss ?? 0), 0);
  const totalEstimatedDurationSeconds =
    creationPreview?.totalEstimatedDurationSeconds ??
    sessions.reduce(
      (total, session) => total + (session.activityPlan?.estimatedDurationSeconds ?? 0),
      0,
    );
  const assignedSessionCount = sessions.filter((session) => session.activityPlan !== null).length;
  const goalCount = selectBuilderGoalBlueprints(state).length;
  const durationDays = latestOffsetDays >= 0 ? latestOffsetDays + 1 : 0;
  const maxTss = sessions.reduce(
    (max, session) => Math.max(max, session.activityPlan?.estimatedTss ?? 0),
    0,
  );
  const firstUnassignedSession = sessions.find((session) => session.activityPlan === null) ?? null;
  const firstCheck = creationPreview?.checks[0] ?? null;
  const nextBestAction = deriveNextBestAction({ firstCheck, firstUnassignedSession, sessions });
  const currentBaseline = deriveCurrentBaseline(state);
  const recommendedLoad = deriveRecommendedLoad({ creationPreview, currentBaseline, state });
  const checkTargetFallback = firstUnassignedSession
    ? toSessionTarget(firstUnassignedSession.localId)
    : null;
  const planCheckRows = (creationPreview?.checks ?? []).slice(0, 3).map((check) => ({
    key: `${check.code}-${check.weekIndex ?? "all"}`,
    message: check.message,
    target: checkTargetFallback ?? toWeekTarget(check.weekIndex),
  }));

  return {
    sessions,
    latestOffsetDays,
    durationDays,
    assignedSessionCount,
    totalEstimatedTss,
    totalEstimatedDurationSeconds,
    goalCount,
    firstUnassignedSession,
    firstCheck,
    nextBestAction,
    actionRecommendations: deriveActionRecommendations({
      currentBaseline,
      firstUnassignedSession,
      recommendedLoad,
      sessions,
      state,
    }),
    currentBaseline,
    planningBriefRows: [
      {
        key: "athleteContext",
        label: "Athlete context",
        value: getAthleteContextSummary(state),
        detail: "Using your current profile unless you override it",
      },
      {
        key: "goals",
        label: "Plan goals",
        value: getGoalSummary(state),
        detail: getGoalDetail(state),
      },
      {
        key: "planningConstraints",
        label: "Preferences",
        value: getConstraintSummary(state),
        detail: hasCustomConstraints(state)
          ? "Custom planning inputs"
          : "Builder will derive structure",
      },
      {
        key: "schedulePreview",
        label: "Schedule",
        value: getScheduleSummary(state),
        detail: "Preview dates only; saved plan stays reusable",
      },
    ],
    recommendedLoad,
    dailyTrainingPathChart: deriveDailyTrainingPathChart({ recommendedLoad, sessions, state }),
    sessionCanvasRows: sessions.map((session) => {
      const tss = session.activityPlan?.estimatedTss ?? 0;
      return {
        session,
        dayLabel: `${session.offsetDays + 1}`,
        heightPercent: maxTss > 0 ? Math.max(24, Math.round((tss / maxTss) * 100)) : 24,
        assigned: session.activityPlan !== null,
      };
    }),
    timelineWeeks: deriveTimelineWeeks({ creationPreview, recommendedLoad, sessions, state }),
    weeklyCanvasRows: (creationPreview?.weeks ?? []).slice(0, 6).map((week) => {
      const scale = recommendedLoad ? Math.max(700, recommendedLoad.rangeMaxTss * 1.15) : 700;
      return {
        weekIndex: week.weekIndex,
        assignedSessionCount: week.assignedSessionCount,
        sessionCount: week.sessionCount,
        estimatedTss: week.estimatedTss,
        estimatedDurationSeconds: week.estimatedDurationSeconds,
        tssBarPercent: Math.min(100, Math.max(6, Math.round((week.estimatedTss / scale) * 100))),
        recommendedTssMarkerPercent: recommendedLoad
          ? Math.min(100, Math.max(6, Math.round((recommendedLoad.weeklyTss / scale) * 100)))
          : null,
        targetDeltaLabel: recommendedLoad
          ? formatTargetDelta(week.estimatedTss, recommendedLoad)
          : null,
      };
    }),
    planCheckRows,
    strategy: deriveStrategyViewModel({
      creationPreview,
      firstUnassignedSession,
      planCheckRows,
      recommendedLoad,
      sessions,
      state,
    }),
  };
}

function deriveDailyTrainingPathChart({
  recommendedLoad,
  sessions,
  state,
}: {
  recommendedLoad: BuilderRecommendedLoadViewModel | null;
  sessions: TrainingPlanBuilderSession[];
  state: TrainingPlanBuilderState;
}): BuilderDailyTrainingPathChartViewModel {
  const goals = selectBuilderGoalBlueprints(state);
  const lastSessionOffset = sessions.reduce((max, session) => Math.max(max, session.offsetDays), 0);
  const lastGoalOffset = goals.reduce(
    (max, goal) => (goal.targetOffsetDays !== null ? Math.max(max, goal.targetOffsetDays) : max),
    0,
  );
  const durationDays = Math.max(
    7,
    state.planPreferences.durationWeeks ? state.planPreferences.durationWeeks * 7 : 0,
    lastSessionOffset + 1,
    lastGoalOffset + 1,
  );
  const startDate = state.scheduling.startDate;
  const endDate = addDaysDateOnlyUtc(startDate, durationDays - 1);
  const plannedTssByDate = new Map<string, number>();
  for (const session of sessions) {
    const date = addDaysDateOnlyUtc(startDate, session.offsetDays);
    plannedTssByDate.set(
      date,
      (plannedTssByDate.get(date) ?? 0) + (session.activityPlan?.estimatedTss ?? 0),
    );
  }
  const targetTssByDate = buildRecommendedTssByDate({
    durationDays,
    recommendedWeeklyTss: recommendedLoad?.weeklyTss ?? 0,
    sessions,
    state,
  });
  const plannedSeries = buildDailyTssByDateSeries({
    startDate,
    endDate,
    tssByDate: plannedTssByDate,
  });
  const targetSeries = buildDailyTssByDateSeries({
    startDate,
    endDate,
    tssByDate: targetTssByDate,
  });
  const initialCTL = state.athleteContext.physiology.currentFitnessCtl.value ?? 0;
  const initialATL = state.athleteContext.physiology.currentFatigueAtl.value ?? 0;
  const plannedFitness = replayTrainingLoadByDate({
    dailyTss: plannedSeries,
    initialATL,
    initialCTL,
  });
  const idealFitness = replayTrainingLoadByDate({
    dailyTss: targetSeries,
    initialATL,
    initialCTL,
  });
  const fitnessValues = [...plannedFitness, ...idealFitness].map((point) => point.ctl);
  const maxLoad = Math.max(
    50,
    ...plannedSeries.map((point) => point.tss),
    ...targetSeries.map((point) => point.tss),
  );
  const maxFitness = Math.max(10, ...fitnessValues);

  const dailyPoints = plannedSeries.map((plannedPoint, index) => {
    const targetPoint = targetSeries[index];
    const plannedFitnessPoint = plannedFitness[index];
    const idealFitnessPoint = idealFitness[index];
    const plannedLoadTss = Math.round(plannedPoint.tss);
    const targetLoadTss = Math.round(targetPoint?.tss ?? 0);
    return {
      date: plannedPoint.date,
      plannedLoadTss,
      tentativePlannedLoadTss: 0,
      completedLoadTss: 0,
      targetLoadTss,
      actualOrScheduledLoadTss: plannedLoadTss,
      loadDeltaTss: plannedLoadTss - targetLoadTss,
      plannedDeltaTss: plannedLoadTss - targetLoadTss,
      fitnessCtl: null,
      scheduledFitnessCtl: plannedFitnessPoint ? round1(plannedFitnessPoint.ctl) : null,
      targetFitnessCtl: idealFitnessPoint ? round1(idealFitnessPoint.ctl) : null,
      fatigueAtl: plannedFitnessPoint ? round1(plannedFitnessPoint.atl) : null,
      formTsb: plannedFitnessPoint ? round1(plannedFitnessPoint.tsb) : null,
      readinessScore: null,
      annotations: [],
    } satisfies DailyTrainingAdjustmentPoint;
  });

  return {
    dailyPoints,
    weeks: Array.from({ length: Math.ceil(plannedSeries.length / 7) }).map((_, weekIndex) => {
      const startIndex = weekIndex * 7;
      const endIndex = Math.min(startIndex + 7, plannedSeries.length);
      const weekPlannedSeries = plannedSeries.slice(startIndex, endIndex);
      const weekTargetSeries = targetSeries.slice(startIndex, endIndex);
      const lastFitnessIndex = Math.max(startIndex, endIndex - 1);
      const weekStart = addDaysDateOnlyUtc(startDate, startIndex);
      const weekEnd = addDaysDateOnlyUtc(startDate, endIndex - 1);
      const idealPoint = idealFitness[lastFitnessIndex];
      const plannedPoint = plannedFitness[lastFitnessIndex];
      return {
        weekStart,
        weekEnd,
        label: formatBuilderWeekLabel(weekIndex),
        completedLoad: null,
        plannedLoad: Math.round(weekPlannedSeries.reduce((sum, point) => sum + point.tss, 0)),
        tentativePlannedLoad: null,
        targetLoad: Math.round(weekTargetSeries.reduce((sum, point) => sum + point.tss, 0)),
        fitness: null,
        scheduledFitness: plannedPoint ? round1(plannedPoint.ctl) : null,
        targetFitness: idealPoint ? round1(idealPoint.ctl) : null,
        fatigue: plannedPoint ? round1(plannedPoint.atl) : null,
        form: plannedPoint ? round1(plannedPoint.tsb) : null,
        riskZone: null,
        isCurrent: weekIndex === 0,
        isSelected: weekIndex === 0,
      };
    }),
    selectedWeekSummary: null,
    goalMarkers: goals.flatMap((goal) => {
      if (goal.targetOffsetDays === null) return [];
      const targetDate = addDaysDateOnlyUtc(startDate, goal.targetOffsetDays);
      return [{ id: goal.localId, label: goal.title, targetDate, weekStart: targetDate }];
    }),
    todayKey: startDate,
    domains: {
      load: [0, Math.ceil(maxLoad * 1.2)],
      fitness: [0, Math.ceil(maxFitness * 1.2)],
    },
    emptyState: null,
  };
}

function buildRecommendedTssByDate({
  durationDays,
  recommendedWeeklyTss,
  sessions,
  state,
}: {
  durationDays: number;
  recommendedWeeklyTss: number;
  sessions: TrainingPlanBuilderSession[];
  state: TrainingPlanBuilderState;
}) {
  const targetTssByDate = new Map<string, number>();
  if (recommendedWeeklyTss <= 0 || durationDays <= 0) return targetTssByDate;

  const preferredWeekdays = new Set(state.scheduling.preferredWeekdays);
  const weeklySessionCount = state.planPreferences.weeklySessionCount;
  const weekCount = Math.ceil(durationDays / 7);
  const sessionWeekdaysByWeek = new Map<number, Set<number>>();
  for (const session of sessions) {
    if (session.offsetDays < 0 || session.offsetDays >= durationDays) continue;
    const weekIndex = Math.floor(session.offsetDays / 7);
    const weekdays = sessionWeekdaysByWeek.get(weekIndex) ?? new Set<number>();
    weekdays.add(getBuilderWeekdayIndex(session.offsetDays));
    sessionWeekdaysByWeek.set(weekIndex, weekdays);
  }

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const weekStartOffset = weekIndex * 7;
    const daysInWeek = Math.min(7, durationDays - weekStartOffset);
    const trainingWeekdays = new Set<number>([
      ...preferredWeekdays,
      ...(sessionWeekdaysByWeek.get(weekIndex) ?? []),
    ]);
    if (trainingWeekdays.size === 0 && weeklySessionCount && weeklySessionCount > 0) {
      for (let weekday = 0; weekday < Math.min(7, weeklySessionCount); weekday += 1) {
        trainingWeekdays.add(weekday);
      }
    }
    if (trainingWeekdays.size === 0) {
      for (let weekday = 0; weekday < daysInWeek; weekday += 1) {
        trainingWeekdays.add(weekday);
      }
    }

    const activeWeekdays = [...trainingWeekdays].filter((weekday) => weekday < daysInWeek);
    if (activeWeekdays.length === 0) continue;
    const weekTargetTss = recommendedWeeklyTss * (daysInWeek / 7);
    const baseDailyTss = Math.floor(weekTargetTss / activeWeekdays.length);
    let remainderTss = Math.round(weekTargetTss - baseDailyTss * activeWeekdays.length);
    for (const weekday of activeWeekdays.sort((left, right) => left - right)) {
      const date = addDaysDateOnlyUtc(state.scheduling.startDate, weekStartOffset + weekday);
      const extra = remainderTss > 0 ? 1 : 0;
      targetTssByDate.set(date, baseDailyTss + extra);
      remainderTss -= extra;
    }
  }

  return targetTssByDate;
}

function deriveTimelineWeeks({
  creationPreview,
  recommendedLoad,
  sessions,
  state,
}: {
  creationPreview?: TrainingPlanCreationPreview;
  recommendedLoad: BuilderRecommendedLoadViewModel | null;
  sessions: TrainingPlanBuilderSession[];
  state: TrainingPlanBuilderState;
}): BuilderTimelineWeekViewModel[] {
  const goals = selectBuilderGoalBlueprints(state);
  const maxSessionWeek = sessions.reduce(
    (max, session) => Math.max(max, Math.floor(session.offsetDays / 7)),
    0,
  );
  const maxGoalWeek = goals.reduce(
    (max, goal) =>
      goal.targetOffsetDays !== null ? Math.max(max, Math.floor(goal.targetOffsetDays / 7)) : max,
    0,
  );
  const previewWeekCount = creationPreview?.weeks.length ?? 0;
  const preferenceWeekCount = state.planPreferences.durationWeeks ?? 0;
  const weekCount = Math.max(
    1,
    previewWeekCount,
    preferenceWeekCount,
    maxSessionWeek + 1,
    maxGoalWeek + 1,
  );
  const scale = recommendedLoad ? Math.max(700, recommendedLoad.rangeMaxTss * 1.15) : 700;
  const previewWeeksByIndex = new Map(
    (creationPreview?.weeks ?? []).map((week) => [week.weekIndex, week] as const),
  );
  const sessionsByWeek = new Map<number, TrainingPlanBuilderSession[]>();
  for (const session of sessions) {
    const weekIndex = Math.floor(session.offsetDays / 7);
    const weekSessions = sessionsByWeek.get(weekIndex);
    if (weekSessions) {
      weekSessions.push(session);
    } else {
      sessionsByWeek.set(weekIndex, [session]);
    }
  }
  const goalsByWeek = new Map<number, BuilderTimelineGoalMarkerViewModel[]>();
  for (const goal of goals) {
    if (goal.targetOffsetDays === null) continue;
    const weekIndex = Math.floor(goal.targetOffsetDays / 7);
    const weekGoals = goalsByWeek.get(weekIndex);
    const marker = {
      key: goal.localId,
      title: goal.title,
      dayIndex: goal.targetOffsetDays % 7,
    };
    if (weekGoals) {
      weekGoals.push(marker);
    } else {
      goalsByWeek.set(weekIndex, [marker]);
    }
  }

  return Array.from({ length: weekCount }).map((_, weekIndex) => {
    const previewWeek = previewWeeksByIndex.get(weekIndex);
    const estimatedTss = previewWeek?.estimatedTss ?? 0;
    const weekSessions = sessionsByWeek.get(weekIndex) ?? [];
    return {
      weekIndex,
      label: formatBuilderWeekLabel(weekIndex),
      phaseLabel: getPhaseLabel(weekIndex, weekCount),
      estimatedTss,
      plannedLoadPercent: Math.min(100, Math.max(4, Math.round((estimatedTss / scale) * 100))),
      recommendedLoadPercent: recommendedLoad
        ? Math.min(100, Math.max(4, Math.round((recommendedLoad.weeklyTss / scale) * 100)))
        : null,
      recommendedTss: recommendedLoad?.weeklyTss ?? null,
      targetDeltaLabel: recommendedLoad ? formatTargetDelta(estimatedTss, recommendedLoad) : null,
      sessions: weekSessions.map((session) => ({
        session,
        dayIndex: session.offsetDays % 7,
        dayLabel: BUILDER_WEEKDAY_LABELS[session.offsetDays % 7] ?? "Day",
        title: formatBuilderSessionTitle(session),
        estimatedTss: session.activityPlan?.estimatedTss ?? 0,
        assigned: session.activityPlan !== null,
      })),
      goals: goalsByWeek.get(weekIndex) ?? [],
    };
  });
}

function getPhaseLabel(
  weekIndex: number,
  weekCount: number,
): BuilderTimelineWeekViewModel["phaseLabel"] {
  if (weekCount <= 3) {
    return weekIndex === weekCount - 1 ? "Peak" : "Build";
  }
  if (weekIndex >= weekCount - 1) {
    return "Taper";
  }
  if (weekIndex >= weekCount - 2) {
    return "Peak";
  }
  if (weekIndex >= Math.max(1, Math.floor(weekCount * 0.45))) {
    return "Build";
  }
  return "Base";
}

function deriveActionRecommendations({
  currentBaseline,
  firstUnassignedSession,
  recommendedLoad,
  sessions,
  state,
}: {
  currentBaseline: BuilderCurrentBaselineViewModel;
  firstUnassignedSession: TrainingPlanBuilderSession | null;
  recommendedLoad: BuilderRecommendedLoadViewModel | null;
  sessions: TrainingPlanBuilderSession[];
  state: TrainingPlanBuilderState;
}): BuilderActionRecommendationViewModel[] {
  const recommendations: BuilderActionRecommendationViewModel[] = [];
  const goals = selectBuilderGoalBlueprints(state);

  if (currentBaseline.ctl === null) {
    recommendations.push({
      key: "set-baseline",
      label: "Set your starting fitness",
      detail:
        "Add current fitness so the chart starts from your real training load instead of zero.",
      target: { type: "athleteContext" },
    });
  }

  if (goals.length === 0) {
    recommendations.push({
      key: "add-goals",
      label: "Anchor the plan to a goal",
      detail: "Add a goal so the chart can compare planned load with what the goal likely needs.",
      target: { type: "goals" },
    });
  }

  if (sessions.length === 0) {
    recommendations.push({
      key: "add-first-session",
      label: "Create the first training shape",
      detail: "Start with a recommended structure or add a first session to begin shaping load.",
      target: { type: "addSession" },
    });
  }

  if (firstUnassignedSession) {
    recommendations.push({
      key: "assign-session",
      label: "Assign activity plans",
      detail: `${formatBuilderWeekdayWithWeek(firstUnassignedSession.offsetDays)} needs a workout before load can be counted accurately.`,
      target: toSessionTarget(firstUnassignedSession.localId),
    });
  }

  if (recommendedLoad?.status === "below") {
    recommendations.push({
      key: "increase-load",
      label: "Build toward the goal load",
      detail: `Average planned load is ${recommendedLoad.plannedAverageTss} TSS/wk; target ${recommendedLoad.rangeMinTss}-${recommendedLoad.rangeMaxTss}.`,
      target: { type: "addSession" },
    });
  }

  if (recommendedLoad?.status === "above") {
    recommendations.push({
      key: "reduce-load",
      label: "Bring load back into range",
      detail: `Average planned load is ${recommendedLoad.plannedAverageTss} TSS/wk, above the goal range.`,
      target: { type: "week", weekIndex: 0 },
    });
  }

  if (
    currentBaseline.ctl !== null &&
    recommendedLoad &&
    recommendedLoad.plannedAverageTss >
      Math.max(recommendedLoad.rangeMaxTss, currentBaseline.ctl * 7 * 1.6)
  ) {
    recommendations.push({
      key: "baseline-ramp-caution",
      label: "Check the ramp from current fitness",
      detail: `This plan averages ${recommendedLoad.plannedAverageTss} TSS/wk from ${Math.round(currentBaseline.ctl)} CTL. Consider easing the first week if that jump feels aggressive.`,
      target: { type: "athleteContext" },
    });
  }

  if (recommendedLoad?.status === "on_track" && recommendations.length === 0) {
    recommendations.push({
      key: "keep-shaping",
      label: "Goal load is on track",
      detail: "Use the week planner to fine-tune session spacing and assignments.",
      target: { type: "week", weekIndex: 0 },
    });
  }

  return recommendations.slice(0, 3);
}

function deriveStrategyViewModel({
  creationPreview,
  firstUnassignedSession,
  planCheckRows,
  recommendedLoad,
  sessions,
  state,
}: {
  creationPreview?: TrainingPlanCreationPreview;
  firstUnassignedSession: TrainingPlanBuilderSession | null;
  planCheckRows: BuilderPlanCheckRowViewModel[];
  recommendedLoad: BuilderRecommendedLoadViewModel | null;
  sessions: TrainingPlanBuilderSession[];
  state: TrainingPlanBuilderState;
}): BuilderStrategyViewModel {
  const goals = [...selectBuilderGoalBlueprints(state)].sort(
    (left, right) => left.priority - right.priority,
  );
  const planWeeks = creationPreview?.weeks ?? [];
  const lowLoadWeeks = planWeeks.filter((week) => {
    if (!recommendedLoad) return false;
    return week.estimatedTss < recommendedLoad.rangeMinTss * 0.72;
  });
  const lastWeek = planWeeks[planWeeks.length - 1];
  const previousWeek = planWeeks[planWeeks.length - 2];
  const taperWeak = Boolean(
    goals.some((goal) => goal.targetOffsetDays !== null) &&
      lastWeek &&
      previousWeek &&
      lastWeek.estimatedTss > previousWeek.estimatedTss * 0.85,
  );
  const goalSupportLevel = getOverallGoalSupportLevel({ recommendedLoad, sessions });
  const planHealth: BuilderPlanHealthItemViewModel[] = [
    {
      key: "goal-support",
      status:
        goalSupportLevel === "Strong" || goalSupportLevel === "Moderate"
          ? "ok"
          : goalSupportLevel === "Weak"
            ? "warning"
            : "risk",
      label: goalSupportLevel === "Unsupported" ? "Goal Unsupported" : "Goal Supported",
      detail: recommendedLoad
        ? `Average load is ${recommendedLoad.plannedAverageTss} TSS/wk against the strategic range.`
        : "Add a goal or planning constraint to evaluate support.",
    },
    {
      key: "ramp",
      status: recommendedLoad?.status === "above" ? "warning" : "ok",
      label: recommendedLoad?.status === "above" ? "Aggressive Ramp" : "Sustainable Ramp",
      detail:
        recommendedLoad?.status === "above"
          ? "The plan is above the recommended range for the current strategy."
          : "Planned load is not currently flagged as too aggressive.",
    },
    {
      key: "recovery",
      status: planWeeks.length >= 4 && lowLoadWeeks.length === 0 ? "warning" : "ok",
      label:
        planWeeks.length >= 4 && lowLoadWeeks.length === 0
          ? "Recovery Week Missing"
          : "Recovery Included",
      detail:
        planWeeks.length >= 4 && lowLoadWeeks.length === 0
          ? "No lower-load week is visible in this block yet."
          : "The plan has room for recovery or is too short to require a full down week.",
    },
    {
      key: "taper",
      status: taperWeak ? "warning" : "ok",
      label: taperWeak ? "Taper Weak" : "Taper Acceptable",
      detail: taperWeak
        ? "The final goal week does not appear to reduce load enough before the target."
        : "No taper risk is currently flagged.",
    },
  ];
  const insights: BuilderStrategyInsightViewModel[] = [];

  if (goals.length === 0) {
    insights.push({
      key: "goals-needed",
      severity: "warning",
      title: "Add goals to judge the strategy",
      detail:
        "The builder can schedule workouts now, but goal support cannot be evaluated until a goal is selected.",
      target: { type: "goals" },
    });
  }
  if (sessions.length === 0) {
    insights.push({
      key: "schedule-needed",
      severity: "info",
      title: "Create the first workload shape",
      detail: "Add or propose workouts so the training path can show where the athlete is heading.",
      target: { type: "addSession" },
    });
  }
  if (firstUnassignedSession) {
    insights.push({
      key: "assign-workouts",
      severity: "warning",
      title: "Some workouts need assignment",
      detail: `${formatBuilderWeekdayWithWeek(firstUnassignedSession.offsetDays)} needs a workout before support and risk can be estimated accurately.`,
      target: toSessionTarget(firstUnassignedSession.localId),
    });
  }
  if (recommendedLoad?.status === "below") {
    insights.push({
      key: "support-below",
      severity: "warning",
      title: "Goal support is weak",
      detail: `Planned load averages ${recommendedLoad.plannedAverageTss} TSS/wk, below the ${recommendedLoad.rangeMinTss}-${recommendedLoad.rangeMaxTss} range.`,
      target: { type: "addSession" },
    });
  }
  if (recommendedLoad?.status === "above") {
    insights.push({
      key: "support-above",
      severity: "risk",
      title: "Recovery risk is elevated",
      detail: `Planned load averages ${recommendedLoad.plannedAverageTss} TSS/wk, above the strategic range.`,
      target: { type: "week", weekIndex: 0 },
    });
  }
  if (taperWeak) {
    insights.push({
      key: "taper-weak",
      severity: "warning",
      title: "Taper may not protect the goal",
      detail: "Consider reducing load near the target date so freshness improves before the event.",
      target: { type: "week", weekIndex: Math.max(0, planWeeks.length - 1) },
    });
  }
  for (const check of planCheckRows) {
    insights.push({
      key: `check-${check.key}`,
      severity: "warning",
      title: "Plan check needs attention",
      detail: check.message,
      target: check.target,
    });
  }
  if (insights.length === 0) {
    insights.push({
      key: "strategy-on-track",
      severity: "info",
      title: "Strategy is directionally sound",
      detail: "The current schedule supports the goal without obvious recovery or taper warnings.",
      target: null,
    });
  }

  return {
    goals: goals.map((goal, index) => ({
      id: goal.localId,
      title: goal.title,
      role: index === 0 ? "Primary" : index === 1 ? "Secondary" : "Maintenance",
      targetDateLabel:
        goal.targetOffsetDays !== null ? formatBuilderWeekdayWithWeek(goal.targetOffsetDays) : null,
      supportLevel: goalSupportLevel,
      detail: getGoalSupportDetail(goalSupportLevel, recommendedLoad),
    })),
    planHealth,
    insights: insights.slice(0, 4),
    readiness: {
      label:
        goalSupportLevel === "Unsupported" ? "Readiness unknown" : `${goalSupportLevel} readiness`,
      status:
        goalSupportLevel === "Strong"
          ? "strong"
          : goalSupportLevel === "Moderate"
            ? "moderate"
            : goalSupportLevel === "Weak"
              ? "weak"
              : "unknown",
      detail: recommendedLoad
        ? `Current strategy averages ${recommendedLoad.plannedAverageTss} TSS/wk.`
        : "Add goals and workouts to estimate readiness.",
    },
  };
}

function getOverallGoalSupportLevel({
  recommendedLoad,
  sessions,
}: {
  recommendedLoad: BuilderRecommendedLoadViewModel | null;
  sessions: TrainingPlanBuilderSession[];
}): BuilderGoalSupportViewModel["supportLevel"] {
  if (sessions.length === 0 || !recommendedLoad) return "Unsupported";
  if (recommendedLoad.status === "on_track") return "Strong";
  if (recommendedLoad.status === "above") return "Moderate";
  if (recommendedLoad.status === "below") return "Weak";
  return "Unsupported";
}

function getGoalSupportDetail(
  supportLevel: BuilderGoalSupportViewModel["supportLevel"],
  recommendedLoad: BuilderRecommendedLoadViewModel | null,
) {
  if (!recommendedLoad) return "Add schedule and goal context to evaluate support.";
  if (supportLevel === "Strong") return "Planned load is within the target support range.";
  if (supportLevel === "Moderate")
    return "The goal is supported, but recovery risk may be elevated.";
  if (supportLevel === "Weak") return "The schedule is likely under-supporting this goal.";
  return "Add workouts before this goal can be evaluated.";
}

function deriveCurrentBaseline(state: TrainingPlanBuilderState): BuilderCurrentBaselineViewModel {
  const ctl = state.athleteContext.physiology.currentFitnessCtl.value;
  const atl = state.athleteContext.physiology.currentFatigueAtl.value;
  const tsb = state.athleteContext.physiology.currentFormTsb.value;
  const sourceLabel = state.athleteContext.physiology.currentFitnessCtl.overridden
    ? "Manual baseline"
    : ctl !== null
      ? "Current fitness"
      : "No baseline selected";

  if (ctl === null) {
    return {
      ctl,
      atl,
      tsb,
      sourceLabel,
      summaryLabel: "No fitness baseline",
      detail: "Add current fitness to start projections from your actual training load.",
      target: { type: "athleteContext" },
    };
  }

  const formPart = tsb !== null ? ` · ${Math.round(tsb)} form` : "";
  const fatiguePart = atl !== null ? ` · ${Math.round(atl)} ATL` : "";
  return {
    ctl,
    atl,
    tsb,
    sourceLabel,
    summaryLabel: `Starts at ${Math.round(ctl)} CTL${formPart}`,
    detail: `Based on your recent training load, this plan starts from ${Math.round(ctl)} CTL${fatiguePart}.`,
    target: { type: "athleteContext" },
  };
}

function deriveRecommendedLoad({
  creationPreview,
  currentBaseline,
  state,
}: {
  creationPreview?: TrainingPlanCreationPreview;
  currentBaseline: BuilderCurrentBaselineViewModel;
  state: TrainingPlanBuilderState;
}): BuilderRecommendedLoadViewModel | null {
  const goalLoadCandidates = selectBuilderGoalBlueprints(state).flatMap((goal) => {
    const objective = goal.objective;
    if (!objective) {
      return [];
    }

    if (objective.type === "consistency") {
      return [
        (objective.target_sessions_per_week ?? state.planPreferences.weeklySessionCount ?? 3) * 45,
      ];
    }

    if (objective.type === "completion") {
      return [estimateEnduranceGoalLoad(objective.distance_m, objective.duration_s)];
    }

    if (objective.type === "event_performance") {
      return [estimateEnduranceGoalLoad(objective.distance_m, objective.target_time_s)];
    }

    if (objective.type === "threshold") {
      return [260];
    }

    return [];
  });
  const preferenceLoad = state.planPreferences.targetWeeklyHours
    ? state.planPreferences.targetWeeklyHours * 55
    : null;
  const frequencyLoad = state.planPreferences.weeklySessionCount
    ? state.planPreferences.weeklySessionCount * 45
    : null;
  const baselineWeeklyTss =
    currentBaseline.ctl !== null ? roundToNearestTen(currentBaseline.ctl * 7) : null;
  const loadCandidates = [
    ...goalLoadCandidates,
    preferenceLoad,
    frequencyLoad,
    baselineWeeklyTss,
  ].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  const targetLoad = roundToNearestTen(Math.max(0, ...loadCandidates));

  if (targetLoad <= 0) {
    return null;
  }

  const sourceLabel =
    goalLoadCandidates.length > 0
      ? "Goal load"
      : preferenceLoad !== null
        ? "Preference load"
        : frequencyLoad !== null
          ? "Schedule load"
          : "Fitness baseline";

  const weeks = creationPreview?.weeks ?? [];
  const plannedAverageTss =
    weeks.length > 0
      ? Math.round(weeks.reduce((total, week) => total + week.estimatedTss, 0) / weeks.length)
      : 0;
  const rangeMinTss = roundToNearestTen(targetLoad * 0.85);
  const rangeMaxTss = roundToNearestTen(targetLoad * 1.15);
  const loadDeltaLabel =
    baselineWeeklyTss !== null
      ? `${targetLoad >= baselineWeeklyTss ? "+" : ""}${targetLoad - baselineWeeklyTss} vs baseline`
      : null;
  const status =
    weeks.length === 0
      ? "needs_sessions"
      : plannedAverageTss < rangeMinTss
        ? "below"
        : plannedAverageTss > rangeMaxTss
          ? "above"
          : "on_track";
  const guidance =
    status === "needs_sessions"
      ? "Add sessions and assign activity plans to compare this plan against the goal load."
      : status === "below"
        ? "Planned load is below the goal range. Add sessions or choose more demanding activity plans."
        : status === "above"
          ? "Planned load is above the goal range. Reduce load or add recovery spacing."
          : "Planned load sits inside the goal range.";
  const scale = Math.max(700, rangeMaxTss * 1.15);

  return {
    weeklyTss: targetLoad,
    rangeMinTss,
    rangeMaxTss,
    baselineWeeklyTss,
    plannedAverageTss,
    markerPercent: Math.min(100, Math.max(6, Math.round((targetLoad / scale) * 100))),
    label: `${targetLoad} TSS/wk`,
    guidance,
    sourceLabel,
    loadDeltaLabel,
    status,
  };
}

function estimateEnduranceGoalLoad(
  distanceMeters: number | undefined,
  durationSeconds: number | undefined,
) {
  if ((distanceMeters ?? 0) >= 42_195 || (durationSeconds ?? 0) >= 14_400) {
    return 450;
  }
  if ((distanceMeters ?? 0) >= 21_097 || (durationSeconds ?? 0) >= 7_200) {
    return 320;
  }
  if ((distanceMeters ?? 0) >= 10_000 || (durationSeconds ?? 0) >= 3_600) {
    return 220;
  }
  return 160;
}

function roundToNearestTen(value: number) {
  return Math.round(value / 10) * 10;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function formatTargetDelta(estimatedTss: number, recommendedLoad: BuilderRecommendedLoadViewModel) {
  if (estimatedTss < recommendedLoad.rangeMinTss) {
    return `${recommendedLoad.rangeMinTss - estimatedTss} under`;
  }
  if (estimatedTss > recommendedLoad.rangeMaxTss) {
    return `${estimatedTss - recommendedLoad.rangeMaxTss} over`;
  }
  return "in range";
}

function deriveNextBestAction({
  firstCheck,
  firstUnassignedSession,
  sessions,
}: {
  firstCheck: TrainingPlanCreationPreview["checks"][number] | null;
  firstUnassignedSession: TrainingPlanBuilderSession | null;
  sessions: TrainingPlanBuilderSession[];
}): BuilderPlanCreationViewModel["nextBestAction"] {
  if (firstUnassignedSession) {
    return {
      text: `Assign a workout for ${formatBuilderWeekdayWithWeek(firstUnassignedSession.offsetDays)}.`,
      target: toSessionTarget(firstUnassignedSession.localId),
      needsAttention: true,
    };
  }

  if (firstCheck) {
    return {
      text: firstCheck.message,
      target: toWeekTarget(firstCheck.weekIndex),
      needsAttention: true,
    };
  }

  if (sessions.length === 0) {
    return {
      text: "Add sessions or use the proposed structure to start shaping the plan.",
      target: { type: "addSession" },
      needsAttention: false,
    };
  }

  return {
    text: "Plan structure is ready for review.",
    target: null,
    needsAttention: false,
  };
}

function toSessionTarget(sessionId: string): BuilderViewModelTarget {
  return { type: "session", sessionId };
}

function toWeekTarget(weekIndex: number | undefined): BuilderViewModelTarget | null {
  return typeof weekIndex === "number" ? { type: "week", weekIndex } : null;
}

function getConstraintSummary(state: TrainingPlanBuilderState) {
  const parts = [
    state.planPreferences.durationWeeks ? `${state.planPreferences.durationWeeks} weeks` : null,
    state.planPreferences.weeklySessionCount
      ? `${state.planPreferences.weeklySessionCount} sessions/week`
      : null,
    state.planPreferences.targetWeeklyHours
      ? `${state.planPreferences.targetWeeklyHours} hr/week`
      : null,
  ].filter((part) => part !== null);

  return parts.length > 0 ? parts.join(" · ") : "No constraints selected";
}

function hasCustomConstraints(state: TrainingPlanBuilderState) {
  return Object.values(state.planPreferences).some((value) => value !== null);
}

function getAthleteContextSummary(state: TrainingPlanBuilderState) {
  const context = state.athleteContext;
  const parts = [
    context.physiology.currentFitnessCtl.value !== null
      ? `Fitness ${Math.round(context.physiology.currentFitnessCtl.value)} CTL`
      : null,
    context.demographics.gender ? formatBuilderGender(context.demographics.gender) : null,
    context.demographics.ageYears.value !== null
      ? `${Math.round(context.demographics.ageYears.value)} years old`
      : null,
    formatBuilderNumberWithUnit(context.body.weightKg.value, context.body.weightKg.unit),
    context.physiology.ftpWatts.value !== null
      ? `${Math.round(context.physiology.ftpWatts.value)} W FTP`
      : null,
  ].filter((part) => part !== null);

  if (parts.length > 0) {
    return parts.slice(0, 3).join(" · ");
  }

  return "Using current profile defaults";
}

function getGoalSummary(state: TrainingPlanBuilderState) {
  const goals = selectBuilderGoalBlueprints(state);
  if (goals.length === 0) {
    return "No goals selected";
  }

  return `${goals.length} goal${goals.length === 1 ? "" : "s"}`;
}

function getGoalDetail(state: TrainingPlanBuilderState) {
  const goals = selectBuilderGoalBlueprints(state);
  const highestPriorityGoal = [...goals].sort((left, right) => left.priority - right.priority)[0];
  if (!highestPriorityGoal) {
    return "Add goals to shape the plan";
  }

  return `${highestPriorityGoal.title}${formatBuilderGoalOffsetDetail(highestPriorityGoal.targetOffsetDays)}`;
}

function getScheduleSummary(state: TrainingPlanBuilderState) {
  const dayCount = state.scheduling.preferredWeekdays.length;
  return `Reusable Week/Day plan · ${dayCount || "any"} preferred day${dayCount === 1 ? "" : "s"}`;
}
