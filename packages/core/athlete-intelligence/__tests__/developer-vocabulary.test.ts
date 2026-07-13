import { describe, expect, it } from "vitest";

import * as canonical from "..";
import { athleteMetricTypeSchema } from "../evidence-contracts";
import { metricCatalog } from "../metric-catalog";
import { physicalDimensionOrder, physicalDimensionSchema } from "../physical-dimensions";
import {
  ACTIVITY_READINESS_CONSTANTS,
  ACTIVITY_READINESS_POLICY_VERSION,
} from "../policies/activity-readiness";
import {
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY,
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
  EFFORT_CURVE_POLICY_VERSION,
} from "../policies/effort-curves";
import { GOAL_DEMAND_POLICY_VERSION } from "../policies/goal-demand";
import {
  PHYSIOLOGY_METRICS_POLICY_CONSTANTS,
  PHYSIOLOGY_METRICS_POLICY_VERSION,
} from "../policies/physiology-metrics";
import {
  PROJECTION_DECISION_QUALITY_POLICY,
  PROJECTION_DECISION_QUALITY_POLICY_VERSION,
} from "../policies/projection";
import {
  MAX_RECURRENCE_OCCURRENCES,
  TRAINING_FEASIBILITY_POLICY_VERSION,
} from "../policies/training-feasibility";
import { policyDescriptors } from "../policy-descriptors";

describe("athlete intelligence developer vocabulary", () => {
  it("is exhaustive for supported metric types with immutable calculation metadata", () => {
    expect(Object.keys(metricCatalog).sort()).toEqual([...athleteMetricTypeSchema.options].sort());
    for (const definition of Object.values(metricCatalog)) {
      expect(definition.canonicalUnit).toBeTruthy();
      expect(definition.supportedPolicies.length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(metricCatalog)).toBe(true);
  });

  it("declares an exhaustive, immutable policy compatibility vocabulary", () => {
    const expectedDescriptors = {
      "activity-readiness": {
        id: "activity-readiness",
        version: ACTIVITY_READINESS_POLICY_VERSION,
        supportedSports: "any",
        supportedModalities: ["activity", "readiness_context"],
        constants: ACTIVITY_READINESS_CONSTANTS,
      },
      "effort-curve": {
        id: "effort-curve",
        version: EFFORT_CURVE_POLICY_VERSION,
        supportedSports: ["bike", "run"],
        supportedModalities: ["power", "pace"],
        constants: {},
      },
      "effort-curve-decision-uncertainty": {
        id: "effort-curve-decision-uncertainty",
        version: EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
        supportedSports: ["bike", "run"],
        supportedModalities: ["power", "pace"],
        constants: EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY,
      },
      "goal-demand": {
        id: "goal-demand",
        version: GOAL_DEMAND_POLICY_VERSION,
        supportedSports: "any",
        supportedModalities: ["event_performance", "threshold", "completion", "consistency"],
        constants: {},
      },
      "physiology-metrics": {
        id: "physiology-metrics",
        version: PHYSIOLOGY_METRICS_POLICY_VERSION,
        supportedSports: "any",
        supportedModalities: [
          "profile_metric",
          "manual_observation",
          "activity",
          "activity_effort",
        ],
        constants: PHYSIOLOGY_METRICS_POLICY_CONSTANTS,
      },
      "projection-decision-quality": {
        id: "projection-decision-quality",
        version: PROJECTION_DECISION_QUALITY_POLICY_VERSION,
        supportedSports: "any",
        supportedModalities: ["projection"],
        constants: PROJECTION_DECISION_QUALITY_POLICY,
      },
      "training-feasibility": {
        id: "training-feasibility",
        version: TRAINING_FEASIBILITY_POLICY_VERSION,
        supportedSports: "any",
        supportedModalities: ["schedule", "availability", "training_context"],
        constants: { maxRecurrenceOccurrences: MAX_RECURRENCE_OCCURRENCES },
      },
    };

    expect(Object.keys(policyDescriptors).sort()).toEqual(Object.keys(expectedDescriptors).sort());
    expect(policyDescriptors).toEqual(expectedDescriptors);
    expect(Object.isFrozen(policyDescriptors)).toBe(true);

    for (const [id, descriptor] of Object.entries(policyDescriptors)) {
      expect(descriptor.id).toBe(id);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.supportedModalities)).toBe(true);
      expect(Object.isFrozen(descriptor.constants)).toBe(true);
      if (descriptor.supportedSports !== "any") {
        expect(Object.isFrozen(descriptor.supportedSports)).toBe(true);
      }
    }

    expect(policyDescriptors["activity-readiness"].constants).toBe(ACTIVITY_READINESS_CONSTANTS);
    expect(policyDescriptors["effort-curve-decision-uncertainty"].constants).toBe(
      EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY,
    );
    expect(policyDescriptors["physiology-metrics"].constants).toBe(
      PHYSIOLOGY_METRICS_POLICY_CONSTANTS,
    );
    expect(policyDescriptors["projection-decision-quality"].constants).toBe(
      PROJECTION_DECISION_QUALITY_POLICY,
    );
    expect(policyDescriptors["training-feasibility"].constants).toEqual({
      maxRecurrenceOccurrences: MAX_RECURRENCE_OCCURRENCES,
    });
    expect(policyDescriptors["effort-curve"].constants).toEqual({});
    expect(policyDescriptors["goal-demand"].constants).toEqual({});
  });

  it("uses one ordered, closed physical dimension vocabulary", () => {
    expect(physicalDimensionOrder).toEqual([
      "threshold",
      "speed",
      "distance",
      "duration",
      "frequency",
    ]);
    expect(physicalDimensionSchema.safeParse("generic_score").success).toBe(false);
  });

  it("exports only canonical evidence, model, policy, and projection APIs", () => {
    expect(canonical).toMatchObject({
      athleteIntelligenceModelInputSchema: expect.anything(),
      evidenceItemSchema: expect.anything(),
      calculateGoalDemandV1: expect.any(Function),
      assembleWholeAthleteProjectionV1: expect.any(Function),
    });
    expect(canonical).not.toHaveProperty("legacy");
    expect(canonical).not.toHaveProperty("evaluateGoalGaps");
    expect(canonical).not.toHaveProperty("deriveGoalRequirementSet");
  });
});
