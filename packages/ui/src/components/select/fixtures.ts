import type { Option } from "./shared";

export const selectFixtures = {
  workoutType: {
    id: "workout-type",
    options: [
      { label: "Endurance", value: "endurance" },
      { label: "Tempo", value: "tempo" },
      { label: "Threshold", value: "threshold" },
    ] satisfies Option[],
    placeholder: "Choose workout type",
    testId: "workout-type-select",
    value: "tempo",
  },
} as const;
