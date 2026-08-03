import {
  addDaysDateOnlyUtc,
  buildDailyLoadByDateSeries,
  buildDailyLoadRecommendation,
  replayCommonLoadFitnessByDate,
  type TrainingPlanCreationPreview,
} from "@repo/core";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
import type { DailyTrainingAdjustmentPoint } from "@/lib/training-path/dailyTrainingPathModel";
import {
  BUILDER_WEEKDAY_LABELS,
  formatBuilderGender,
  formatBuilderGoalOffsetDetail,
  formatBuilderNumberWithUnit,
  formatBuilderSessionTitle,
  formatBuilderWeekdayWithWeek,
  formatBuilderWeekLabel,
} from "./formatters";
import { selectBuilderGoalBlueprints } from "./selectors";
import type { TrainingPlanBuilderSession, TrainingPlanBuilderState } from "./types";

function activityPlanLoad(activityPlan: TrainingPlanBuilderSession["activityPlan"]): number {
  return getActivityPlanQuantitySummary(activityPlan).commonLoad ?? 0;
}

function activityPlanDuration(activityPlan: TrainingPlanBuilderSession["activityPlan"]): number {
  return getActivityPlanQuantitySummary(activityPlan).durationSeconds ?? 0;
}

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
  estimatedCommonLoad: number;
  estimatedDurationSeconds: number;
  loadBarPercent: number;
  recommendedLoadMarkerPercent: number | null;
  targetDeltaLabel: string | null;
}

export interface BuilderTimelineSessionViewModel {
  session: TrainingPlanBuilderSession;
  dayIndex: number;
  dayLabel: string;
  title: string;
  estimatedCommonLoad: number;
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
  estimatedCommonLoad: number;
  plannedLoadPercent: number;
  recommendedLoadPercent: number | null;
  recommendedLoad: number | null;
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
  emptyState: "noActivityHistory" | null;
}

