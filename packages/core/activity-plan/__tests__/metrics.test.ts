import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type ActivityPlanAuthoritativeMetrics,
  activityPlanAuthoritativeMetricsSchema,
  getAuthoritativeActivityPlanMetrics,
} from "../metrics";

const emptyProvenance = {
  estimated_duration: null,
  estimated_tss: null,
  intensity_factor: null,
  estimated_distance: null,
} as const;

describe("activity-plan authoritative metrics", () => {
  it("validates one strict schema with explicit units and provenance", () => {
    const metrics = activityPlanAuthoritativeMetricsSchema.parse({
      estimated_duration: 3_600,
      estimated_tss: 72,
      intensity_factor: 0.84,
      estimated_distance: 12_000,
      provenance: {
        estimated_duration: "estimated",
        estimated_tss: "estimated",
        intensity_factor: "estimated",
        estimated_distance: "prescribed",
      },
    });

    expect(metrics.estimated_distance).toBe(12_000);
    expectTypeOf(metrics).toEqualTypeOf<ActivityPlanAuthoritativeMetrics>();
  });

  it("rejects missing fields, negative metrics, and unknown fields", () => {
    expect(
      activityPlanAuthoritativeMetricsSchema.safeParse({
        estimated_duration: null,
        estimated_tss: null,
        intensity_factor: null,
        provenance: emptyProvenance,
      }).success,
    ).toBe(false);
    expect(
      activityPlanAuthoritativeMetricsSchema.safeParse({
        estimated_duration: -1,
        estimated_tss: null,
        intensity_factor: null,
        estimated_distance: null,
        provenance: emptyProvenance,
      }).success,
    ).toBe(false);
    expect(
      activityPlanAuthoritativeMetricsSchema.safeParse({
        estimated_duration: null,
        estimated_tss: null,
        intensity_factor: null,
        estimated_distance: null,
        provenance: emptyProvenance,
        legacy_distance: 12_000,
      }).success,
    ).toBe(false);
  });

  it("preserves explicit authoritative null instead of stale top-level values", () => {
    expect(
      getAuthoritativeActivityPlanMetrics({
        estimated_distance: 12_000,
        authoritative_metrics: { estimated_distance: null },
      }).estimated_distance,
    ).toBeNull();
  });

  it("falls back only when an authoritative field is absent", () => {
    expect(
      getAuthoritativeActivityPlanMetrics({
        estimated_distance: 12_000,
        authoritative_metrics: { estimated_duration: 3_600 },
      }).estimated_distance,
    ).toBe(12_000);
  });
});
