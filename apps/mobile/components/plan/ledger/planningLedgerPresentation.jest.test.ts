import type { PlanningLedger } from "@repo/core";
import {
  buildPlanningLedgerPresentation,
  formatDurationSeconds,
  formatIntensityMetric,
  formatLoadMetric,
} from "./planningLedgerPresentation";

const partial = (value: number) => ({ status: "partial" as const, value });

const ledger: PlanningLedger = {
  anchorDate: "2026-04-15",
  asOf: "2026-04-15T12:00:00.000Z",
  contractVersion: "planning-ledger-v3",
  contributingDurationSeconds: partial(3600),
  dailyBreakdown: [
    {
      completed: partial(15),
      contributingDurationSeconds: partial(1800),
      date: "2026-04-15",
      effective: partial(40),
      intensity: partial(0.72),
      planned: partial(25),
      remaining: partial(10),
    },
  ],
  entries: [],
  entriesTruncated: false,
  intensity: partial(0.72),
  intensityDistribution: {
    bands: [
      {
        band: "recovery",
        minimumIntensity: 0,
        maximumIntensity: 0.55,
        durationSeconds: 0,
        percentage: 0,
      },
      {
        band: "endurance",
        minimumIntensity: 0.55,
        maximumIntensity: 0.75,
        durationSeconds: 3600,
        percentage: 100,
      },
      {
        band: "tempo",
        minimumIntensity: 0.75,
        maximumIntensity: 0.85,
        durationSeconds: 0,
        percentage: 0,
      },
      {
        band: "threshold",
        minimumIntensity: 0.85,
        maximumIntensity: 0.95,
        durationSeconds: 0,
        percentage: 0,
      },
      {
        band: "vo2max",
        minimumIntensity: 0.95,
        maximumIntensity: 1.05,
        durationSeconds: 0,
        percentage: 0,
      },
      {
        band: "anaerobic",
        minimumIntensity: 1.05,
        maximumIntensity: 1.15,
        durationSeconds: 0,
        percentage: 0,
      },
      {
        band: "neuromuscular",
        minimumIntensity: 1.15,
        maximumIntensity: 1.5,
        durationSeconds: 0,
        percentage: 0,
      },
    ],
    contributingDurationSeconds: 3600,
    status: "partial",
  },
  load: {
    completed: partial(15),
    effective: partial(40),
    planned: partial(25),
    remaining: partial(10),
  },
  milestones: [],
  modelContext: {
    algorithmVersion: "athlete-state-v1",
    commonLoadModel: "gradientpeak_relative_load",
    commonLoadVersion: "1",
    publishedRevision: 2,
  },
  period: "week",
  periodEnd: "2026-04-19",
  periodStart: "2026-04-13",
  planningTimezone: "UTC",
  sourceCoverage: {
    activities: { endDate: "2026-04-19", startDate: "2026-04-13", status: "partial" },
    calendarEvents: null,
    groupEvents: null,
    scheduledItems: { endDate: "2026-04-19", startDate: "2026-04-13", status: "partial" },
  },
  trainingState: {
    actual: {
      fatigue: { observedOn: null, source: null, status: "unavailable", value: null },
      fitness: { observedOn: null, source: null, status: "unavailable", value: null },
    },
    planned: {
      fatigue: { observedOn: null, source: null, status: "unavailable", value: null },
      fitness: { observedOn: null, source: null, status: "unavailable", value: null },
    },
    series: [{ actual: { fatigue: 30, fitness: 42, form: 12 }, date: "2026-04-15", planned: null }],
  },
};

it("formats finite partial values as normal numeric presentation", () => {
  const model = buildPlanningLedgerPresentation(ledger);

  expect(model.load.completedLabel).toBe("15");
  expect(model.days[0]).toMatchObject({
    completedLabel: "15",
    durationLabel: "30 min",
    intensityLabel: "0.72",
    plannedLabel: "25",
  });
  expect(JSON.stringify(model)).not.toContain("~");
  expect(JSON.stringify(model)).not.toContain("partial");
});

it("renders unavailable load, duration, and intensity as a dash", () => {
  const unavailable = { status: "unavailable" as const, value: null };

  expect(formatLoadMetric(unavailable)).toBe("—");
  expect(formatDurationSeconds(null)).toBe("—");
  expect(formatIntensityMetric(unavailable)).toBe("—");
});

it("uses training-state series and intensity distribution in chart-ready models", () => {
  const model = buildPlanningLedgerPresentation(ledger);

  expect(model.state.points).toEqual([
    expect.objectContaining({
      actualFatigue: 30,
      actualFitness: 42,
      actualForm: 12,
      projectedFatigue: null,
      projectedFitness: null,
      projectedForm: null,
    }),
  ]);
  expect(model.state.latestSource).toBe("Recorded");
  expect(model.intensity.bands).toEqual([
    expect.objectContaining({ band: "endurance", durationLabel: "1h", percentageLabel: "100%" }),
  ]);
  expect(model.days[0]?.accessibilityLabel).toContain("Completed 15. Planned 25.");
});
