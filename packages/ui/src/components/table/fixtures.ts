export const tableFixtures = {
  weeklyWorkouts: {
    caption: "Weekly workouts",
    columns: ["Day", "Workout", "Duration"],
    rows: [
      ["Monday", "Threshold intervals", "45 min"],
      ["Wednesday", "Endurance ride", "90 min"],
    ],
  },
} as const;
