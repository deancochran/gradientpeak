import type { GoalEditorGoalType, GoalEditorRaceTargetMode } from "../goals/types";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { trainingPlanPreferencesSchema } from "../schemas/training-plan-structure/domain-schemas";
import { activityTargetTypes } from "../targets/schema";
import { ACTIVITY_CATEGORY_CONFIG } from "./activity";

export const activityCategoryChoices = canonicalActivityCategorySchema.options.map((value) => ({
  value,
  label: ACTIVITY_CATEGORY_CONFIG[value].name,
}));
const targetLabels = {
  "%FTP": "% FTP",
  "%MaxHR": "% Max HR",
  "%ThresholdHR": "% Threshold HR",
  watts: "Watts",
  bpm: "BPM",
  speed: "Speed (km/h)",
  cadence: "Cadence (rpm)",
  RPE: "RPE (1-10)",
  rest: "Rest",
} as const;
export const activityTargetChoices = activityTargetTypes.map((value) => ({
  value,
  label: targetLabels[value],
}));
export const activityTargetUnitLabels = {
  "%FTP": "% FTP",
  "%MaxHR": "% Max HR",
  "%ThresholdHR": "% Threshold HR",
  watts: "watts",
  bpm: "bpm",
  speed: "km/h",
  cadence: "rpm",
  RPE: "RPE",
  rest: "Rest",
} as const;

export const completionTypeChoices = [
  { value: "time", type: "time", label: "Time" },
  { value: "distance:meters", type: "distance", label: "Distance · Meters" },
  { value: "distance:km", type: "distance", label: "Distance · Kilometers" },
  { value: "repetitions", type: "repetitions", label: "Repetitions" },
  { value: "untilFinished", type: "untilFinished", label: "Until finished" },
] as const;
export const distanceUnitChoices = [
  { value: "m", label: "Meters" },
  { value: "km", label: "Kilometers" },
] as const;
/** Planning preferences use Monday=0, unlike Date.getDay(). */
export const trainingWeekdayChoices = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
  (label, value) => ({ value, label }),
);

export const goalFocusChoices = [
  {
    value: "race_performance",
    label: "Race performance",
    description: "Pick a distance and chase a finish time or pace.",
  },
  {
    value: "completion",
    label: "Completion",
    description: "Set a finish distance, duration, or both.",
  },
  {
    value: "pace_threshold",
    label: "Pace threshold",
    description: "Target a threshold pace you want to hold.",
  },
  {
    value: "power_threshold",
    label: "Power threshold",
    description: "Target a threshold power in watts.",
  },
  {
    value: "hr_threshold",
    label: "Heart rate threshold",
    description: "Target a threshold heart rate for testing.",
  },
  {
    value: "consistency",
    label: "Consistency",
    description: "Aim for a weekly training rhythm over time.",
  },
] as const satisfies readonly { value: GoalEditorGoalType; label: string; description: string }[];
export const goalPriorityChoices = Array.from({ length: 11 }, (_, value) => ({
  value,
  label: String(value),
}));
export const goalPriorityHelpText =
  "0 is lowest priority; 10 is highest. Higher values mark a more important goal.";
export const goalRaceMeasureChoices = [
  { value: "time", label: "Finish Time", description: "Save a race time." },
  { value: "pace", label: "Goal Pace", description: "Save a pace target." },
] as const satisfies readonly {
  value: GoalEditorRaceTargetMode;
  label: string;
  description: string;
}[];
export const progressionStyleChoices = trainingPlanPreferencesSchema.shape.progression_style
  .unwrap()
  .options.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));
export const recoveryPriorityChoices = trainingPlanPreferencesSchema.shape.recovery_priority
  .unwrap()
  .options.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));