export interface BuilderRecommendedLoadViewModel {
  weeklyLoad: number;
  rangeMinLoad: number;
  rangeMaxLoad: number;
  baselineWeeklyLoad: number | null;
  plannedAverageLoad: number;
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
  longTermLoad: number | null;
  recentLoad: number | null;
  loadBalance: number | null;
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
  totalEstimatedLoad: number;
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
  const totalEstimatedLoad =
    creationPreview?.totalEstimatedLoad ??
    sessions.reduce((total, session) => total + activityPlanLoad(session.activityPlan), 0);
  const totalEstimatedDurationSeconds =
    creationPreview?.totalEstimatedDurationSeconds ??
    sessions.reduce((total, session) => total + activityPlanDuration(session.activityPlan), 0);
  const assignedSessionCount = sessions.filter((session) => session.activityPlan !== null).length;
  const goalCount = selectBuilderGoalBlueprints(state).length;
  const durationDays = latestOffsetDays >= 0 ? latestOffsetDays + 1 : 0;
  const maxTss = sessions.reduce(
    (max, session) => Math.max(max, activityPlanLoad(session.activityPlan)),
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
    totalEstimatedLoad,
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
      const load = activityPlanLoad(session.activityPlan);
      return {
        session,
        dayLabel: `${session.offsetDays + 1}`,
        heightPercent: maxTss > 0 ? Math.max(24, Math.round((load / maxTss) * 100)) : 24,
        assigned: session.activityPlan !== null,
      };
    }),
    timelineWeeks: deriveTimelineWeeks({ creationPreview, recommendedLoad, sessions, state }),
    weeklyCanvasRows: (creationPreview?.weeks ?? []).slice(0, 6).map((week) => {
      const scale = recommendedLoad ? Math.max(700, recommendedLoad.rangeMaxLoad * 1.15) : 700;
      return {
        weekIndex: week.weekIndex,
        assignedSessionCount: week.assignedSessionCount,
        sessionCount: week.sessionCount,
        estimatedCommonLoad: week.estimatedCommonLoad,
        estimatedDurationSeconds: week.estimatedDurationSeconds,
        loadBarPercent: Math.min(
          100,
          Math.max(6, Math.round((week.estimatedCommonLoad / scale) * 100)),
        ),
        recommendedLoadMarkerPercent: recommendedLoad
          ? Math.min(100, Math.max(6, Math.round((recommendedLoad.weeklyLoad / scale) * 100)))
          : null,
        targetDeltaLabel: recommendedLoad
          ? formatTargetDelta(week.estimatedCommonLoad, recommendedLoad)
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
  const plannedLoadByDate = new Map<string, number>();
  for (const session of sessions) {
    const date = addDaysDateOnlyUtc(startDate, session.offsetDays);
    plannedLoadByDate.set(
      date,
      (plannedLoadByDate.get(date) ?? 0) + activityPlanLoad(session.activityPlan),
    );
  }
  const targetLoadByDate = buildRecommendedTssByDate({
    durationDays,
    recommendedWeeklyTss: recommendedLoad?.weeklyLoad ?? 0,
    sessions,
    state,
  });
  const plannedSeries = buildDailyLoadByDateSeries({
    startDate,
    endDate,
    loadByDate: plannedLoadByDate,
  });
  const targetSeries = buildDailyLoadByDateSeries({
    startDate,
    endDate,
    loadByDate: targetLoadByDate,
  });
  const initialLongTermLoad = state.athleteContext.physiology.currentFitnessLongTermLoad.value;
  const initialRecentLoad = state.athleteContext.physiology.currentFatigueRecentLoad.value;
  const hasFitnessBaseline = initialLongTermLoad !== null && initialRecentLoad !== null;
  const plannedFitness = hasFitnessBaseline
    ? replayCommonLoadFitnessByDate({
        dailyLoad: plannedSeries,
        initialRecentLoad,
        initialLongTermLoad,
      })
    : [];
  const idealFitness = hasFitnessBaseline
    ? replayCommonLoadFitnessByDate({
        dailyLoad: targetSeries,
        initialRecentLoad,
        initialLongTermLoad,
      })
    : [];
  const fitnessValues = [...plannedFitness, ...idealFitness].map((point) => point.longTermLoad);
  const maxLoad = Math.max(
    50,
    ...plannedSeries.map((point) => point.load),
    ...targetSeries.map((point) => point.load),
  );
  const maxFitness = Math.max(10, ...fitnessValues);

  const dailyPoints = plannedSeries.map((plannedPoint, index) => {
    const targetPoint = targetSeries[index];
    const plannedFitnessPoint = plannedFitness[index];
    const idealFitnessPoint = idealFitness[index];
    const plannedLoad = Math.round(plannedPoint.load);
    const targetLoad = Math.round(targetPoint?.load ?? 0);
    return {
      date: plannedPoint.date,
      plannedLoad,
      tentativePlannedLoad: 0,
      completedLoad: 0,
      targetLoad,
      actualOrScheduledLoad: plannedLoad,
      loadDelta: plannedLoad - targetLoad,
      plannedDelta: plannedLoad - targetLoad,
      fitnessCtl: null,
      scheduledFitnessCtl: plannedFitnessPoint ? round1(plannedFitnessPoint.longTermLoad) : null,
      targetFitnessCtl: idealFitnessPoint ? round1(idealFitnessPoint.longTermLoad) : null,
      fatigueAtl: plannedFitnessPoint ? round1(plannedFitnessPoint.recentLoad) : null,
      formTsb: plannedFitnessPoint ? round1(plannedFitnessPoint.loadBalance) : null,
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
        plannedLoad: Math.round(weekPlannedSeries.reduce((sum, point) => sum + point.load, 0)),
        tentativePlannedLoad: null,
        targetLoad: Math.round(weekTargetSeries.reduce((sum, point) => sum + point.load, 0)),
        fitness: null,
        scheduledFitness: plannedPoint ? round1(plannedPoint.longTermLoad) : null,
        targetFitness: idealPoint ? round1(idealPoint.longTermLoad) : null,
        fatigue: plannedPoint ? round1(plannedPoint.recentLoad) : null,
        form: plannedPoint ? round1(plannedPoint.loadBalance) : null,
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
    emptyState: hasFitnessBaseline ? null : "noActivityHistory",
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
  const targetLoadByDate = new Map<string, number>();
  if (recommendedWeeklyTss <= 0 || durationDays <= 0) return targetLoadByDate;
  const weekCount = Math.ceil(durationDays / 7);

  const preferredWeekdays =
    state.scheduling.preferredWeekdays.length > 0
      ? state.scheduling.preferredWeekdays
      : Array.from(
          { length: Math.min(7, state.planPreferences.weeklySessionCount ?? 0) },
          (_, index) => index,
        );
  const activityCategory = selectBuilderGoalBlueprints(state).find(
    (goal) => goal.activityCategory !== null,
  )?.activityCategory;
  const points = buildDailyLoadRecommendation({
    mode: "recommended-load",
    startDate: state.scheduling.startDate,
    endDate: addDaysDateOnlyUtc(state.scheduling.startDate, durationDays - 1),
    preferredWeekdays,
    weeklyTargets: Array.from({ length: weekCount }, (_, weekIndex) => ({
      weekIndex,
      targetLoad: recommendedWeeklyTss,
    })),
    sessions: sessions.map((session) => ({
      offsetDays: session.offsetDays,
      estimatedCommonLoad:
        getActivityPlanQuantitySummary(session.activityPlan).commonLoad ??
        session.intent?.targetLoad ??
        null,
      estimatedDurationMinutes:
        getActivityPlanQuantitySummary(session.activityPlan).durationSeconds !== null
          ? activityPlanDuration(session.activityPlan) / 60
          : typeof session.intent?.targetDurationSeconds === "number"
            ? session.intent.targetDurationSeconds / 60
            : null,
      intentType: session.intent?.type,
      activityCategory,
    })),
  });

  for (const point of points) {
    if (!point.actionableRecommendation) continue;
    targetLoadByDate.set(point.date, point.actionableRecommendation.recommendedLoad);
  }

  return targetLoadByDate;
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
  const scale = recommendedLoad ? Math.max(700, recommendedLoad.rangeMaxLoad * 1.15) : 700;
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
    const estimatedCommonLoad = previewWeek?.estimatedCommonLoad ?? 0;
    const weekSessions = sessionsByWeek.get(weekIndex) ?? [];
    return {
      weekIndex,
      label: formatBuilderWeekLabel(weekIndex),
      phaseLabel: getPhaseLabel(weekIndex, weekCount),
      estimatedCommonLoad,
      plannedLoadPercent: Math.min(
        100,
        Math.max(4, Math.round((estimatedCommonLoad / scale) * 100)),
      ),
      recommendedLoadPercent: recommendedLoad
        ? Math.min(100, Math.max(4, Math.round((recommendedLoad.weeklyLoad / scale) * 100)))
        : null,
      recommendedLoad: recommendedLoad?.weeklyLoad ?? null,
      targetDeltaLabel: recommendedLoad
        ? formatTargetDelta(estimatedCommonLoad, recommendedLoad)
        : null,
      sessions: weekSessions.map((session) => ({
        session,
        dayIndex: session.offsetDays % 7,
        dayLabel: BUILDER_WEEKDAY_LABELS[session.offsetDays % 7] ?? "Day",
        title: formatBuilderSessionTitle(session),
        estimatedCommonLoad: activityPlanLoad(session.activityPlan),
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

  if (currentBaseline.longTermLoad === null) {
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
      detail: `${formatBuilderWeekdayWithWeek(firstUnassignedSession.offsetDays)} needs a activity before load can be counted accurately.`,
      target: toSessionTarget(firstUnassignedSession.localId),
    });
  }

  if (recommendedLoad?.status === "below") {
    recommendations.push({
      key: "increase-load",
      label: "Build toward the goal load",
      detail: `Average planned load is ${recommendedLoad.plannedAverageLoad} Load/wk; target ${recommendedLoad.rangeMinLoad}-${recommendedLoad.rangeMaxLoad}.`,
      target: { type: "addSession" },
    });
  }

  if (recommendedLoad?.status === "above") {
    recommendations.push({
      key: "reduce-load",
      label: "Bring load back into range",
      detail: `Average planned load is ${recommendedLoad.plannedAverageLoad} Load/wk, above the goal range.`,
      target: { type: "week", weekIndex: 0 },
    });
  }

  if (
    currentBaseline.longTermLoad !== null &&
    recommendedLoad &&
    recommendedLoad.plannedAverageLoad >
      Math.max(recommendedLoad.rangeMaxLoad, currentBaseline.longTermLoad * 7 * 1.6)
  ) {
    recommendations.push({
      key: "baseline-ramp-caution",
      label: "Check the ramp from current fitness",
      detail: `This plan averages ${recommendedLoad.plannedAverageLoad} Load/wk from Fitness ${Math.round(currentBaseline.longTermLoad)}. Consider easing the first week if that jump feels aggressive.`,
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
    return week.estimatedCommonLoad < recommendedLoad.rangeMinLoad * 0.72;
  });
  const lastWeek = planWeeks[planWeeks.length - 1];
  const previousWeek = planWeeks[planWeeks.length - 2];
  const taperWeak = Boolean(
    goals.some((goal) => goal.targetOffsetDays !== null) &&
      lastWeek &&
      previousWeek &&
      lastWeek.estimatedCommonLoad > previousWeek.estimatedCommonLoad * 0.85,
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
        ? `Average load is ${recommendedLoad.plannedAverageLoad} Load/wk against the strategic range.`
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
        "The builder can schedule activities now, but goal support cannot be evaluated until a goal is selected.",
      target: { type: "goals" },
    });
  }
  if (sessions.length === 0) {
    insights.push({
      key: "schedule-needed",
      severity: "info",
      title: "Create the first workload shape",
      detail:
        "Add or propose activities so the training path can show where the athlete is heading.",
      target: { type: "addSession" },
    });
  }
  if (firstUnassignedSession) {
    insights.push({
      key: "assign-activities",
      severity: "warning",
      title: "Some activities need assignment",
      detail: `${formatBuilderWeekdayWithWeek(firstUnassignedSession.offsetDays)} needs a activity before support and risk can be estimated accurately.`,
      target: toSessionTarget(firstUnassignedSession.localId),
    });
  }
  if (recommendedLoad?.status === "below") {
    insights.push({
      key: "support-below",
      severity: "warning",
      title: "Goal support is weak",
      detail: `Planned load averages ${recommendedLoad.plannedAverageLoad} Load/wk, below the ${recommendedLoad.rangeMinLoad}-${recommendedLoad.rangeMaxLoad} range.`,
      target: { type: "addSession" },
    });
  }
  if (recommendedLoad?.status === "above") {
    insights.push({
      key: "support-above",
      severity: "risk",
      title: "Recovery risk is elevated",
      detail: `Planned load averages ${recommendedLoad.plannedAverageLoad} Load/wk, above the strategic range.`,
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
        ? `Current strategy averages ${recommendedLoad.plannedAverageLoad} Load/wk.`
        : "Add goals and activities to estimate readiness.",
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
  return "Add activities before this goal can be evaluated.";
}

function deriveCurrentBaseline(state: TrainingPlanBuilderState): BuilderCurrentBaselineViewModel {
  const longTermLoad = state.athleteContext.physiology.currentFitnessLongTermLoad.value;
  const recentLoad = state.athleteContext.physiology.currentFatigueRecentLoad.value;
  const loadBalance = state.athleteContext.physiology.currentFormLoadBalance.value;
  const sourceLabel = state.athleteContext.physiology.currentFitnessLongTermLoad.overridden
    ? "Manual baseline"
    : longTermLoad !== null
      ? "Current fitness"
      : "No baseline selected";

  if (longTermLoad === null) {
    return {
      longTermLoad,
      recentLoad,
      loadBalance,
      sourceLabel,
      summaryLabel: "Fitness calibration needed",
      detail:
        "Complete activities with calculated Load or add a Fitness, Fatigue, and Load Balance baseline before using projections.",
      target: { type: "athleteContext" },
    };
  }

  const formPart = loadBalance !== null ? ` · ${Math.round(loadBalance)} form` : "";
  const fatiguePart = recentLoad !== null ? ` · Fatigue ${Math.round(recentLoad)}` : "";
  return {
    longTermLoad,
    recentLoad,
    loadBalance,
    sourceLabel,
    summaryLabel: `Starts at Fitness ${Math.round(longTermLoad)}${formPart}`,
    detail: `Based on your recent training Load, this plan starts from Fitness ${Math.round(longTermLoad)}${fatiguePart}.`,
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
  const baselineWeeklyLoad =
    currentBaseline.longTermLoad !== null
      ? roundToNearestTen(currentBaseline.longTermLoad * 7)
      : null;
  const loadCandidates = [
    ...goalLoadCandidates,
    preferenceLoad,
    frequencyLoad,
    baselineWeeklyLoad,
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
  const plannedAverageLoad =
    weeks.length > 0
      ? Math.round(
          weeks.reduce((total, week) => total + week.estimatedCommonLoad, 0) / weeks.length,
        )
      : 0;
  const rangeMinLoad = roundToNearestTen(targetLoad * 0.85);
  const rangeMaxLoad = roundToNearestTen(targetLoad * 1.15);
  const loadDeltaLabel =
    baselineWeeklyLoad !== null
      ? `${targetLoad >= baselineWeeklyLoad ? "+" : ""}${targetLoad - baselineWeeklyLoad} vs baseline`
      : null;
  const status =
    weeks.length === 0
      ? "needs_sessions"
      : plannedAverageLoad < rangeMinLoad
        ? "below"
        : plannedAverageLoad > rangeMaxLoad
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
  const scale = Math.max(700, rangeMaxLoad * 1.15);

  return {
    weeklyLoad: targetLoad,
    rangeMinLoad,
    rangeMaxLoad,
    baselineWeeklyLoad,
    plannedAverageLoad,
    markerPercent: Math.min(100, Math.max(6, Math.round((targetLoad / scale) * 100))),
    label: `${targetLoad} Load/wk`,
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

function formatTargetDelta(
  estimatedCommonLoad: number,
  recommendedLoad: BuilderRecommendedLoadViewModel,
) {
  if (estimatedCommonLoad < recommendedLoad.rangeMinLoad) {
    return `${recommendedLoad.rangeMinLoad - estimatedCommonLoad} under`;
  }
  if (estimatedCommonLoad > recommendedLoad.rangeMaxLoad) {
    return `${estimatedCommonLoad - recommendedLoad.rangeMaxLoad} over`;
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
      text: `Assign a activity for ${formatBuilderWeekdayWithWeek(firstUnassignedSession.offsetDays)}.`,
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
    context.physiology.currentFitnessLongTermLoad.value !== null
      ? `Fitness ${Math.round(context.physiology.currentFitnessLongTermLoad.value)}`
      : null,
    context.demographics.gender ? formatBuilderGender(context.demographics.gender) : null,
    context.demographics.ageYears.value !== null
      ? `${Math.round(context.demographics.ageYears.value)} years old`
      : null,
    formatBuilderNumberWithUnit(context.body.weightKg.value, context.body.weightKg.unit),
    context.physiology.planningThresholdPowerWatts.value !== null
      ? `${Math.round(context.physiology.planningThresholdPowerWatts.value)} W planning threshold`
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
