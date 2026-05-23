import type { ActivityCardActivity } from "@/components/shared/ActivityCard";
import type { ActivityPlan, PlannedActivity } from "@/components/shared/ActivityPlanCard";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";

export type TrainingPathRange = "goal" | "season" | "all";

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
  riskZone: TrainingPathRiskZone | null;
  isCurrent: boolean;
  isSelected: boolean;
};

export type TrainingPathWeekSummary = {
  weekStart: string;
  weekEnd: string;
  dateLabel: string;
  loadDelta: number;
  headline: string;
  body: string;
  completedLoad: number;
  plannedLoad: number;
  tentativePlannedLoad: number;
  targetLoad: number;
  fitness: number | null;
  targetFitness: number | null;
  fitnessGapToIdeal: number | null;
  fatigue: number | null;
  form: number | null;
  freshnessLabel: string | null;
  projectedFitnessAtGoal?: number | null;
  targetFitnessAtGoal?: number | null;
};

export type TrainingPathSelectedGoal = {
  id: string;
  label: string;
  targetDate: string;
  activityCategory?: string | null;
  status?: string | null;
  readinessPercent?: number | null;
  readinessTarget?: number | null;
};

export type TrainingPathScheduledItem = {
  id: string;
  title: string;
  date: string;
  estimatedLoad?: number | null;
  activityPlanId?: string | null;
  activityPlan?: ActivityPlan | null;
  event?: CalendarEvent | null;
  groupEvent?: CalendarGroupEvent | null;
  plannedActivity?: PlannedActivity | null;
};

export type TrainingPathCompletedActivity = {
  id: string;
  title: string;
  date: string;
  load?: number | null;
  activity?: ActivityCardActivity;
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
  date: string;
  completed_load_tss?: number | null;
  scheduled_load_tss?: number | null;
  tentative_scheduled_load_tss?: number | null;
  recommended_load_tss?: number | null;
  ideal_tss?: number | null;
  actual_tss?: number | null;
  scheduled_tss?: number | null;
};

export type TrainingPathFitnessPoint = {
  date: string;
  ctl: number;
  atl?: number | null;
  tsb?: number | null;
};

export type TrainingPathSourceGoalMarker = {
  id: string;
  targetDate: string;
  label?: string | null;
};
