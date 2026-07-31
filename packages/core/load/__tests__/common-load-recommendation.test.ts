import { describe, expect, it } from "vitest";
import {
  buildCommonLoadRecommendation,
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  commonLoadRecommendationSchema,
} from "../index";

const computedAsOf = "2026-07-28T12:00:00.000Z";
const trainingPlanId = "11111111-1111-4111-8111-111111111111";
const firstItemId = "22222222-2222-4222-8222-222222222222";
const secondItemId = "33333333-3333-4333-8333-333333333333";

function available(loadDurationSeconds = 3600, intensity = 1): CommonLoadResult {
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-07-01T00:00:00.000Z",
      valid_at: "2026-07-01T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "bike-threshold",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-07-01T00:00:00.000Z",
      validAt: "2026-07-01T00:00:00.000Z",
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: "bike-threshold",
    },
    evidenceFingerprint: "bike-prescription",
    computedAsOf,
    estimated: true,
    contributingDurationSeconds: loadDurationSeconds,
    intensity,
  });
}

function build(overrides: Record<string, unknown> = {}) {
  return buildCommonLoadRecommendation({
    computedAsOf,
    planningTimezone: "UTC",
    planningDate: "2026-07-28",
    startDate: "2026-07-28",
    endDate: "2026-08-02",
    sourceStatus: "complete",
    trainingPlanId,
    scheduleBatchId: null,
    items: [
      {
        scheduledItemId: firstItemId,
        recommendationDate: "2026-07-30",
        commonLoad: available(),
      },
    ],
    ...overrides,
  } as never);
}

describe("common Load recommendation v1", () => {
  it("builds a dense common-model series and marks absent covered days as prescribed rest", () => {
    const result = build();

    expect(result).toMatchObject({
      status: "complete",
      policyVersion: "common_load_recommendation_v1",
      model: "gradientpeak_relative_load",
      version: "1",
      source: "applied_training_plan_prescription",
      coverage: { startDate: "2026-07-28", endDate: "2026-07-30" },
    });
    expect(result.points.map((point) => [point.date, point.state, point.load])).toEqual([
      ["2026-07-28", "known_zero", 0],
      ["2026-07-29", "known_zero", 0],
      ["2026-07-30", "complete", 100],
    ]);
    expect(commonLoadRecommendationSchema.safeParse(result).success).toBe(true);
  });

  it("combines same-day prescriptions only after both use the common model", () => {
    const result = build({
      startDate: "2026-07-30",
      items: [
        {
          scheduledItemId: firstItemId,
          recommendationDate: "2026-07-30",
          commonLoad: available(1800, 1),
        },
        {
          scheduledItemId: secondItemId,
          recommendationDate: "2026-07-30",
          commonLoad: available(1800, 1),
        },
      ],
    });

    expect(result.status).toBe("complete");
    expect(result.points[0]).toMatchObject({
      state: "complete",
      load: 100,
      sourceScheduledItemIds: [firstItemId, secondItemId],
    });
  });

  it("keeps an unavailable prescription unavailable instead of converting it to zero", () => {
    const unavailable = {
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: "other",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf,
      contributingDurationSeconds: null,
      reason: "activity_data_missing",
    } as const;
    const result = build({
      items: [
        { scheduledItemId: firstItemId, recommendationDate: "2026-07-30", commonLoad: unavailable },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.points.at(-1)).toMatchObject({
      state: "unavailable",
      load: null,
      aggregate: { status: "unavailable" },
    });
  });

  it.each([
    [{ sourceStatus: "partial" }, "source_incomplete"],
    [{ trainingPlanId: null, items: [] }, "no_active_training_plan"],
    [{ items: [], startDate: "2026-08-01" }, "no_future_prescriptions"],
  ])("abstains when recommendation evidence is unavailable", (overrides, reason) => {
    expect(build(overrides)).toMatchObject({ status: "unavailable", reason, points: [] });
  });

  it("rejects duplicate scheduled sources rather than double-counting them", () => {
    const result = build({
      items: [
        { scheduledItemId: firstItemId, recommendationDate: "2026-07-30", commonLoad: available() },
        { scheduledItemId: firstItemId, recommendationDate: "2026-07-31", commonLoad: available() },
      ],
    });

    expect(result).toMatchObject({ status: "unavailable", reason: "invalid_input" });
  });

  it("abstains instead of allocating an unbounded dense projection", () => {
    const result = build({
      endDate: "2027-08-01",
      items: [
        {
          scheduledItemId: firstItemId,
          recommendationDate: "2027-08-01",
          commonLoad: available(),
        },
      ],
    });

    expect(result).toMatchObject({ status: "unavailable", reason: "range_limit_exceeded" });
  });

  it("rejects impossible calendar dates", () => {
    expect(build({ startDate: "2026-02-30" })).toMatchObject({
      status: "unavailable",
      reason: "invalid_input",
    });
  });
});
