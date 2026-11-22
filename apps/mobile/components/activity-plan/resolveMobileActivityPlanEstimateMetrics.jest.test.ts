import {
  activityPlanDraftMetrics,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { createActivityPlanStructure } from "../../test/activity-plan-projection-fixture";
import {
  canRetainSavedMobileActivityPlanEstimateMetrics,
  resolveMobileActivityPlanEstimateMetrics,
} from "./resolveMobileActivityPlanEstimateMetrics";

describe("resolveMobileActivityPlanEstimateMetrics", () => {
  const structure = createActivityPlanStructure();
  const facts = createUnavailableAthletePerformanceTargetFacts(
    "2026-01-01T12:00:00.000Z",
    "mobile-metric-parity-fixture",
  );
  const metrics = activityPlanDraftMetrics(structure, facts);

  it("keeps unchanged detail and edit estimates in parity for the same athlete facts", () => {
    expect(
      resolveMobileActivityPlanEstimateMetrics({
        structure,
        performanceTargets: facts,
        persistedMetrics: [],
      }),
    ).toEqual(metrics);
  });

  it("retains the authoritative saved projection until current athlete facts load", () => {
    expect(resolveMobileActivityPlanEstimateMetrics({ structure, persistedMetrics: metrics })).toBe(
      metrics,
    );
  });

  it("limits saved metrics to the untouched hydrated edit while athlete facts load", () => {
    const input = {
      athleteFactsLoading: true,
      editPlanId: "plan-1",
      hydratedPlanId: "plan-1",
      hydratedStructure: structure,
      isEditMode: true,
      structure,
    };

    expect(canRetainSavedMobileActivityPlanEstimateMetrics(input)).toBe(true);
    expect(
      canRetainSavedMobileActivityPlanEstimateMetrics({
        ...input,
        structure: { ...structure, blocks: [] },
      }),
    ).toBe(false);
    expect(canRetainSavedMobileActivityPlanEstimateMetrics({ ...input, isEditMode: false })).toBe(
      false,
    );
  });
});
