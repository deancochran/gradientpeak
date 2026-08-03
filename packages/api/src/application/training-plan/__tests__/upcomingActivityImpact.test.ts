import { compileActivityPlan, SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it } from "vitest";
import { buildUpcomingActivityImpact } from "../upcomingActivityImpact";

const availableCommonLoad = {
  status: "available" as const,
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  activity_category: "bike" as const,
  method: "power_threshold" as const,
  quality: {
    source: "manual" as const,
    observed_at: "2026-07-15T00:00:00.000Z",
    valid_at: "2026-07-15T00:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "1",
    evidence_fingerprint: "fixture",
  },
  thresholdEvidence: {
    type: "ftp_watts" as const,
    value: 250,
    unit: "watts" as const,
    source: "manual" as const,
    observedAt: "2026-07-15T00:00:00.000Z",
    validAt: "2026-07-15T00:00:00.000Z",
    freshness: "current" as const,
    calculationVersion: "1",
    sourceFingerprint: "fixture",
  },
  evidenceFingerprint: "fixture",
  computedAsOf: "2026-07-15T00:00:00.000Z",
  contributingDurationSeconds: 3600,
  load: 65,
  intensity: 0.8,
  estimated: true,
};

function structureForActivityCategory(activity_category: "bike") {
  const template = SYSTEM_TEMPLATES.find(
    (candidate) => compileActivityPlan(candidate.structure).activity_category === activity_category,
  );
  if (!template) throw new Error(`Missing ${activity_category} system template`);
  return template.structure;
}

describe("buildUpcomingActivityImpact", () => {
  it("returns only supported planned-load context", () => {
    const [impact] = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: {
            id: "plan-1",
            name: "Tempo ride",
            structure: structureForActivityCategory("bike"),
          },
        },
      ],
      commonLoadByPlanId: new Map([["plan-1", availableCommonLoad]]),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toMatchObject({
      common_load: expect.objectContaining({ status: "available", load: 65 }),
      activity_category: "bike",
      confidence: "medium",
      explanation: "This session's planned load is above the recommended daily load.",
    });
    expect(impact).not.toHaveProperty("short_term_readiness_delta");
    expect(impact).not.toHaveProperty("fitness_contribution");
  });

  it("gives an explicit reason when planned load cannot be estimated", () => {
    const [impact] = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: {
            id: "plan-1",
            name: "Tempo ride",
            structure: structureForActivityCategory("bike"),
          },
        },
      ],
      commonLoadByPlanId: new Map(),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toMatchObject({
      common_load: null,
      confidence: "low",
      explanation:
        "Add duration and intensity to compare this session's planned load with the recommended daily load.",
    });
    expect(impact).not.toHaveProperty("short_term_readiness_delta");
    expect(impact).not.toHaveProperty("fitness_contribution");
  });

  it("omits a planned impact whose linked plan is not canonical", () => {
    const impact = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: { id: "plan-1", name: "Legacy plan", structure: { version: 2 } },
        },
      ],
      commonLoadByPlanId: new Map([["plan-1", availableCommonLoad]]),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toEqual([]);
  });
});
