import { describe, expect, it } from "vitest";
import type { BuilderDailyTrainingPathChartViewModel } from "../view-model";
import { deriveTrainingPathChartFromActiveProjection } from "./chart-adapter";
import type { ActiveTrainingPlanProjection } from "./types";

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
          display_points: [
            {
              date: "2026-01-05",
              predicted_load_tss: 300,
              predicted_fitness_ctl: 40,
              predicted_fatigue_atl: 45,
              predicted_form_tsb: -5,
            },
          ],
          daily_load_points: [{ date: "2026-01-05", recommended_load_tss: 72 }],
        },
        previewSnapshotToken: null,
      } satisfies ActiveTrainingPlanProjection,
      localChart: {
        dailyPoints: [
          {
            date: "2026-01-05",
            plannedLoadTss: 20,
            tentativePlannedLoadTss: 0,
            completedLoadTss: 0,
            targetLoadTss: 300,
            actualOrScheduledLoadTss: 20,
            loadDeltaTss: -280,
            plannedDeltaTss: -280,
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
      } satisfies BuilderDailyTrainingPathChartViewModel,
    });

    expect(result.source).toBe("backend");
    expect(result.chart.dailyPoints[0]?.targetLoadTss).toBe(72);
    expect(result.chart.dailyPoints[0]?.loadDeltaTss).toBe(-52);
  });
});
