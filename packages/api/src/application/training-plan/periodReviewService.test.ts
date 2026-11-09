import { describe, expect, it, vi } from "vitest";
import { buildTrainingComposition, readPlanPeriodReview } from "./periodReviewService";
import { planTabProjectionSchema } from "./planTabProjectionService";

const profileId = "11111111-1111-4111-8111-111111111111";

function projection(today: string | null) {
  return planTabProjectionSchema.parse({
    contractVersion: "plan-tab-projection-v2",
    asOf: "2026-03-04T12:00:00.000Z",
    planningTimezone: "America/Los_Angeles",
    today,
    currentScheduledPlan: null,
    timeline: null,
    fitness: {
      actual: [
        { date: "2026-03-03", longTermLoad: 40, recentLoad: 35, loadBalance: 5 },
        { date: "2026-03-04", longTermLoad: 42, recentLoad: 36, loadBalance: 6 },
      ],
      scheduled: [
        { date: "2026-03-03", longTermLoad: 41, recentLoad: 37, loadBalance: 4 },
        { date: "2026-03-04", longTermLoad: 43, recentLoad: 38, loadBalance: 5 },
      ],
      recommended: [],
    },
    fitnessHistory: { status: "current", verifiedThrough: "2026-03-04", maturity: "mature" },
    recommendationPoints: [],
    goalMarkers: [],
    dayLoads: {
      "2026-03-04": {
        status: "complete",
        commonLoad: 20,
        intensity: 0.7,
        contributingDurationSeconds: 1800,
        completedLoadStatus: "complete",
        completedLoad: 20,
        scheduledLoadStatus: "complete",
        scheduledLoad: 40,
        remainingLoadStatus: "complete",
        remainingLoad: 40,
        hasUnavailableCompletedLoad: false,
        recommendedLoadStatus: "complete",
        recommendedLoad: 50,
      },
    },
    ledgerItems: [
      {
        id: "completed",
        date: "2026-03-04",
        kind: "completed",
        title: "Completed",
        loadStatus: "complete",
        load: 20,
        intensityStatus: "complete",
        intensity: 0.7,
        contributingDurationStatus: "complete",
        contributingDurationSeconds: 1800,
        activityCategory: "run",
        categoryDoseStatus: "complete",
        categoryDoses: [
          {
            activityCategory: "run",
            durationSeconds: { status: "complete", value: 1800 },
            distanceMeters: { status: "complete", value: 5_000 },
            elevationGainMeters: { status: "complete", value: 80 },
          },
        ],
      },
      {
        id: "planned",
        date: "2026-03-04",
        kind: "planned",
        title: "Planned",
        loadStatus: "complete",
        load: 40,
        intensityStatus: "complete",
        intensity: 0.8,
        contributingDurationStatus: "complete",
        contributingDurationSeconds: 3600,
      },
    ],
    sourceCoverage: {
      activities: { startDate: "2026-03-04", endDate: "2026-03-04", status: "complete" },
      scheduledItems: { startDate: "2026-03-04", endDate: "2026-03-04", status: "partial" },
    },
    publishedRevision: 7,
    algorithmVersion: "projection-v1",
  });
}

