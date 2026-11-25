import type { SessionScenarioComparisonProps } from "./shared";

export const sessionScenarioComparisonFixtures = {
  aligned: {
    alternative: {
      transitions: [
        {
          toAsOf: "2026-11-23T00:00:00.000Z",
          state: { longTermLoad: 42, recentLoad: 57, loadBalance: -15 },
        },
        {
          toAsOf: "2026-11-24T00:00:00.000Z",
          state: { longTermLoad: 43, recentLoad: 50, loadBalance: -7 },
        },
      ],
    },
    baseline: {
      transitions: [
        {
          toAsOf: "2026-11-23T00:00:00.000Z",
          state: { longTermLoad: 42, recentLoad: 57, loadBalance: -15 },
        },
        {
          toAsOf: "2026-11-24T00:00:00.000Z",
          state: { longTermLoad: 43, recentLoad: 55, loadBalance: -12 },
        },
      ],
    },
    timeZone: "UTC",
  } satisfies SessionScenarioComparisonProps,
} as const;
