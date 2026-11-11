import type {
  CommonLoadIdentity,
  CompletedObservationState,
} from "@/lib/training-path/completedCommonLoadObservation";

export type TrainingPathRange = "goal" | "season" | "all";

export type PlanTrainingChartRange = "daily" | "weekly" | "monthly";
export type PlanTrainingTrendLine = "fitness" | "fatigue" | "form";

export type TrainingPathWeekWindow = {
  start: string;
  end: string;
};

export type TrainingPathRiskZone = "fresh" | "moderate" | "high" | "veryHigh";

export type TrainingPathEmptyState =
  | "noGoal"
  | "noActivityHistory"
  | "noPlannedSessions"
  | "noProjection";

export type TrainingPathWeek = {
  completedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  completedLoadUnavailable?: boolean;
  effectiveLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveLoad?: number | null;
  effectiveIntensity?: number | null;
  effectiveCompletedLoad?: number | null;
  effectiveRemainingLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveRemainingLoad?: number | null;
  recommendedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  recommendedLoad?: number | null;
  weekStart: string;
  weekEnd: string;
  label: string;
  completedLoad: number | null;
  plannedLoad: number | null;
  plannedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  targetLoad: number | null;
  fitness: number | null;
  scheduledFitness: number | null;
  targetFitness: number | null;
  fatigue: number | null;
  form: number | null;
  riskZone: TrainingPathRiskZone | null;
  isCurrent: boolean;
  isSelected: boolean;
};

export type TrainingPathWeekSummary = {
  weekStart: string;
  weekEnd: string;
  dateLabel: string;
  loadDelta: number | null;
  headline: string | null;
  body: string | null;
  completedLoad: number | null;
  completedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  completedLoadUnavailable?: boolean;
  effectiveLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveLoad?: number | null;
  effectiveIntensity?: number | null;
  effectiveCompletedLoad?: number | null;
  effectiveRemainingLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  effectiveRemainingLoad?: number | null;
  recommendedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  recommendedLoad?: number | null;
  plannedLoad: number | null;
  plannedLoadStatus?: "complete" | "partial" | "known_zero" | "unavailable";
  targetLoad: number | null;
  fitness: number | null;
  targetFitness: number | null;
  fitnessGapToIdeal: number | null;
  fatigue: number | null;
  form: number | null;
  freshnessLabel: string | null;
  projectedFitnessAtGoal?: number | null;
  targetFitnessAtGoal?: number | null;
};

export type TrainingPathGoalMarker = {
  id: string;
  label: string;
  targetDate: string;
  weekStart: string;
};

export type TrainingPathViewModel = {
  weeks: TrainingPathWeek[];
  selectedWeekSummary: TrainingPathWeekSummary | null;
  goalMarkers: TrainingPathGoalMarker[];
  todayKey: string;
  domains: {
    load: [number, number];
    fitness: [number, number];
  };
  emptyState: TrainingPathEmptyState | null;
};

export type TrainingPathLoadPoint = {
  completed_observation_state?: CompletedObservationState;
  completed_common_load_status?: "complete" | "partial" | "known_zero" | "unavailable";
  completed_common_load_identity?: CommonLoadIdentity | null;
  has_unavailable_completed_activity?: boolean;
  date: string;
  completed_common_load?: number | null;
  scheduled_common_load?: number | null;
  scheduled_common_load_status?: "complete" | "partial" | "known_zero" | "unavailable";
  recommended_common_load?: number | null;
};

export type TrainingPathFitnessPoint = {
  date: string;
  longTermLoad: number;
  recentLoad?: number | null;
  loadBalance?: number | null;
};

export type TrainingPathSourceGoalMarker = {
  id: string;
  targetDate: string;
  label?: string | null;
};
