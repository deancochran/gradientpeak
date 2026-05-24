import type { Option } from "./shared";

export const selectFixtures = {
  workoutType: {
    id: "activity-type",
    options: [
      { label: "Endurance", value: "endurance" },
      { label: "Tempo", value: "tempo" },
      { label: "Threshold", value: "threshold" },
    ] satisfies Option[],
    placeholder: "Choose activity type",
    testId: "activity-type-select",
    value: "tempo",
  },
} as const;