describe("readPlanPeriodReview", () => {
  it("marks category composition partial when normalized segment evidence is unavailable", () => {
    const item = projection("2026-03-04").ledgerItems[0];
    if (!item) throw new Error("Expected completed fixture item");
    const result = buildTrainingComposition({
      items: [{ ...item, categoryDoseStatus: "unavailable" }],
      startDate: "2026-03-04",
      endDate: "2026-03-04",
      kind: "completed",
      source: "complete",
    });

    expect(result.coverage).toBe("partial");
    expect(result.categories[0]?.sessions).toEqual({ status: "partial", value: 1 });
    expect(result.categories[0]?.activeDays).toEqual({ status: "partial", value: 1 });
    expect(result.categories[0]?.distanceMeters).toEqual({ status: "partial", value: 5_000 });
  });

  it("does not attribute whole-activity values when normalized segment evidence is missing", () => {
    const item = projection("2026-03-04").ledgerItems[0];
    if (!item) throw new Error("Expected completed fixture item");
    const result = buildTrainingComposition({
      items: [
        {
          ...item,
          categoryDoses: undefined,
          categoryDoseStatus: "unavailable",
        },
      ],
      startDate: "2026-03-04",
      endDate: "2026-03-04",
      kind: "completed",
      source: "complete",
    });

    expect(result).toMatchObject({
      coverage: "partial",
      sessions: { status: "complete", value: 1 },
      categories: [],
    });
  });

  it("uses one bounded projection read and reports partial sources without threshold or recovery claims", async () => {
    const readProjection = vi.fn(async () => projection("2026-03-04"));
    const result = await readPlanPeriodReview({
      db: {} as never,
      profileId,
      request: { anchorDate: "2026-03-04", period: "day" },
      asOf: new Date("2026-03-04T12:00:00.000Z"),
      dependencies: { readProjection },
    });
    expect(readProjection).toHaveBeenCalledWith(
      expect.objectContaining({ request: { startDate: "2026-03-03", endDate: "2026-03-04" } }),
    );
    expect(result.periodState).toBe("current");
    expect(result.coverage).toEqual({ activities: "complete", scheduledItems: "partial" });
    expect(result.thresholdEvidence).toEqual({ status: "unavailable", reason: "not_composed" });
    expect(result.actual.load.value).toBe(20);
    expect(result.findings[0]).toMatchObject({
      type: "current_total_workload_above_target",
      workload: 60,
    });
    expect(result.trainingState.selected.actual).toMatchObject({
      source: "modeled_from_completed_load",
      end: { fitness: 42, fatigue: 36, form: 6 },
    });
    expect(result.actual.sessions.categoryCounts).toEqual([{ category: "run", count: 1 }]);
    expect(result.trainingComposition.selected.actual).toMatchObject({
      sessions: { status: "complete", value: 1 },
      activeDays: { status: "complete", value: 1 },
      categories: [
        {
          activityCategory: "run",
          sessions: { status: "complete", value: 1 },
          durationSeconds: { status: "complete", value: 1800 },
          distanceMeters: { status: "complete", value: 5_000 },
          elevationGainMeters: { status: "complete", value: 80 },
          longestSessionDurationSeconds: { status: "complete", value: 1800 },
        },
      ],
    });
  });

  it("does not present future actual work as known zero", async () => {
    const result = await readPlanPeriodReview({
      db: {} as never,
      profileId,
      request: { anchorDate: "2026-03-04", period: "day" },
      dependencies: { readProjection: async () => projection("2026-03-03") },
    });
    expect(result.periodState).toBe("future");
    expect(result.actual.load).toEqual({ status: "unavailable", value: null, knownSubtotal: null });
  });

  it("retains a finite partial Common Load subtotal in the period response", async () => {
    const partialProjection = projection("2026-03-04");
    const dayLoad = partialProjection.dayLoads["2026-03-04"];
    const completedItem = partialProjection.ledgerItems[0];
    const activityCoverage = partialProjection.sourceCoverage.activities;
    if (!dayLoad || !completedItem || !activityCoverage)
      throw new Error("Expected partial fixtures");
    partialProjection.dayLoads["2026-03-04"] = {
      ...dayLoad,
      status: "partial",
      commonLoad: 20,
      completedLoadStatus: "partial",
      completedLoad: 20,
      knownCompletedLoadSubtotal: 20,
    };
    partialProjection.ledgerItems[0] = {
      ...completedItem,
      loadStatus: "partial",
      load: 20,
      intensityStatus: "partial",
      intensity: 0.7,
      contributingDurationStatus: "partial",
      contributingDurationSeconds: 1800,
    };
    partialProjection.sourceCoverage.activities = {
      ...activityCoverage,
      status: "partial",
    };

    const result = await readPlanPeriodReview({
      db: {} as never,
      profileId,
      request: { anchorDate: "2026-03-04", period: "day" },
      dependencies: { readProjection: async () => partialProjection },
    });

    expect(result.actual.load).toEqual({ status: "partial", value: 20, knownSubtotal: 20 });
  });
});
