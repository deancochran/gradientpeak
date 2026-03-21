import type { CanonicalGoalActivityCategory, ProfileGoal } from "../schemas";

export type GoalEditorGoalType =
  | "race_performance"
  | "completion"
  | "pace_threshold"
  | "power_threshold"
  | "hr_threshold"
  | "consistency";

export type GoalEditorRaceTargetMode = "time" | "pace";

export interface GoalEditorDraft {
  title: string;
  targetDate: string;
  importance: number;
  goalType: GoalEditorGoalType;
  activityCategory: CanonicalGoalActivityCategory;
  raceDistanceKm?: number | null;
  raceTargetMode?: GoalEditorRaceTargetMode;
  targetDuration?: string;
  targetPace?: string;
  targetWatts?: number | null;
  targetBpm?: number | null;
  thresholdTestDuration?: string;
  consistencySessionsPerWeek?: number | null;
  consistencyWeeks?: number | null;
}

export interface GoalTargetForValidation {
  id: string;
  targetType: "race_performance" | "pace_threshold" | "power_threshold" | "hr_threshold";
  activityCategory?: CanonicalGoalActivityCategory;
  distanceKm?: string;
  completionTimeHms?: string;
  paceMmSs?: string;
  testDurationHms?: string;
  targetWatts?: number;
  targetLthrBpm?: number;
}

export interface GoalForValidation {
  id: string;
  name: string;
  targetDate: string;
  priority: number;
  targets: GoalTargetForValidation[];
}

export interface TrainingPlanFormForValidation {
  planStartDate?: string;
  goals: GoalForValidation[];
}

export interface GoalDraftFromGoalInput {
  goal: ProfileGoal;
  targetDate?: string | null;
}
