import { describe, expect, it } from "vitest";
import { RUNNING_DURATION_PERFORMANCE_FIXTURE_V1 } from "../../duration-performance/__tests__/fixtures/duration-performance-v1";
import type { CanonicalRunningDurationEffortEvidence } from "../../duration-performance/contracts";
import { calculateRunningDurationPerformance } from "../../duration-performance/running";
import type { CanonicalActivityCategory } from "../../schemas/activity-category";
import { composeAthleteCapabilityProfile } from "../composition";
import type {
  AthleteCapabilityMeasurementBasis,
  AthleteCapabilityName,
  AthleteCapabilityUnit,
} from "../contracts";
import {
  type CapabilityPlanningDemand,
  type CapabilityPlanningSelectionContext,
  projectAthleteCapabilitiesForPlanning,
} from "../planning";
import {
  ATHLETE_CAPABILITY_FIXTURE_V1,
  canonicalCapabilityCompositionInput,
} from "./fixtures/capability-profile-v1";

const PROPERTY_SEED = 0xca9a_2026;

function pseudoRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

function selectionContext(input: {
  planningAsOf?: string;
  categoryPriority?: CapabilityPlanningSelectionContext["categoryPriority"];
  demands: CapabilityPlanningDemand[];
}): CapabilityPlanningSelectionContext {
  return {
    contractVersion: "capability-planning-selection-v1",
    athleteId: ATHLETE_CAPABILITY_FIXTURE_V1.athleteId,
    planningAsOf: input.planningAsOf ?? ATHLETE_CAPABILITY_FIXTURE_V1.assessmentAsOf,
    categoryPriority: input.categoryPriority ?? ["run", "bike", "swim", "strength", "other"],
    demands: input.demands,
  };
}

function demand(input: {
  requirementId: string;
  sourceId?: string;
  capability: AthleteCapabilityName;
  activityCategory: "run" | "bike" | "swim" | "strength" | "other";
  unit: AthleteCapabilityUnit;
  measurementBasis: AthleteCapabilityMeasurementBasis;
  requiredValue: number;
}): CapabilityPlanningDemand {
  return {
    requirementId: input.requirementId,
    source: {
      kind: "planning",
      sourceId: input.sourceId ?? input.requirementId,
      calculationVersion: "seeded-planning-demand-v1",
    },
    capability: input.capability,
    eligibleActivityCategories: [input.activityCategory],
    unit: input.unit,
    measurementBasis: input.measurementBasis,
    requiredValue: input.requiredValue,
  };
}

