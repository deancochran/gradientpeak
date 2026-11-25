export const integerStepperFixtures = {
  reps: { id: "reps", label: "Reps", value: 8, min: 1, max: 1000, testId: "reps-stepper" },
  weeks: {
    id: "microcycle-weeks",
    label: "Weeks",
    value: 6,
    min: 1,
    max: 16,
    step: 1,
    testId: "microcycle-weeks-stepper",
  },
} as const;
