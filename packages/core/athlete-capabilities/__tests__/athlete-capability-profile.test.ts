import { describe, expect, it } from "vitest";
import { RUNNING_DURATION_PERFORMANCE_FIXTURE_V1 } from "../../duration-performance/__tests__/fixtures/duration-performance-v1";
import type { CanonicalRunningDurationEffortEvidence } from "../../duration-performance/contracts";
import { calculateRunningDurationPerformance } from "../../duration-performance/running";
import {
  composeAthleteCapabilityProfile,
  composeRunningCategoryCapabilityProfile,
} from "../composition";
import {
  type AthleteCapabilityProfile,
  athleteCapabilityProfileSchema,
  categoryCapabilityProfileSchema,
} from "../contracts";
import {
  type CapabilityPlanningDemand,
  type CapabilityPlanningSelectionContext,
  projectAthleteCapabilitiesForPlanning,
} from "../planning";
import {
  ATHLETE_CAPABILITY_FIXTURE_V1,
  canonicalCapabilityCompositionInput,
  literalPlanningSelectionContext,
} from "./fixtures/capability-profile-v1";

function categoryProfile(
  profile: AthleteCapabilityProfile,
  category: "run" | "bike" | "swim" | "strength" | "other",
) {
  const result = profile.categoryProfiles.find((entry) => entry.activityCategory === category);
  if (result === undefined) throw new Error(`Missing ${category} capability fixture`);
  return result;
}

function singleDemandContext(
  demand: CapabilityPlanningSelectionContext["demands"][number],
  input?: {
    planningAsOf?: string;
    categoryPriority?: CapabilityPlanningSelectionContext["categoryPriority"];
  },
): CapabilityPlanningSelectionContext {
  return {
    contractVersion: "capability-planning-selection-v1",
    athleteId: ATHLETE_CAPABILITY_FIXTURE_V1.athleteId,
    planningAsOf: input?.planningAsOf ?? ATHLETE_CAPABILITY_FIXTURE_V1.assessmentAsOf,
    categoryPriority: input?.categoryPriority ?? demand.eligibleActivityCategories,
    demands: [demand],
  };
}

