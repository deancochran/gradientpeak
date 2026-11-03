import { createUnavailableAthletePerformanceTargetFacts } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  thresholdOverviewRequestSchema,
  thresholdOverviewResponseSchema,
} from "./threshold-overview";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const AS_OF = "2026-08-25T12:00:00.000Z";

describe("threshold overview contracts", () => {
  it("defaults the bounded history request", () => {
    expect(thresholdOverviewRequestSchema.parse({})).toEqual({ historyLimit: 20 });
    expect(thresholdOverviewRequestSchema.safeParse({ historyLimit: 101 }).success).toBe(false);
  });

  it("accepts an unavailable calculated-threshold response without raw evidence", () => {
    const result = thresholdOverviewResponseSchema.parse({
      current: createUnavailableAthletePerformanceTargetFacts(AS_OF, ATHLETE_ID),
      history: { items: [], nextCursor: null },
      publication: { computedAt: null, status: "unavailable", publishedRevision: null },
    });

    expect(result.history.items).toEqual([]);
    expect(result).not.toHaveProperty("thresholdEvidence");
  });

  it.each([
    "bike",
    "run",
    "swim",
  ] as const)("accepts category-scoped %s LTHR history", (activityCategory) => {
    const result = thresholdOverviewResponseSchema.parse({
      current: createUnavailableAthletePerformanceTargetFacts(AS_OF, ATHLETE_ID),
      history: {
        items: [
          {
            thresholdId: "22222222-2222-4222-8222-222222222222",
            activityCategory,
            metric: "lthr",
            unit: "bpm",
            method: "lthr_30m_final_20m",
            value: 172,
            confidence: 0.8,
            effectiveAt: AS_OF,
            policyVersion: "threshold-policy-v1",
            sourceActivities: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "LTHR field test",
                finishedAt: AS_OF,
              },
            ],
          },
        ],
        nextCursor: null,
      },
      publication: { computedAt: AS_OF, status: "available", publishedRevision: 1 },
    });

    expect(result.history.items[0]).toMatchObject({
      activityCategory,
      metric: "lthr",
      unit: "bpm",
      method: "lthr_30m_final_20m",
    });
  });

  it.each([
    {
      activityCategory: "bike",
      metric: "power",
      unit: "watts",
      method: "bike_power_30m",
    },
    {
      activityCategory: "run",
      metric: "speed",
      unit: "meters_per_second",
      method: "run_speed_30m",
    },
    {
      activityCategory: "swim",
      metric: "speed",
      unit: "meters_per_second",
      method: "swim_speed_15m",
    },
  ] as const)("continues accepting direct $activityCategory/$metric history", ({
    activityCategory,
    metric,
    unit,
    method,
  }) => {
    const result = thresholdOverviewResponseSchema.safeParse({
      current: createUnavailableAthletePerformanceTargetFacts(AS_OF, ATHLETE_ID),
      history: {
        items: [
          {
            thresholdId: "22222222-2222-4222-8222-222222222222",
            activityCategory,
            metric,
            unit,
            method,
            value: 250,
            confidence: 0.8,
            effectiveAt: AS_OF,
            policyVersion: "threshold-policy-v1",
            sourceActivities: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "Threshold activity",
                finishedAt: AS_OF,
              },
            ],
          },
        ],
        nextCursor: null,
      },
      publication: { computedAt: AS_OF, status: "available", publishedRevision: 1 },
    });

    expect(result.success).toBe(true);
  });

  it("rejects mismatched LTHR and direct-threshold identities", () => {
    const response = (item: Record<string, unknown>) => ({
      current: createUnavailableAthletePerformanceTargetFacts(AS_OF, ATHLETE_ID),
      history: { items: [item], nextCursor: null },
      publication: { computedAt: AS_OF, status: "available", publishedRevision: 1 },
    });
    const base = {
      thresholdId: "22222222-2222-4222-8222-222222222222",
      activityCategory: "bike",
      metric: "lthr",
      unit: "bpm",
      method: "lthr_30m_final_20m",
      value: 172,
      confidence: 0.8,
      effectiveAt: AS_OF,
      policyVersion: "threshold-policy-v1",
      sourceActivities: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Threshold activity",
          finishedAt: AS_OF,
        },
      ],
    };

    expect(
      thresholdOverviewResponseSchema.safeParse(response({ ...base, unit: "watts" })).success,
    ).toBe(false);
    expect(
      thresholdOverviewResponseSchema.safeParse(
        response({
          ...base,
          metric: "power",
          unit: "watts",
          method: "run_speed_30m",
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects repository-only cursor fields in public history items", () => {
    const result = thresholdOverviewResponseSchema.safeParse({
      current: createUnavailableAthletePerformanceTargetFacts(AS_OF, ATHLETE_ID),
      history: {
        items: [
          {
            thresholdId: "22222222-2222-4222-8222-222222222222",
            activityCategory: "bike",
            metric: "power",
            unit: "watts",
            method: "bike_power_30m",
            value: 250,
            confidence: 0.8,
            effectiveAt: AS_OF,
            policyVersion: "threshold-policy-v1",
            createdAt: AS_OF,
            sourceActivities: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "Threshold ride",
                finishedAt: AS_OF,
              },
            ],
          },
        ],
        nextCursor: null,
      },
      publication: { computedAt: AS_OF, status: "available", publishedRevision: 1 },
    });

    expect(result.success).toBe(false);
  });
});
