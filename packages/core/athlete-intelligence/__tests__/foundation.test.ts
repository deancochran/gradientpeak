import { describe, expect, it } from "vitest";
import { fingerprintCanonicalJson, normalizeCanonicalJson } from "../canonical-json";
import {
  ATHLETE_INTELLIGENCE_VERSION,
  athleteStateSnapshotSchema,
  type CapabilityAssessment,
  capabilityAssessmentSchema,
  deriveGoalRequirementSet,
  evaluateGoalGaps,
  goalGapDimensionSchema,
  goalRequirementSetSchema,
  type IntelligenceDimension,
  predictionEnvelopeSchema,
} from "../legacy";

const asOf = "2026-07-09T12:00:00.000Z";
const fingerprint = "fnv1a-32:00000000";

const goal = {
  id: "33333333-3333-4333-8333-333333333333",
  profile_id: "11111111-1111-4111-8111-111111111111",
  target_date: "2026-10-01",
  title: "Autumn 10K",
  priority: 8,
  activity_category: "run" as const,
  objective: {
    type: "event_performance" as const,
    activity_category: "run" as const,
    distance_m: 10_000,
    target_time_s: 2_700,
  },
};

function capability(value: number | null) {
  return {
    value,
    confidence: {
      score: value === null ? 0 : 0.8,
      level: value === null ? "low" : "high",
      reasons: value === null ? ["No observed evidence."] : [],
    },
    provenance: {
      source: "athlete_input" as const,
      asOf,
      inputFingerprint: fingerprint,
      notes: [],
    },
  };
}

function assessment(
  overrides: Partial<Record<IntelligenceDimension, number | null>> = {},
): CapabilityAssessment {
  const valueFor = (dimension: IntelligenceDimension) =>
    dimension in overrides ? (overrides[dimension] ?? null) : 0.8;

  return capabilityAssessmentSchema.parse({
    version: ATHLETE_INTELLIGENCE_VERSION,
    athleteId: "athlete-1",
    assessedAt: asOf,
    capabilities: {
      endurance: capability(valueFor("endurance")),
      threshold: capability(valueFor("threshold")),
      high_intensity: capability(valueFor("high_intensity")),
      durability: capability(valueFor("durability")),
      technical: capability(valueFor("technical")),
      specificity: capability(valueFor("specificity")),
    },
    confidence: { score: 0.8, level: "high", reasons: [] },
    provenance: {
      source: "capability_assessment",
      asOf,
      inputFingerprint: fingerprint,
      notes: [],
    },
  });
}

