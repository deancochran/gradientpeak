import { describe, expect, it } from "vitest";
import { buildPlanPeriodReview, resolvePlanPeriodReviewRanges } from "../periodReview";

const complete = (value: number) => ({ status: "complete" as const, value });
const state = (date: string, fitness: number, fatigue: number, form: number) => ({
  date,
  longTermLoad: fitness,
  recentLoad: fatigue,
  loadBalance: form,
});
const fact = (date: string, completed = 20, committed = 40, target = 50) => ({
  date,
  completedLoad: complete(completed),
  committedLoad: complete(committed),
  targetLoad: complete(target),
  actualSessions: 1,
  plannedSessions: 2,
  actualCategoryCounts: { run: 1, unknown: 1 },
  plannedCategoryCounts: { bike: 2 },
  actualDurationSeconds: complete(1800),
  plannedDurationSeconds: complete(3600),
  actualIntensity: complete(0.7),
  plannedIntensity: complete(0.8),
});
const defaults = {
  coverage: { activities: "complete" as const, scheduledItems: "complete" as const },
  actualStateFacts: [state("2026-03-03", 40, 35, 5), state("2026-03-04", 42, 36, 6)],
  scheduledStateFacts: [state("2026-03-03", 41, 37, 4), state("2026-03-04", 43, 38, 5)],
  fitnessHistory: { status: "current" as const, maturity: "mature" as const },
  todayDate: "2026-03-04",
};

describe("plan period review", () => {
  it("uses bounded calendar periods, including prior calendar months", () => {
    expect(
      resolvePlanPeriodReviewRanges({ anchorDate: "2026-03-04", period: "week" }),
    ).toMatchObject({
      selected: { startDate: "2026-03-02", endDate: "2026-03-08" },
      comparison: { startDate: "2026-02-23", endDate: "2026-03-01" },
    });
    expect(
      resolvePlanPeriodReviewRanges({ anchorDate: "2026-01-15", period: "month" }).readRange
        .inclusiveDayCount,
    ).toBe(62);
    expect(
      resolvePlanPeriodReviewRanges({ anchorDate: "2026-03-15", period: "month" }).comparison,
    ).toMatchObject({ startDate: "2026-02-01", endDate: "2026-02-28", inclusiveDayCount: 28 });
  });

  it("uses completed, committed, or total workload according to historical, future, and current semantics", () => {
    const historical = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "day" },
      dailyFacts: [fact("2026-03-04")],
      selectedPeriodState: "historical",
      ...defaults,
    });
    const future = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "day" },
      dailyFacts: [fact("2026-03-04")],
      selectedPeriodState: "future",
      ...defaults,
    });
    const current = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "day" },
      dailyFacts: [fact("2026-03-04")],
      selectedPeriodState: "current",
      ...defaults,
    });
    expect(historical.findings[0]).toMatchObject({
      type: "historical_completed_load_below_target",
      workload: 20,
    });
    expect(future.findings[0]).toMatchObject({
      type: "future_committed_load_below_target",
      workload: 40,
    });
    expect(future.actual.load).toEqual({
      status: "unavailable",
      value: null,
      knownSubtotal: null,
    });
    expect(current.findings[0]).toMatchObject({
      type: "current_total_workload_above_target",
      workload: 60,
    });
    expect(current.findings).toHaveLength(1);
    expect(current.findings.length).toBeLessThanOrEqual(3);
  });

  it("keeps future days from degrading current-period actual coverage", () => {
    const review = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "week" },
      dailyFacts: Array.from({ length: 7 }, (_, index) => fact(`2026-03-0${index + 2}`)),
      selectedPeriodState: "current",
      ...defaults,
    });

    expect(review.actual.load).toEqual({ status: "complete", value: 60, knownSubtotal: null });
    expect(review.actual.sessions).toMatchObject({ status: "complete", value: 3 });
  });

  it("returns modeled state endpoints and deltas without calling them observed", () => {
    const review = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "day" },
      dailyFacts: [fact("2026-03-04")],
      selectedPeriodState: "historical",
      ...defaults,
    });
    expect(review.trainingState.selected).toEqual({
      actual: {
        status: "available",
        source: "modeled_from_completed_load",
        start: { fitness: 42, fatigue: 36, form: 6 },
        end: { fitness: 42, fatigue: 36, form: 6 },
        delta: { fitness: 0, fatigue: 0, form: 0 },
      },
      scheduled: {
        status: "available",
        source: "modeled_from_scheduled_load",
        endpoint: { fitness: 43, fatigue: 38, form: 5 },
      },
    });
    expect(review.trainingState.fitnessHistory).toEqual({ status: "current", maturity: "mature" });
    expect(review.actual.sessions.categoryCounts).toEqual([
      { category: "unknown", count: 1 },
      { category: "run", count: 1 },
    ]);
  });

  it("retains a partial known subtotal without treating it as complete", () => {
    const partial = {
      ...fact("2026-03-04"),
      completedLoad: { status: "partial" as const, value: null, knownSubtotal: 12 },
    };
    const review = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "day" },
      dailyFacts: [partial],
      selectedPeriodState: "historical",
      ...defaults,
    });
    expect(review.actual.load).toEqual({ status: "partial", value: null, knownSubtotal: 12 });
    expect(review.trainingState.selected.actual).toMatchObject({
      status: "unavailable",
      source: "unavailable",
    });
    expect(review.findings).toEqual([
      { type: "coverage_limited", priority: 2, sources: ["activities"] },
    ]);
  });

  it("bounds category composition while retaining unknown sessions", () => {
    const manyCategories = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`category-${index}`, 1]),
    );
    const review = buildPlanPeriodReview({
      request: { anchorDate: "2026-03-04", period: "day" },
      dailyFacts: [
        { ...fact("2026-03-04"), actualCategoryCounts: { unknown: 2, ...manyCategories } },
      ],
      selectedPeriodState: "historical",
      ...defaults,
    });
    expect(review.actual.sessions.categoryCounts).toHaveLength(8);
    expect(review.actual.sessions.categoryCounts[0]).toEqual({ category: "unknown", count: 2 });
  });

  it("rejects unbounded evidence and caps findings", () => {
    expect(() =>
      buildPlanPeriodReview({
        request: { anchorDate: "2026-03-04", period: "day" },
        dailyFacts: [fact("2026-03-01"), fact("2026-03-02"), fact("2026-03-03")],
        selectedPeriodState: "historical",
        ...defaults,
      }),
    ).toThrow("bounded read range");
  });
});
