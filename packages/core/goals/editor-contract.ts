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
  required: boolean;
  layout?: "hms" | "ms";
};

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
        required: race,
      },
      ...(goalType === "completion" || (draft.raceTargetMode ?? "time") === "time"
        ? [
            {
              name: "targetDuration",
              kind: "duration",
              required: race,
              layout: "hms",
            } as const,
          ]
        : [
            {
              name: "targetPace",
              kind: "pace",
              required: true,
              layout: "ms",
            } as const,
          ]),
    ];
  }
  if (goalType === "pace_threshold") {
    return [
      { name: "targetPace", kind: "pace", required: true, layout: "ms" },
      {
        name: "thresholdTestDuration",
        kind: "duration",
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
            required: true,
          }
        : {
            name: "targetBpm",
            kind: "number",
            required: true,
          },
      {
        name: "thresholdTestDuration",
        kind: "duration",
        required: false,
        layout: "ms",
      },
    ];
  }
  return [
    {
      name: "consistencySessionsPerWeek",
      kind: "integer",
      required: false,
    },
    { name: "consistencyWeeks", kind: "integer", required: false },
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
