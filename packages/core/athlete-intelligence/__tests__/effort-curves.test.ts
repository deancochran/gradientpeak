import { describe, expect, it } from "vitest";

import { evidenceItemSchema } from "../evidence-contracts";
import {
  type EffortObservationInput,
  effortObservationInputSchema,
} from "../model-input-contracts";
import {
  calculateDurationAwareEffortCurve as calculateEffortCurve,
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY,
  EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
  type EffortCurveTarget,
} from "../policies/effort-curves";

const AS_OF = "2026-07-03T00:00:00.000Z";
const calculateDurationAwareEffortCurve = (
  input: Omit<Parameters<typeof calculateEffortCurve>[0], "assessmentAsOf"> & {
    assessmentAsOf?: string;
  },
) => calculateEffortCurve({ ...input, assessmentAsOf: input.assessmentAsOf ?? AS_OF });

const effort = (input: {
  id: string;
  lineage?: string;
  duration: number;
  value: number;
  kind?: "power" | "speed";
  sport?: "bike" | "run" | "swim";
  linked?: boolean;
  observedAt?: string;
}): EffortObservationInput =>
  effortObservationInputSchema.parse({
    sourceId: `effort:${input.id}`,
    athleteId: "athlete-1",
    lineageGroupId: input.lineage ?? `manual-test:${input.id}`,
    activitySourceId: input.linked ? `activity:${input.id}` : null,
    observedAt: input.observedAt ?? "2026-07-01T00:00:00.000Z",
    sport: input.sport ?? "bike",
    startOffsetSeconds: null,
    endOffsetSeconds: null,
    durationSeconds: input.duration,
    evidenceSourceIds: [`effort:${input.id}:duration`, `effort:${input.id}`],
    kind: input.kind ?? "power",
    ...(input.kind === "speed"
      ? { speedMetersPerSecond: input.value }
      : { powerWatts: input.value }),
  });

const model = (efforts: EffortObservationInput[]) => ({
  efforts,
  evidenceRegistry: Object.fromEntries(
    efforts.flatMap((item) => [
      [
        `${item.sourceId}:duration`,
        evidenceItemSchema.parse({
          athleteId: item.athleteId,
          sourceId: `${item.sourceId}:duration`,
          lineageGroupId: item.lineageGroupId,
          observedAt: item.observedAt,
          rawObservation: { value: item.durationSeconds, unit: "seconds" },
          sport: item.sport,
          modality: "duration",
          sourceType: "activity_effort",
          qualityState: "known",
          validityState: "valid",
          compatibilityState: "compatible",
        }),
      ],
      [
        item.sourceId,
        evidenceItemSchema.parse({
          athleteId: item.athleteId,
          sourceId: item.sourceId,
          lineageGroupId: item.lineageGroupId,
          observedAt: item.observedAt,
          rawObservation: {
            value: item.kind === "power" ? item.powerWatts : item.speedMetersPerSecond,
            unit: item.kind === "power" ? "watts" : "meters_per_second",
          },
          sport: item.sport,
          modality: "value",
          sourceType: "activity_effort",
          qualityState: "known",
          validityState: "valid",
          compatibilityState: "compatible",
        }),
      ],
    ]),
  ),
});

const target = (durationSeconds: number): EffortCurveTarget => ({
  durationSeconds,
  modality: "power",
  unit: "watts",
  sport: "bike",
});

