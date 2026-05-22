export const tableFixtures = {
  weeklyWorkouts: {
    caption: "Weekly activities",
    columns: ["Day", "Activity", "Duration"],
    rows: [
      ["Monday", "Threshold intervals", "45 min"],
      ["Wednesday", "Endurance ride", "90 min"],
    ],
  },
} as const;
