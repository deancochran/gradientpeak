import { describe, expect, it } from "vitest";
import type { BuilderDailyTrainingPathChartViewModel } from "../view-model";
import { deriveTrainingPathChartFromActiveProjection } from "./chart-adapter";
import type { ActiveTrainingPlanProjection } from "./types";

function buildLocalChart(): BuilderDailyTrainingPathChartViewModel {
  return {
    dailyPoints: [
      {
        date: "2026-01-05",
        plannedLoad: 20,
        tentativePlannedLoad: 0,
        completedLoad: 0,
        targetLoad: 300,
        actualOrScheduledLoad: 20,
        loadDelta: -280,
        plannedDelta: -280,
        fitnessCtl: null,
        scheduledFitnessCtl: null,
        targetFitnessCtl: null,
        fatigueAtl: null,
        formTsb: null,
        readinessScore: null,
        annotations: [],
      },
      {
        date: "2026-01-06",
        plannedLoad: 30,
        tentativePlannedLoad: 5,
        completedLoad: 25,
        targetLoad: 40,
        actualOrScheduledLoad: 25,
        loadDelta: -15,
        plannedDelta: -5,
        fitnessCtl: null,
        scheduledFitnessCtl: null,
        targetFitnessCtl: null,
        fatigueAtl: null,
        formTsb: null,
        readinessScore: null,
        annotations: [],
      },
    ],
    weeks: [
      {
        weekStart: "2026-01-05",
        weekEnd: "2026-01-11",
        label: "Week 1",
        completedLoad: null,
        plannedLoad: 20,
        tentativePlannedLoad: null,
        targetLoad: 300,
        fitness: null,
        scheduledFitness: null,
        targetFitness: null,
        fatigue: null,
        form: null,
        riskZone: null,
        isCurrent: true,
        isSelected: true,
      },
    ],
    selectedWeekSummary: null,
    goalMarkers: [],
    todayKey: "2026-01-05",
    domains: { load: [0, 300], fitness: [0, 50] },
    emptyState: null,
  };
}

describe("deriveTrainingPathChartFromActiveProjection", () => {
  it("replaces local daily target load with backend daily load points", () => {
    const result = deriveTrainingPathChartFromActiveProjection({
      activeProjection: {
        source: "backend",
        isAvailable: true,
        readinessScore: null,
        readinessConfidence: null,
        feasibilityState: null,
        feasibilityReasons: [],
        conflicts: { isBlocking: false, items: [] },
        planPreview: null,
        projectionChart: {
          points: [
            {
              date: "2026-01-05",
              predicted_load: 300,
              predicted_fitness_longTermLoad: 40,
              predicted_fatigue_recentLoad: 45,
              predicted_form_loadBalance: -5,
            },
          ],
          daily_load_points: [{ date: "2026-01-05", recommended_common_load: 72 }],
        },
        previewSnapshotToken: null,
      } satisfies ActiveTrainingPlanProjection,
      localChart: buildLocalChart(),
    });

    expect(result.source).toBe("backend");
    expect(result.chart.dailyPoints[0]?.targetLoad).toBe(72);
    expect(result.chart.dailyPoints[0]?.loadDelta).toBe(-52);
    expect(result.chart.dailyPoints).toHaveLength(2);
    expect(result.chart.dailyPoints[1]).toMatchObject({
      date: "2026-01-06",
      targetLoad: 40,
      actualOrScheduledLoad: 25,
      loadDelta: -15,
      plannedDelta: -5,
    });
    expect(result.chart.weeks[0]?.tentativePlannedLoad).toBeNull();
  });

  it("keeps local daily targets when backend daily load points are missing", () => {
    const result = deriveTrainingPathChartFromActiveProjection({
      activeProjection: {
        source: "backend",
        isAvailable: true,
        readinessScore: null,
        readinessConfidence: null,
        feasibilityState: null,
        feasibilityReasons: [],
        conflicts: { isBlocking: false, items: [] },
        planPreview: null,
        projectionChart: {
          points: [
            {
              date: "2026-01-05",
              predicted_load: 300,
              predicted_fitness_longTermLoad: 40,
              predicted_fatigue_recentLoad: 45,
              predicted_form_loadBalance: -5,
            },
          ],
        },
        previewSnapshotToken: null,
      } satisfies ActiveTrainingPlanProjection,
      localChart: buildLocalChart(),
    });

    expect(result.source).toBe("backend");
    expect(result.chart.dailyPoints[0]?.targetLoad).toBe(300);
    expect(result.chart.dailyPoints[0]?.loadDelta).toBe(-280);
  });

  it("falls back to the local chart when backend projection points are unusable", () => {
    const localChart = buildLocalChart();
    const result = deriveTrainingPathChartFromActiveProjection({
      activeProjection: {
        source: "backend",
        isAvailable: true,
        readinessScore: null,
        readinessConfidence: null,
        feasibilityState: null,
        feasibilityReasons: [],
        conflicts: { isBlocking: false, items: [] },
        planPreview: null,
        projectionChart: { points: [], daily_load_points: [] },
        previewSnapshotToken: null,
      } satisfies ActiveTrainingPlanProjection,
      localChart,
    });

    expect(result).toEqual({ chart: localChart, source: "local" });
  });

  it("does not expose backend Fitness, ATL, or TSB when local history is unavailable", () => {
    const localChart = { ...buildLocalChart(), emptyState: "noActivityHistory" as const };
    const result = deriveTrainingPathChartFromActiveProjection({
      activeProjection: {
        source: "backend",
        isAvailable: true,
        readinessScore: null,
        readinessConfidence: null,
        feasibilityState: null,
        feasibilityReasons: [],
        conflicts: { isBlocking: false, items: [] },
        planPreview: null,
        projectionChart: {
          points: [
            {
              date: "2026-01-05",
              predicted_load: 300,
              predicted_fitness_longTermLoad: 40,
              predicted_fatigue_recentLoad: 45,
              predicted_form_loadBalance: -5,
            },
          ],
          daily_load_points: [{ date: "2026-01-05", recommended_common_load: 72 }],
        },
        previewSnapshotToken: null,
      } satisfies ActiveTrainingPlanProjection,
      localChart,
    });

    expect(result.source).toBe("backend");
    expect(result.chart.emptyState).toBe("noActivityHistory");
    expect(result.chart.dailyPoints[0]).toMatchObject({
      scheduledFitnessCtl: null,
      targetFitnessCtl: null,
      fatigueAtl: null,
      formTsb: null,
    });
    expect(result.chart.weeks[0]).toMatchObject({
      fitness: null,
      scheduledFitness: null,
      targetFitness: null,
      fatigue: null,
      form: null,
    });
  });
});