describe("calculateDurationAwareEffortCurve", () => {
  it("interpolates swim capability in seconds per 100m without extrapolating", () => {
    const swimTarget = (durationSeconds: number): EffortCurveTarget => ({
      durationSeconds,
      modality: "pace",
      unit: "seconds_per_100m",
      sport: "swim",
    });
    const swimModel = model([
      effort({ id: "swim-short", duration: 300, value: 100 / 90, kind: "speed", sport: "swim" }),
      effort({ id: "swim-long", duration: 1_200, value: 100 / 105, kind: "speed", sport: "swim" }),
    ]);

    const available = calculateDurationAwareEffortCurve({
      model: swimModel,
      threshold: swimTarget(600),
      highIntensity: swimTarget(450),
    });
    const insufficient = calculateDurationAwareEffortCurve({
      model: swimModel,
      threshold: swimTarget(1_800),
      highIntensity: swimTarget(1_800),
    }).threshold;

    expect(available.threshold).toMatchObject({
      state: "estimated",
      unit: "seconds_per_100m",
      reasonCodes: ["log_duration_interpolation"],
    });
    expect(available.threshold.estimate).toBeCloseTo(97.5);
    expect(insufficient).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["extrapolation_prohibited"],
    });
  });

  it("returns unsupported for a swim target expressed as running pace", () => {
    const result = calculateDurationAwareEffortCurve({
      model: model([]),
      threshold: {
        durationSeconds: 600,
        modality: "pace",
        unit: "seconds_per_kilometer",
        sport: "swim",
      },
      highIntensity: target(600),
    }).threshold;

    expect(result).toMatchObject({
      state: "unsupported",
      reasonCodes: ["unsupported_effort_curve_unit"],
    });
  });

  it("interpolates arbitrary durations continuously in log-duration space", () => {
    const result = calculateDurationAwareEffortCurve({
      model: model([
        effort({ id: "manual", duration: 100, value: 400 }),
        effort({ id: "activity", duration: 400, value: 200, linked: true }),
      ]),
      threshold: target(200),
      highIntensity: target(125),
    });

    expect(result.policyVersion).toBe("effort-curves-v1");
    expect(result.threshold).toMatchObject({ state: "estimated", unit: "watts" });
    expect(result.threshold.estimate).toBeCloseTo(300);
    expect(result.highIntensity.estimate).toBeCloseTo(367.807, 3);
    expect(result.threshold).not.toBe(result.highIntensity);
  });

  it("increases uncertainty with interpolation distance from observed points", () => {
    const efforts = [
      effort({ id: "a", duration: 100, value: 400 }),
      effort({ id: "b", duration: 400, value: 200 }),
    ];
    const near = calculateDurationAwareEffortCurve({
      model: model(efforts),
      threshold: target(110),
      highIntensity: target(110),
    }).threshold;
    const middle = calculateDurationAwareEffortCurve({
      model: model(efforts),
      threshold: target(200),
      highIntensity: target(200),
    }).threshold;

    expect(middle.uncertainty).toBeGreaterThan(near.uncertainty);
  });

  it("counts correlated lineage only once in estimate and uncertainty", () => {
    const once = calculateDurationAwareEffortCurve({
      model: model([effort({ id: "a", lineage: "activity:same", duration: 100, value: 300 })]),
      threshold: target(100),
      highIntensity: target(100),
    }).threshold;
    const duplicated = calculateDurationAwareEffortCurve({
      model: model([
        effort({ id: "a", lineage: "activity:same", duration: 100, value: 300 }),
        effort({ id: "copy", lineage: "activity:same", duration: 100, value: 900 }),
      ]),
      threshold: target(100),
      highIntensity: target(100),
    }).threshold;

    expect(duplicated).toEqual(once);
    expect(duplicated).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["single_lineage_not_recommendation_compatible"],
    });
  });

  it("selects duplicate-lineage conflicts deterministically regardless of input order", () => {
    const older = effort({
      id: "older",
      lineage: "activity:same",
      duration: 100,
      value: 900,
      observedAt: "2026-06-30T00:00:00.000Z",
    });
    const newer = effort({
      id: "newer",
      lineage: "activity:same",
      duration: 100,
      value: 300,
      observedAt: "2026-07-02T00:00:00.000Z",
    });
    const calculate = (efforts: EffortObservationInput[]) =>
      calculateDurationAwareEffortCurve({
        model: model(efforts),
        threshold: target(100),
        highIntensity: target(100),
      }).threshold;

    expect(calculate([older, newer])).toEqual(calculate([newer, older]));
    expect(calculate([older, newer])).toMatchObject({
      estimate: null,
      contributingSourceIds: ["effort:newer:duration", "effort:newer"],
      reasonCodes: ["single_lineage_not_recommendation_compatible"],
    });
  });

  it("reports every selected raw source while counting repeated lineage once", () => {
    const result = calculateDurationAwareEffortCurve({
      model: model([
        effort({ id: "short", lineage: "activity:same", duration: 100, value: 400 }),
        effort({ id: "long", lineage: "activity:same", duration: 400, value: 200 }),
      ]),
      threshold: target(200),
      highIntensity: target(200),
    }).threshold;

    expect(result.contributingSourceIds).toEqual([
      "effort:long:duration",
      "effort:long",
      "effort:short:duration",
      "effort:short",
    ]);
    expect(result).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["single_lineage_not_recommendation_compatible"],
      uncertainty: 1,
    });
  });

  it("returns explicit unsupported states for incompatible sports and units", () => {
    const result = calculateDurationAwareEffortCurve({
      model: model([]),
      threshold: { ...target(300), sport: "run" },
      highIntensity: { ...target(60), unit: "seconds_per_kilometer" },
    });

    expect(result.threshold).toMatchObject({ state: "unsupported", estimate: null });
    expect(result.highIntensity).toMatchObject({ state: "unsupported", estimate: null });
  });

  it("prohibits extrapolation", () => {
    const result = calculateDurationAwareEffortCurve({
      model: model([
        effort({ id: "a", duration: 100, value: 400 }),
        effort({ id: "b", duration: 200, value: 300 }),
      ]),
      threshold: target(300),
      highIntensity: target(50),
    });

    expect(result.threshold).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["extrapolation_prohibited"],
    });
    expect(result.highIntensity).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["extrapolation_prohibited"],
    });
  });

  it("allows an independent source addition to change the result", () => {
    const initial = [
      effort({ id: "a", duration: 100, value: 400 }),
      effort({ id: "b", duration: 400, value: 200 }),
    ];
    const before = calculateDurationAwareEffortCurve({
      model: model(initial),
      threshold: target(200),
      highIntensity: target(200),
    }).threshold;
    const after = calculateDurationAwareEffortCurve({
      model: model([...initial, effort({ id: "c", duration: 400, value: 300 })]),
      threshold: target(200),
      highIntensity: target(200),
    }).threshold;

    expect(after.estimate).not.toBe(before.estimate);
    expect(after.contributingSourceIds).toContain("effort:c");
  });

  it("builds a run pace curve from speed efforts without generic scores", () => {
    const result = calculateDurationAwareEffortCurve({
      model: model([
        effort({ id: "fast", duration: 300, value: 5, kind: "speed", sport: "run" }),
        effort({ id: "steady", duration: 1_200, value: 4, kind: "speed", sport: "run" }),
      ]),
      threshold: {
        durationSeconds: 600,
        modality: "pace",
        unit: "seconds_per_kilometer",
        sport: "run",
      },
      highIntensity: {
        durationSeconds: 300,
        modality: "pace",
        unit: "seconds_per_kilometer",
        sport: "run",
      },
    });

    expect(result.threshold).toMatchObject({
      state: "estimated",
      estimate: 225,
      unit: "seconds_per_kilometer",
    });
    expect(result.highIntensity).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["single_lineage_not_recommendation_compatible"],
    });
  });

  it("owns an immutable, versioned decision-uncertainty policy", () => {
    expect(EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY.version).toBe(
      EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY_VERSION,
    );
    expect(Object.isFrozen(EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY)).toBe(true);
    expect(Object.isFrozen(EFFORT_CURVE_DECISION_UNCERTAINTY_POLICY.uncertainty)).toBe(true);
  });

  it.each([
    [
      "single independent lineage",
      [effort({ id: "only", duration: 300, value: 250 })],
      "single_lineage_not_recommendation_compatible",
    ],
    [
      "stale independent evidence",
      [
        effort({ id: "old-a", duration: 300, value: 250, observedAt: "2026-05-01T00:00:00.000Z" }),
        effort({ id: "old-b", duration: 300, value: 250, observedAt: "2026-05-02T00:00:00.000Z" }),
      ],
      "stale_effort_evidence_not_recommendation_compatible",
    ],
    [
      "divergent independent lineages",
      [
        effort({ id: "low", duration: 300, value: 200 }),
        effort({ id: "high", duration: 300, value: 400 }),
      ],
      "divergent_independent_lineages_not_recommendation_compatible",
    ],
  ] as const)("marks %s insufficient for recommendation-compatible output", (_label, efforts, reasonCode) => {
    const result = calculateDurationAwareEffortCurve({
      model: model([...efforts]),
      threshold: target(300),
      highIntensity: target(300),
    }).threshold;

    expect(result).toMatchObject({
      state: "insufficient_evidence",
      estimate: null,
      reasonCodes: [reasonCode],
      uncertainty: 1,
    });
  });

  it("uses independent lineage density and observation age as bounded uncertainty terms", () => {
    const resultFor = (efforts: EffortObservationInput[]) =>
      calculateDurationAwareEffortCurve({
        model: model(efforts),
        threshold: target(300),
        highIntensity: target(300),
      }).threshold;
    const twoFresh = resultFor([
      effort({ id: "a", duration: 300, value: 250 }),
      effort({ id: "b", duration: 300, value: 250 }),
    ]);
    const threeFresh = resultFor([
      effort({ id: "a", duration: 300, value: 250 }),
      effort({ id: "b", duration: 300, value: 250 }),
      effort({ id: "c", duration: 300, value: 250 }),
    ]);
    const fourFresh = resultFor([
      effort({ id: "a", duration: 300, value: 250 }),
      effort({ id: "b", duration: 300, value: 250 }),
      effort({ id: "c", duration: 300, value: 250 }),
      effort({ id: "d", duration: 300, value: 250 }),
    ]);
    const twoAging = resultFor([
      effort({ id: "a", duration: 300, value: 250, observedAt: "2026-06-15T00:00:00.000Z" }),
      effort({ id: "b", duration: 300, value: 250, observedAt: "2026-06-15T00:00:00.000Z" }),
    ]);

    expect(twoFresh).toMatchObject({ state: "estimated", estimate: 250 });
    expect(threeFresh.uncertainty).toBeLessThan(twoFresh.uncertainty);
    expect(fourFresh.uncertainty).toBeLessThan(threeFresh.uncertainty);
    expect(twoAging.uncertainty).toBeGreaterThan(twoFresh.uncertainty);
    expect(twoAging.uncertainty).toBeLessThan(1);
  });

  it.each([
    ["future evidence", { observedAt: "2026-07-04T00:00:00.000Z" }],
    ["unknown-value evidence", { qualityState: "unknown" }],
    ["unknown-unit evidence", { rawObservation: { value: 300, unit: null } }],
    ["insufficient evidence", { qualityState: "insufficient" }],
    ["invalid evidence", { validityState: "invalid" }],
    ["unit-incompatible evidence", { compatibilityState: "incompatible_unit" }],
    ["modality-incompatible evidence", { compatibilityState: "incompatible_modality" }],
    ["unsupported evidence", { compatibilityState: "unsupported" }],
    ["raw value mismatch", { rawObservation: { value: 301, unit: "watts" } }],
    ["raw unit mismatch", { rawObservation: { value: 300, unit: "meters_per_second" } }],
    ["sport mismatch", { sport: "run" }],
    ["modality mismatch", { modality: "speed" }],
  ] as const)("excludes %s", (_label, override) => {
    const item = effort({ id: "rejected", duration: 100, value: 300 });
    const input = model([item]);
    input.evidenceRegistry[item.sourceId] = evidenceItemSchema.parse({
      ...input.evidenceRegistry[item.sourceId],
      ...override,
    });

    const result = calculateDurationAwareEffortCurve({
      model: input,
      threshold: target(100),
      highIntensity: target(100),
    }).threshold;

    expect(result).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["no_compatible_efforts"],
    });
  });

  it("requires matching duration and value evidence but ignores unrelated ineligible references", () => {
    const item = effort({ id: "multi-source", duration: 100, value: 300 });
    const missing = model([item]);
    delete missing.evidenceRegistry[item.sourceId];

    const secondSourceId = "effort:invalid-secondary";
    const withInvalidSecondary = model([effort({ id: "multi-source", duration: 100, value: 300 })]);
    withInvalidSecondary.efforts[0] = effortObservationInputSchema.parse({
      ...withInvalidSecondary.efforts[0],
      evidenceSourceIds: [`${item.sourceId}:duration`, item.sourceId, secondSourceId],
    });
    withInvalidSecondary.evidenceRegistry[secondSourceId] = evidenceItemSchema.parse({
      ...withInvalidSecondary.evidenceRegistry[item.sourceId],
      sourceId: secondSourceId,
      validityState: "invalid",
    });

    expect(
      calculateDurationAwareEffortCurve({
        model: missing,
        threshold: target(100),
        highIntensity: target(100),
      }).threshold,
    ).toMatchObject({ state: "insufficient_evidence", reasonCodes: ["no_compatible_efforts"] });
    expect(
      calculateDurationAwareEffortCurve({
        model: withInvalidSecondary,
        threshold: target(100),
        highIntensity: target(100),
      }).threshold,
    ).toMatchObject({
      state: "insufficient_evidence",
      contributingSourceIds: [`${item.sourceId}:duration`, item.sourceId],
      reasonCodes: ["single_lineage_not_recommendation_compatible"],
    });
  });
});
