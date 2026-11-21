import type { TrainingStateVisualFixture } from "./shared";

export const trainingStateChartFixtures = {
  mixedSeries: {
    points: [
      {
        date: "2026-04-13",
        index: 0,
        projected: { fatigue: null, fitness: null, form: null },
        recorded: { fatigue: 30, fitness: 42, form: -12 },
      },
      {
        date: "2026-04-15",
        index: 2,
        projected: { fatigue: 32, fitness: 44, form: -12 },
        recorded: { fatigue: 0, fitness: null, form: null },
      },
    ],
    sourceStatus: "mixed",
    timeZone: "America/Los_Angeles",
    unitLabel: "Common Load points",
    colors: { fatigue: "#d97706", fitness: "#2563eb", form: "#7c3aed" },
    sources: ["recorded", "projected"],
  } satisfies TrainingStateVisualFixture,
} as const;
