import { simulateTrainingPlan } from "@repo/core";
import { describe, expect, it } from "vitest";
import { deriveTrainingPathChartFromBackendProjection } from "./chart-adapter";

describe("deriveTrainingPathChartFromBackendProjection", () => {
  it("maps only authoritative simulation transitions without inventing local load targets", () => {
    const simulation = simulateTrainingPlan({
      baseline: {
        contractVersion: "athlete-state-projection-v1",
        athleteId: "44444444-4444-4444-8444-444444444444",
        stateRevision: 4,
        asOf: "2026-08-01T00:00:00.000Z",
        longTermLoad: 40,
        recentLoad: 30,
        loadBalance: 10,
        evidenceConfidence: 0.8,
        capabilities: [],
        athleteAgeYears: 35,
      },
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "plan:sessions.0",
          scheduledAt: "2026-08-02T00:00:00.000Z",
          activityCategory: "run",
          commonLoad: 80,
        },
      ],
      simulationAt: "2026-08-02T00:00:00.000Z",
      planningTimezone: "UTC",
      goal: null,
    });

    const result = deriveTrainingPathChartFromBackendProjection({
      backendPreview: {
        source: "backend",
        isAvailable: true,
        projectionChart: simulation,
        simulation,
      },
      startDate: "2026-08-01",
    });

    expect(result.source).toBe("backend");
    expect(result.chart.dailyPoints).toEqual([
      expect.objectContaining({
        date: "2026-08-02",
        plannedLoad: 0,
        targetLoad: 0,
        fitnessCtl: simulation.projectedState.longTermLoad,
        fatigueAtl: simulation.projectedState.recentLoad,
        formTsb: simulation.projectedState.loadBalance,
      }),
    ]);
    expect(result.chart.weeks[0]).toEqual(
      expect.objectContaining({ plannedLoad: 0, targetLoad: 0 }),
    );
  });
});