describe(`athlete-capability seeded properties (seed 0x${PROPERTY_SEED.toString(16)})`, () => {
  it("resolves exact category/unit/basis candidates without blending incompatible categories", () => {
    const random = pseudoRandom(PROPERTY_SEED);
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const runDemand = random() >= 0.5;
      const target: {
        unit: AthleteCapabilityUnit;
        measurementBasis: AthleteCapabilityMeasurementBasis;
        requiredValue: number;
        expectedCategory: CanonicalActivityCategory;
        mismatchedCategory: CanonicalActivityCategory;
      } = runDemand
        ? {
            unit: "meters_per_second",
            measurementBasis: "running_planning_threshold_pace_anchor",
            requiredValue: 4.2,
            expectedCategory: "run",
            mismatchedCategory: "bike",
          }
        : {
            unit: "watts",
            measurementBasis: "cycling_planning_threshold_power_anchor",
            requiredValue: 260,
            expectedCategory: "bike",
            mismatchedCategory: "run",
          };
      const candidateCategories: CapabilityPlanningSelectionContext["categoryPriority"] = [
        "bike",
        "run",
      ];
      const categoryPriority = shuffled(candidateCategories, random);
      const planningDemand: CapabilityPlanningDemand = {
        requirementId: `category-${iteration}`,
        source: {
          kind: "planning",
          sourceId: `category-source-${iteration}`,
          calculationVersion: "seeded-planning-demand-v1",
        },
        capability: "thresholdCapacity",
        eligibleActivityCategories: ["bike", "run"],
        unit: target.unit,
        measurementBasis: target.measurementBasis,
        requiredValue: target.requiredValue,
      };
      const projection = projectAthleteCapabilitiesForPlanning({
        profile,
        selectionContext: selectionContext({ categoryPriority, demands: [planningDemand] }),
      });
      const requirement = projection.requirements[0];
      expect(requirement).toMatchObject({
        status: "available",
        selectedCapability: { activityCategory: target.expectedCategory, unit: target.unit },
      });
      expect(requirement?.candidateDiagnostics).toContainEqual(
        expect.objectContaining({
          activityCategory: target.mismatchedCategory,
          state: "unit_mismatch",
        }),
      );
    }
  });

  it("preserves source identity, confidence, coverage, and inclusive freshness", () => {
    const random = pseudoRandom(PROPERTY_SEED ^ 0x1de7);
    const source = canonicalCapabilityCompositionInput();
    const profile = composeAthleteCapabilityProfile(source);
    const bike = profile.categoryProfiles.find((entry) => entry.activityCategory === "bike");
    const sourceThreshold = source.cycling?.capabilityProfile.thresholdCapacity;
    if (bike === undefined || sourceThreshold === undefined) {
      throw new Error("Missing canonical cycling capability fixture");
    }
    const expiresAt = bike.thresholdCapacity.freshness.expiresAt;
    if (expiresAt === null) throw new Error("Available cycling capability requires expiry");

    for (let iteration = 0; iteration < 32; iteration += 1) {
      const deltaMilliseconds = Math.floor(random() * 2_001) - 1_000;
      const planningAsOf = new Date(Date.parse(expiresAt) + deltaMilliseconds).toISOString();
      const projection = projectAthleteCapabilitiesForPlanning({
        profile,
        selectionContext: selectionContext({
          planningAsOf,
          categoryPriority: ["bike"],
          demands: [
            demand({
              requirementId: `freshness-${iteration}`,
              capability: "thresholdCapacity",
              activityCategory: "bike",
              unit: "watts",
              measurementBasis: "cycling_planning_threshold_power_anchor",
              requiredValue: 260,
            }),
          ],
        }),
      });
      expect(bike.thresholdCapacity.calculationIdentity.sourceModel).toEqual(
        source.cycling?.calculationIdentity,
      );
      expect(bike.thresholdCapacity.confidence).toBe(sourceThreshold.confidence);
      expect(bike.thresholdCapacity.evidenceCoverage).toEqual(sourceThreshold.evidenceCoverage);
      expect(bike.thresholdCapacity.sources.evidenceIds).toEqual(sourceThreshold.sourceEvidenceIds);
      expect(projection.requirements[0]?.status).toBe(
        deltaMilliseconds <= 0 ? "available" : "unavailable",
      );
      if (deltaMilliseconds > 0) {
        expect(projection.requirements[0]).toMatchObject({
          comparison: null,
          reasons: ["capability_evidence_expired"],
        });
      }
    }
  });

  it("ranks generated continuous gaps deterministically independent of demand order", () => {
    const random = pseudoRandom(PROPERTY_SEED ^ 0xa11c);
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const capabilities: Array<{
      requirementId: string;
      capability: AthleteCapabilityName;
      activityCategory: CanonicalActivityCategory;
      unit: AthleteCapabilityUnit;
      measurementBasis: AthleteCapabilityMeasurementBasis;
      value: number;
    }> = [
      {
        requirementId: "bike-threshold",
        capability: "thresholdCapacity",
        activityCategory: "bike",
        unit: "watts",
        measurementBasis: "cycling_planning_threshold_power_anchor",
        value: 247,
      },
      {
        requirementId: "run-short",
        capability: "shortDurationCapacity",
        activityCategory: "run",
        unit: "meters_per_second",
        measurementBasis: "running_60_second_maximal_mean_speed",
        value: 7.5,
      },
      {
        requirementId: "swim-long",
        capability: "longDurationCapacity",
        activityCategory: "swim",
        unit: "meters_per_second",
        measurementBasis: "swimming_1800_second_long_duration_speed",
        value: 1.25,
      },
      {
        requirementId: "strength-repeat",
        capability: "repeatedEffortRecovery",
        activityCategory: "strength",
        unit: "ratio",
        measurementBasis: "strength_fixed_resistance_repetition_retention",
        value: 0.8,
      },
    ];

    for (let iteration = 0; iteration < 32; iteration += 1) {
      const generated = capabilities.map((capability, index) => {
        const intendedGap = 0.03 + random() * 0.42 + index * 0.000_001;
        const requiredValue = capability.value / (1 - intendedGap);
        return {
          planningDemand: demand({ ...capability, requiredValue }),
          expectedGap:
            Math.round(((requiredValue - capability.value) / requiredValue) * 1_000_000_000) /
            1_000_000_000,
        };
      });
      const expected = [...generated].sort(
        (left, right) =>
          right.expectedGap - left.expectedGap ||
          left.planningDemand.requirementId.localeCompare(right.planningDemand.requirementId),
      );
      const demands = shuffled(
        generated.map((entry) => entry.planningDemand),
        random,
      );
      const context = selectionContext({ demands });
      const first = projectAthleteCapabilitiesForPlanning({ profile, selectionContext: context });
      const second = projectAthleteCapabilitiesForPlanning({ profile, selectionContext: context });
      expect(first).toEqual(second);
      expect(
        first.limiterAssessment.rankGroups.flatMap((group) =>
          group.limiters.map((limiter) => limiter.requirementId),
        ),
      ).toEqual(expected.map((entry) => entry.planningDemand.requirementId));
    }
  });

  it("keeps generated exact ties explicit and stable", () => {
    const random = pseudoRandom(PROPERTY_SEED ^ 0x71e5);
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const ids = shuffled([`tie-a-${iteration}`, `tie-b-${iteration}`], random);
      const demands = ids.map((requirementId) =>
        demand({
          requirementId,
          capability: "thresholdCapacity",
          activityCategory: "bike",
          unit: "watts",
          measurementBasis: "cycling_planning_threshold_power_anchor",
          requiredValue: 260,
        }),
      );
      const projection = projectAthleteCapabilitiesForPlanning({
        profile,
        selectionContext: selectionContext({ categoryPriority: ["bike"], demands }),
      });
      expect(projection.limiterAssessment.rankGroups).toHaveLength(1);
      expect(projection.limiterAssessment.rankGroups[0]).toMatchObject({
        isTie: true,
        relativeGap: 0.05,
      });
      expect(projection.limiterAssessment.dominantLimiter).toEqual({
        status: "tie",
        requirementIds: [...ids].sort((left, right) => left.localeCompare(right)),
      });
    }
  });

  it("never fabricates a comparison from partial, unavailable, or unsupported source concepts", () => {
    const random = pseudoRandom(PROPERTY_SEED ^ 0xfab0);
    const fixture = RUNNING_DURATION_PERFORMANCE_FIXTURE_V1.input;
    const unsupported: Array<{
      capability: AthleteCapabilityName;
      activityCategory: CanonicalActivityCategory;
      unit: AthleteCapabilityUnit;
      measurementBasis: AthleteCapabilityMeasurementBasis;
    }> = [
      {
        capability: "thresholdCapacity",
        activityCategory: "strength",
        unit: "watts",
        measurementBasis: "cycling_planning_threshold_power_anchor",
      },
      {
        capability: "shortDurationCapacity",
        activityCategory: "other",
        unit: "meters_per_second",
        measurementBasis: "running_60_second_maximal_mean_speed",
      },
      {
        capability: "anaerobicReserve",
        activityCategory: "swim",
        unit: "meters",
        measurementBasis: "running_gradientpeak_distance_reserve",
      },
      {
        capability: "repeatedEffortRecovery",
        activityCategory: "run",
        unit: "ratio",
        measurementBasis: "swimming_fixed_distance_repeat_speed_retention",
      },
    ];

    for (let iteration = 0; iteration < 24; iteration += 1) {
      const partialEvidence: CanonicalRunningDurationEffortEvidence[] = fixture.efforts.map(
        (effort) =>
          effort.durationSeconds === 1_200
            ? {
                ...effort,
                provenance: {
                  ...effort.provenance,
                  sourceTimeCoverage: 0.81 + random() * 0.18,
                  extractionStatus: "partial",
                  extractionReason: "source_incomplete",
                },
              }
            : effort,
      );
      const running = calculateRunningDurationPerformance({
        ...fixture,
        effortReadCoverage:
          iteration % 2 === 0
            ? { state: "complete", reason: null }
            : { state: "truncated", reason: "query_limit_reached" },
        efforts: partialEvidence,
      });
      const partialProfile = composeAthleteCapabilityProfile({
        contractVersion: "athlete-capability-composition-input-v1",
        assessmentAsOf: fixture.assessmentAsOf,
        athleteId: fixture.athleteId,
        running,
      });
      const partialProjection = projectAthleteCapabilitiesForPlanning({
        profile: partialProfile,
        selectionContext: selectionContext({
          categoryPriority: ["run"],
          demands: [
            demand({
              requirementId: `partial-${iteration}`,
              capability: "thresholdCapacity",
              activityCategory: "run",
              unit: "meters_per_second",
              measurementBasis: "running_planning_threshold_pace_anchor",
              requiredValue: 4.2,
            }),
          ],
        }),
      });
      expect(partialProjection.requirements[0]).toMatchObject({ comparison: null });
      expect(partialProjection.limiterAssessment.rankGroups).toEqual([]);

      const unsupportedDemand = unsupported[iteration % unsupported.length];
      if (unsupportedDemand === undefined) continue;
      const completeProfile = composeAthleteCapabilityProfile(
        canonicalCapabilityCompositionInput(),
      );
      const unsupportedProjection = projectAthleteCapabilitiesForPlanning({
        profile: completeProfile,
        selectionContext: selectionContext({
          categoryPriority: [unsupportedDemand.activityCategory],
          demands: [
            demand({
              requirementId: `unsupported-${iteration}`,
              ...unsupportedDemand,
              requiredValue: 1,
            }),
          ],
        }),
      });
      expect(unsupportedProjection.requirements[0]).toMatchObject({
        status: "unavailable",
        comparison: null,
      });
      expect(unsupportedProjection.limiterAssessment.dominantLimiter).toEqual({
        status: "indeterminate",
        requirementIds: [],
      });
    }
  });
});