describe("athlete intelligence foundation", () => {
  it("validates the versioned contract envelope", () => {
    const requirements = deriveGoalRequirementSet({ goal, asOf });
    const capabilities = assessment();
    const gaps = evaluateGoalGaps({ requirements, capabilities });
    const state = athleteStateSnapshotSchema.parse({
      version: ATHLETE_INTELLIGENCE_VERSION,
      athleteId: capabilities.athleteId,
      asOf,
      capabilities: capabilities.capabilities,
      confidence: capabilities.confidence,
      provenance: { ...capabilities.provenance, source: "athlete_input" },
    });

    expect(goalRequirementSetSchema.parse(requirements)).toEqual(requirements);
    expect(
      predictionEnvelopeSchema.parse({
        version: ATHLETE_INTELLIGENCE_VERSION,
        inputFingerprint: fingerprint,
        generatedAt: asOf,
        athleteState: state,
        goalRequirements: requirements,
        capabilityAssessment: capabilities,
        goalGapAssessment: gaps,
        confidence: gaps.confidence,
        provenance: gaps.provenance,
      }),
    ).toMatchObject({ version: "1", goalRequirements: { goalId: goal.id } });
  });

  it("fingerprints semantically equivalent object key ordering identically", () => {
    expect(fingerprintCanonicalJson({ b: [2, { z: true, a: null }], a: 1 })).toBe(
      fingerprintCanonicalJson({ a: 1, b: [2, { a: null, z: true }] }),
    );
  });

  it("hashes canonical UTF-8 bytes using known FNV-1a vectors", () => {
    expect(fingerprintCanonicalJson("hello")).toBe("fnv1a-32:df47ee8b");
    expect(fingerprintCanonicalJson("é")).toBe("fnv1a-32:6dd86cf9");
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    () => undefined,
    Symbol("unsupported"),
    new Date(asOf),
    new Map(),
    { value: undefined },
    { [Symbol("unsupported")]: true },
  ])("rejects unsupported canonical JSON input: %s", (value) => {
    expect(() => normalizeCanonicalJson(value)).toThrow(TypeError);
  });

  it("rejects cyclic arrays and plain objects with a TypeError", () => {
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    const cyclicObject: { self?: unknown } = {};
    cyclicObject.self = cyclicObject;

    for (const value of [cyclicArray, cyclicObject]) {
      expect(() => normalizeCanonicalJson(value)).toThrow(TypeError);
      expect(() => normalizeCanonicalJson(value)).toThrow(/cyclic arrays or objects/i);
    }
  });

  it("represents missing capability evidence as unknown rather than zero", () => {
    const gaps = evaluateGoalGaps({
      requirements: deriveGoalRequirementSet({ goal, asOf }),
      capabilities: assessment({ threshold: null }),
    });

    expect(gaps.dimensions.threshold).toMatchObject({
      capability: null,
      gap: null,
      status: "missing_evidence",
      confidence: { level: "low", score: 0 },
    });
    expect(gaps.confidence.level).toBe("low");
  });

  it("derives deterministic gaps for identical inputs", () => {
    const requirements = deriveGoalRequirementSet({ goal, asOf });
    const capabilities = assessment({ endurance: 0.4 });

    expect(evaluateGoalGaps({ requirements, capabilities })).toEqual(
      evaluateGoalGaps({ requirements, capabilities }),
    );
  });

  it("calculates gap values and statuses at the requirement boundary", () => {
    const requirements = deriveGoalRequirementSet({ goal, asOf });
    const requirement = requirements.requirements.threshold;

    const met = evaluateGoalGaps({
      requirements,
      capabilities: assessment({ threshold: requirement }),
    });
    const gap = evaluateGoalGaps({
      requirements,
      capabilities: assessment({ threshold: requirement - 0.1 }),
    });

    expect(met.dimensions.threshold).toMatchObject({ gap: 0, status: "met" });
    expect(gap.dimensions.threshold).toMatchObject({
      gap: Math.max(0, requirement - (requirement - 0.1)),
      status: "gap",
    });
  });

  it("rejects contradictory goal gap dimension values", () => {
    const base = {
      requirement: 0.8,
      capability: 0.6,
      confidence: { score: 0.8, level: "high" as const, reasons: [] },
    };

    expect(goalGapDimensionSchema.safeParse({ ...base, gap: 0, status: "met" }).success).toBe(
      false,
    );
    expect(goalGapDimensionSchema.safeParse({ ...base, gap: 0.2, status: "met" }).success).toBe(
      false,
    );
  });

  it("rejects invalid asOf timestamps at contract boundaries", () => {
    expect(() => deriveGoalRequirementSet({ goal, asOf: "not-a-timestamp" })).toThrow();
    expect(
      capabilityAssessmentSchema.safeParse({
        ...assessment(),
        assessedAt: "not-a-timestamp",
      }).success,
    ).toBe(false);
  });

  it("adapts a canonical goal with the canonical demand profile fixture", () => {
    const requirements = deriveGoalRequirementSet({ goal, asOf });

    expect(requirements.requirements).toEqual({
      endurance: 0.554,
      threshold: 0.862,
      high_intensity: 0.686,
      durability: 0.424,
      technical: 0.2,
      specificity: 0.819,
    });
    expect(requirements.provenance.source).toBe("goal_demand_profile");
  });
});
