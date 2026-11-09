export const durationInputFixtures = {
  testTime: {
    id: "test-duration",
    label: "Test time",
    layout: "ms",
    value: "1:30:00",
    testId: "test-time-duration-input",
  },
  longGoal: {
    id: "long-goal-duration",
    label: "Goal time",
    layout: "hms",
    value: "25:00:01",
    testId: "long-goal-duration-input",
  },
  activity: {
    id: "activity-duration",
    label: "Activity duration",
    value: "1:35:00",
    placeholder: "e.g., 1:35:00",
    testId: "activity-duration-input",
  },
} as const;