describe("AthleteCapabilityProfile composition", () => {
  it("projects literal category concept outputs into strict continuous capability values", () => {
    const source = canonicalCapabilityCompositionInput();
    const profile = composeAthleteCapabilityProfile(source);
    expect(profile.categoryProfiles.map((entry) => entry.activityCategory)).toEqual(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.categoryOrder,
    );

    const bike = categoryProfile(profile, "bike");
    expect(bike.shortDurationCapacity).toMatchObject({
      status: "available",
      value: ATHLETE_CAPABILITY_FIXTURE_V1.expected.cycling.shortDurationCapacityWatts,
      unit: "watts",
      measurementBasis: "cycling_60_second_maximal_mean_power",
    });
    expect(bike.anaerobicReserve.value).toBe(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.cycling.anaerobicReserveJoules,
    );
    expect(bike.thresholdCapacity.value).toBe(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.cycling.thresholdCapacityWatts,
    );
    expect(bike.longDurationCapacity.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.cycling.longDurationCapacityWatts,
      12,
    );
    expect(bike.durationRetention.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.cycling.durationRetentionRatio,
      12,
    );
    expect(bike.repeatedEffortRecovery).toMatchObject({
      status: "unavailable",
      value: null,
      unit: "ratio",
      reasons: ["source_concept_unavailable"],
    });

    const run = categoryProfile(profile, "run");
    expect(run.shortDurationCapacity.value).toBe(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.running.shortDurationCapacityMetersPerSecond,
    );
    expect(run.anaerobicReserve.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.running.anaerobicReserveMeters,
      9,
    );
    expect(run.thresholdCapacity.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.running.thresholdCapacityMetersPerSecond,
      12,
    );
    expect(run.longDurationCapacity.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.running.longDurationCapacityMetersPerSecond,
      12,
    );
    expect(run.durationRetention.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.running.durationRetentionRatio,
      12,
    );
    expect(run.repeatedEffortRecovery).toMatchObject({
      status: "unavailable",
      value: null,
      unit: null,
      reasons: ["source_concept_not_produced"],
    });

    const swim = categoryProfile(profile, "swim");
    expect(swim.shortDurationCapacity.value).toBe(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.swimming.shortDurationCapacityMetersPerSecond,
    );
    expect(swim.thresholdCapacity).toMatchObject({
      status: "unavailable",
      value: null,
      reasons: ["source_concept_not_produced"],
    });
    expect(swim.longDurationCapacity.value).toBe(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.swimming.longDurationCapacityMetersPerSecond,
    );
    expect(swim.repeatedEffortRecovery.value).toBeCloseTo(
      ATHLETE_CAPABILITY_FIXTURE_V1.expected.swimming.repeatedEffortRecoveryRatio,
      12,
    );
    expect(swim.anaerobicReserve).toMatchObject({
      status: "unavailable",
      value: null,
      reasons: ["source_concept_not_produced"],
    });

    const strength = categoryProfile(profile, "strength");
    expect(strength.repeatedEffortRecovery).toMatchObject({
      status: "available",
      value: ATHLETE_CAPABILITY_FIXTURE_V1.expected.strength.repeatedEffortRecoveryRatio,
      unit: "ratio",
      sources: {
        evidenceIds: ["strength-repeat"],
        activityIds: ["strength-repeat-activity"],
      },
    });
    const other = categoryProfile(profile, "other");
    expect(other.repeatedEffortRecovery).toMatchObject({
      status: "unavailable",
      value: null,
      unit: null,
      reasons: ["source_concept_not_semantically_compatible"],
    });
    expect(other.shortDurationCapacity).toMatchObject({
      status: "unavailable",
      value: null,
      unit: null,
      reasons: ["unsupported_category_capability"],
    });
    expect(athleteCapabilityProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("preserves source evidence, activity, coverage, confidence, freshness, and calculation identity", () => {
    const source = canonicalCapabilityCompositionInput();
    const profile = composeAthleteCapabilityProfile(source);
    const run = categoryProfile(profile, "run");
    const sourceThreshold = source.running?.parameters.planningThresholdPace;
    if (sourceThreshold === undefined) throw new Error("Missing canonical running source model");

    expect(run.thresholdCapacity.sources.concepts[0]).toMatchObject({
      concept: "running_planning_threshold_pace",
      calculationVersion: sourceThreshold.calculationVersion,
      status: sourceThreshold.status,
      confidence: sourceThreshold.confidence,
      evidenceCoverage: sourceThreshold.evidenceCoverage,
      expiresAt: sourceThreshold.expiresAt,
    });
    expect(run.thresholdCapacity.sources.evidenceIds).toEqual(sourceThreshold.sourceEvidenceIds);
    expect(run.thresholdCapacity.sources.activityIds.length).toBeGreaterThan(1);
    expect(run.thresholdCapacity.evidenceCoverage).toEqual(sourceThreshold.evidenceCoverage);
    expect(run.thresholdCapacity.confidence).toBe(sourceThreshold.confidence);
    expect(run.thresholdCapacity.freshness).toEqual({
      state: "current",
      evaluatedAt: source.assessmentAsOf,
      expiresAt: sourceThreshold.expiresAt,
    });
    expect(run.thresholdCapacity.calculationIdentity.sourceModel).toEqual(
      source.running?.calculationIdentity,
    );
    expect(profile.calculationIdentity.sourceCalculationFingerprints).toEqual(
      profile.categoryProfiles.map((entry) => entry.sourceModelIdentity.calculationFingerprint),
    );
  });

  it("rejects a numeric capability placed in an unsupported category", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const run = categoryProfile(profile, "run");
    const other = categoryProfile(profile, "other");
    const invalid = {
      ...other,
      shortDurationCapacity: {
        ...run.shortDurationCapacity,
        activityCategory: "other",
      },
    };
    expect(categoryCapabilityProfileSchema.safeParse(invalid).success).toBe(false);
  });

  it("propagates partial canonical evidence and never upgrades it for planning", () => {
    const fixture = RUNNING_DURATION_PERFORMANCE_FIXTURE_V1.input;
    const efforts: CanonicalRunningDurationEffortEvidence[] = fixture.efforts.map((effort) =>
      effort.durationSeconds === 1_200
        ? {
            ...effort,
            provenance: {
              ...effort.provenance,
              sourceTimeCoverage: 0.9,
              extractionStatus: "partial",
              extractionReason: "source_incomplete",
            },
          }
        : effort,
    );
    const running = calculateRunningDurationPerformance({ ...fixture, efforts });
    const category = composeRunningCategoryCapabilityProfile(running);
    expect(category.thresholdCapacity).toMatchObject({
      status: "partial",
      reasons: ["source_concept_partial"],
      confidence: running.parameters.planningThresholdPace.confidence,
      evidenceCoverage: running.parameters.planningThresholdPace.evidenceCoverage,
    });
    const profile = composeAthleteCapabilityProfile({
      contractVersion: "athlete-capability-composition-input-v1",
      assessmentAsOf: fixture.assessmentAsOf,
      athleteId: fixture.athleteId,
      running,
    });
    const projection = projectAthleteCapabilitiesForPlanning({
      profile,
      selectionContext: singleDemandContext({
        requirementId: "partial-run-threshold",
        source: {
          kind: "planning",
          sourceId: "partial-source",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "thresholdCapacity",
        eligibleActivityCategories: ["run"],
        unit: "meters_per_second",
        measurementBasis: "running_planning_threshold_pace_anchor",
        requiredValue: 4.2,
      }),
    });
    expect(projection.requirements[0]).toMatchObject({
      status: "partial",
      comparison: null,
      reasons: ["capability_partial"],
    });
    expect(projection.limiterAssessment).toMatchObject({
      evidenceStatus: "unavailable",
      rankGroups: [],
      dominantLimiter: { status: "indeterminate" },
    });
  });
});

describe("capability planning selection and limiters", () => {
  it("selects one exact compatible category without mixing an incompatible unit", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const selectionContext = singleDemandContext(
      {
        requirementId: "run-threshold-selection",
        source: {
          kind: "goal",
          sourceId: "run-threshold-goal",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "thresholdCapacity",
        eligibleActivityCategories: ["bike", "run"],
        unit: "meters_per_second",
        measurementBasis: "running_planning_threshold_pace_anchor",
        requiredValue: 4.2,
      },
      { categoryPriority: ["bike", "run"] },
    );
    const projection = projectAthleteCapabilitiesForPlanning({ profile, selectionContext });
    expect(projection.requirements[0]).toMatchObject({
      status: "available",
      selectedCapability: { activityCategory: "run", unit: "meters_per_second" },
      candidateDiagnostics: [
        { activityCategory: "bike", state: "unit_mismatch", unit: "watts" },
        { activityCategory: "run", state: "available", unit: "meters_per_second" },
      ],
    });
  });

  it("abstains with unit diagnostics when no exact compatible capability exists", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const selectionContext = singleDemandContext({
      requirementId: "bad-bike-threshold-unit",
      source: {
        kind: "planning",
        sourceId: "bad-unit-source",
        calculationVersion: "literal-planning-demand-v1",
      },
      capability: "thresholdCapacity",
      eligibleActivityCategories: ["bike"],
      unit: "meters_per_second",
      measurementBasis: "running_planning_threshold_pace_anchor",
      requiredValue: 4,
    });
    const projection = projectAthleteCapabilitiesForPlanning({ profile, selectionContext });
    expect(projection.requirements[0]).toMatchObject({
      status: "unavailable",
      selectedCapability: null,
      comparison: null,
      reasons: ["capability_unit_mismatch"],
    });
  });

  it("ranks continuous demand gaps deterministically", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const selectionContext = literalPlanningSelectionContext();
    const projection = projectAthleteCapabilitiesForPlanning({ profile, selectionContext });
    expect(projection.limiterAssessment).toMatchObject({
      evidenceStatus: "complete",
      dominantLimiter: { status: "single", requirementIds: ["run-short-demand"] },
    });
    expect(
      projection.limiterAssessment.rankGroups.map((group) => ({
        rank: group.rank,
        requirementIds: group.limiters.map((limiter) => limiter.requirementId),
        relativeGap: group.relativeGap,
      })),
    ).toEqual([
      { rank: 1, requirementIds: ["run-short-demand"], relativeGap: 0.25 },
      { rank: 2, requirementIds: ["swim-long-demand"], relativeGap: 0.2 },
      { rank: 3, requirementIds: ["bike-threshold-demand"], relativeGap: 0.05 },
    ]);
  });

  it("retains an exact dominant-limiter tie instead of choosing by label or array order", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const common: Omit<CapabilityPlanningDemand, "requirementId"> = {
      source: {
        kind: "goal",
        sourceId: "bike-threshold-goal",
        calculationVersion: "literal-planning-demand-v1",
      },
      capability: "thresholdCapacity",
      eligibleActivityCategories: ["bike"],
      unit: "watts",
      measurementBasis: "cycling_planning_threshold_power_anchor",
      requiredValue: 260,
    };
    const selectionContext: CapabilityPlanningSelectionContext = {
      contractVersion: "capability-planning-selection-v1",
      athleteId: profile.athleteId,
      planningAsOf: profile.assessmentAsOf,
      categoryPriority: ["bike"],
      demands: [
        { ...common, requirementId: "tie-b" },
        { ...common, requirementId: "tie-a" },
      ],
    };
    const projection = projectAthleteCapabilitiesForPlanning({ profile, selectionContext });
    expect(projection.limiterAssessment).toMatchObject({
      evidenceStatus: "complete",
      rankGroups: [
        {
          rank: 1,
          relativeGap: 0.05,
          isTie: true,
          limiters: [{ requirementId: "tie-a" }, { requirementId: "tie-b" }],
        },
      ],
      dominantLimiter: { status: "tie", requirementIds: ["tie-a", "tie-b"] },
    });
  });

  it("uses an inclusive expiry instant and abstains immediately after it", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const bike = categoryProfile(profile, "bike");
    const expiresAt = bike.thresholdCapacity.freshness.expiresAt;
    if (expiresAt === null) throw new Error("Available bike threshold requires expiry");
    const demand = literalPlanningSelectionContext().demands[2];
    if (demand === undefined) throw new Error("Missing literal bike threshold demand");

    const atExpiry = projectAthleteCapabilitiesForPlanning({
      profile,
      selectionContext: singleDemandContext(demand, { planningAsOf: expiresAt }),
    });
    expect(atExpiry.requirements[0]).toMatchObject({ status: "available" });

    const afterExpiry = new Date(Date.parse(expiresAt) + 1).toISOString();
    const expired = projectAthleteCapabilitiesForPlanning({
      profile,
      selectionContext: singleDemandContext(demand, { planningAsOf: afterExpiry }),
    });
    expect(expired.requirements[0]).toMatchObject({
      status: "unavailable",
      freshnessAtPlanning: "expired",
      comparison: null,
      reasons: ["capability_evidence_expired"],
    });
    expect(expired.limiterAssessment.dominantLimiter).toEqual({
      status: "indeterminate",
      requirementIds: [],
    });
  });

  it("does not fabricate unsupported or missing planning capabilities", () => {
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const unsupported = projectAthleteCapabilitiesForPlanning({
      profile,
      selectionContext: singleDemandContext({
        requirementId: "strength-threshold",
        source: {
          kind: "planning",
          sourceId: "strength-plan",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "thresholdCapacity",
        eligibleActivityCategories: ["strength"],
        unit: "watts",
        measurementBasis: "cycling_planning_threshold_power_anchor",
        requiredValue: 100,
      }),
    });
    expect(unsupported.requirements[0]).toMatchObject({
      status: "unavailable",
      comparison: null,
      reasons: ["capability_unavailable"],
      selectedCapability: { status: "unavailable", value: null },
    });

    const bikeOnly = composeAthleteCapabilityProfile({
      contractVersion: "athlete-capability-composition-input-v1",
      assessmentAsOf: canonicalCapabilityCompositionInput().assessmentAsOf,
      athleteId: canonicalCapabilityCompositionInput().athleteId,
      cycling: canonicalCapabilityCompositionInput().cycling,
    });
    const missing = projectAthleteCapabilitiesForPlanning({
      profile: bikeOnly,
      selectionContext: singleDemandContext({
        requirementId: "missing-run-threshold",
        source: {
          kind: "goal",
          sourceId: "missing-run-goal",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "thresholdCapacity",
        eligibleActivityCategories: ["run"],
        unit: "meters_per_second",
        measurementBasis: "running_planning_threshold_pace_anchor",
        requiredValue: 4,
      }),
    });
    expect(missing.requirements[0]).toMatchObject({
      status: "unavailable",
      selectedCapability: null,
      comparison: null,
      reasons: ["category_profile_missing"],
    });
  });
});
