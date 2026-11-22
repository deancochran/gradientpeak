import { createEmptyGoalDraft, type GoalEditorDraft, type GoalEditorGoalType } from "./draft";

export type GoalEditorTargetFieldName =
  | "raceDistanceKm"
  | "targetDuration"
  | "targetPace"
  | "targetWatts"
  | "targetBpm"
  | "thresholdTestDuration"
  | "consistencySessionsPerWeek"
  | "consistencyWeeks";

export type GoalEditorTargetField = {
  name: GoalEditorTargetFieldName;
  kind: "number" | "duration" | "pace" | "integer";
  label: string;
  required: boolean;
  min?: number;
  max?: number;
  decimals?: number;
  unitLabel?: string;
  layout?: "hms" | "ms";
};

const positive = Number.MIN_VALUE;

export function getGoalEditorTargetFields(
  draft: Pick<GoalEditorDraft, "goalType" | "raceTargetMode">,
): readonly GoalEditorTargetField[] {
  const goalType = draft.goalType;
  if (goalType === "race_performance" || goalType === "completion") {
    const race = goalType === "race_performance";
    return [
      {
        name: "raceDistanceKm",
        kind: "number",
        label: "Distance (km)",
        required: race,
        min: positive,
        max: 1000,
        decimals: 3,
        unitLabel: "km",
      },
      ...(goalType === "completion" || (draft.raceTargetMode ?? "time") === "time"
        ? [
            {
              name: "targetDuration",
              kind: "duration",
              label: race ? "Goal time" : "Duration",
              required: race,
              layout: "hms",
            } as const,
          ]
        : [
            {
              name: "targetPace",
              kind: "pace",
              label: "Goal pace",
              required: true,
              layout: "ms",
            } as const,
          ]),
    ];
  }
  if (goalType === "pace_threshold") {
    return [
      { name: "targetPace", kind: "pace", label: "Target pace", required: true, layout: "ms" },
      {
        name: "thresholdTestDuration",
        kind: "duration",
        label: "Test time",
        required: false,
        layout: "ms",
      },
    ];
  }
  if (goalType === "power_threshold" || goalType === "hr_threshold") {
    return [
      goalType === "power_threshold"
        ? {
            name: "targetWatts",
            kind: "number",
            label: "Watts",
            required: true,
            min: positive,
            max: 2000,
            decimals: 0,
            unitLabel: "W",
          }
        : {
            name: "targetBpm",
            kind: "number",
            label: "Target bpm",
            required: true,
            min: positive,
            max: 260,
            decimals: 0,
            unitLabel: "bpm",
          },
      {
        name: "thresholdTestDuration",
        kind: "duration",
        label: "Test time",
        required: false,
        layout: "ms",
      },
    ];
  }
  return [
    {
      name: "consistencySessionsPerWeek",
      kind: "integer",
      label: "Sessions / week",
      required: false,
      min: 1,
      max: 14,
    },
    { name: "consistencyWeeks", kind: "integer", label: "Weeks", required: false, min: 1, max: 52 },
  ];
}

export function resetGoalEditorDraftForType(input: {
  draft: GoalEditorDraft;
  goalType: GoalEditorGoalType;
}): GoalEditorDraft {
  const { draft, goalType } = input;
  const base = createEmptyGoalDraft();
  return {
    ...base,
    title: draft.title,
    targetDate: draft.targetDate,
    importance: draft.importance,
    originalGoal: undefined,
    goalType,
    activityCategory:
      goalType === "pace_threshold"
        ? "run"
        : goalType === "power_threshold"
          ? "bike"
          : draft.activityCategory,
    thresholdTestDuration: goalType === "hr_threshold" ? "" : base.thresholdTestDuration,
  };
}
