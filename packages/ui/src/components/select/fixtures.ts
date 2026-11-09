import type { Option } from "./shared";

export const selectFixtures = {
  sessionFocus: {
    id: "session-focus",
    options: [
      { label: "Endurance", value: "endurance" },
      { label: "Tempo", value: "tempo" },
      { label: "Threshold", value: "threshold" },
    ] satisfies Option[],
    placeholder: "Choose session focus",
    testId: "session-focus-select",
    value: "tempo",
  },
} as const;
