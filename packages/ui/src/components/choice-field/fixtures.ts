import { progressionStyleChoices } from "@repo/core";

export const choiceFieldFixtures = {
  binary: {
    label: "Target style",
    options: [
      { value: "time", label: "Time" },
      { value: "pace", label: "Pace" },
    ],
    value: "time",
    testId: "choice-binary",
  },
  catalog: {
    label: "Distance preset",
    options: Array.from({ length: 9 }, (_, value) => ({
      value: String(value),
      label: `Distance ${value + 1}`,
    })),
    value: "0",
    testId: "choice-catalog",
  },
  progression: {
    label: "Progression",
    options: progressionStyleChoices,
    value: "balanced",
    testId: "choice-progression",
  },
  empty: {
    label: "Progression",
    options: progressionStyleChoices,
    value: undefined,
    testId: "choice-empty",
  },
  unavailable: {
    label: "Progression",
    options: progressionStyleChoices,
    value: "legacy",
    testId: "choice-unavailable",
  },
} as const;
