import type { CanonicalGoalActivityCategory, ProfileGoal } from "../schemas";

export type { GoalEditorDraft, GoalEditorGoalType, GoalEditorRaceTargetMode } from "./draft";

export interface GoalTargetForValidation {
  id: string;
  targetType: "race_performance" | "pace_threshold" | "power_threshold" | "hr_threshold";
  activityCategory?: CanonicalGoalActivityCategory | undefined;
  distanceKm?: string | undefined;
  completionTimeHms?: string | undefined;
  paceMmSs?: string | undefined;
  testDurationHms?: string | undefined;
  targetWatts?: number | undefined;
  targetLthrBpm?: number | undefined;
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
}
