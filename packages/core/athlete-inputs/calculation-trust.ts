import { z } from "zod";

export const CALCULATION_TRUST_MVP_VERSION = "calculation-trust-mvp-v1";
export const CALCULATION_TRUST_MODEL_VERSION = "quality-recency-huber-v1";

const MILLISECONDS_PER_DAY = 86_400_000;
const DEFAULT_RECENCY_HALF_LIFE_DAYS = 42;
const QUALITY_WEIGHT_FLOOR = 0.1;
const RECENCY_WEIGHT_FLOOR = 0.05;
const RESIDUAL_WEIGHT_FLOOR = 0;
const RESIDUAL_CUTOFF_MULTIPLIER = 2.5;
const MAX_EFFORTS = 10_000;
const MAX_SIGNAL_VALUE = 1_000_000_000;

export const calculationTrustEffortSourceSchema = z
  .object({
    identity: z.string().trim().min(1).max(512),
    provenance: z.string().trim().min(1).max(512),
    calculationVersion: z.string().trim().min(1).max(128),
    activityId: z.string().trim().min(1).max(512).nullable(),
    segmentId: z.string().trim().min(1).max(512).nullable(),
  })
  .strict();

export const calculationTrustObservedEffortSchema = z
  .object({
    effortId: z.string().trim().min(1).max(512),
    source: calculationTrustEffortSourceSchema,
    observedAt: z.iso.datetime({ offset: true }),
    performanceSignal: z.number().finite().positive().max(MAX_SIGNAL_VALUE),
    durationSeconds: z.number().finite().positive().max(604_800),
    expectedDurationSeconds: z.number().finite().positive().max(604_800),
    coveredDurationSeconds: z.number().finite().nonnegative().max(604_800),
    gapDurationSeconds: z.number().finite().nonnegative().max(604_800),
  })
  .strict()
  .superRefine((effort, context) => {
    if (effort.coveredDurationSeconds > effort.durationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["coveredDurationSeconds"],
        message: "Covered duration cannot exceed source duration",
      });
    }
    if (effort.gapDurationSeconds > effort.durationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["gapDurationSeconds"],
        message: "Gap duration cannot exceed source duration",
      });
    }
    if (effort.coveredDurationSeconds + effort.gapDurationSeconds > effort.durationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["gapDurationSeconds"],
        message: "Covered and gap durations cannot overlap",
      });
    }
  });

export const calculationTrustEstimateInputSchema = z
  .object({
    asOf: z.iso.datetime({ offset: true }),
    signalKind: z.string().trim().min(1).max(128),
    signalUnit: z.string().trim().min(1).max(128),
    recencyHalfLifeDays: z
      .number()
      .finite()
      .positive()
      .max(3_650)
      .default(DEFAULT_RECENCY_HALF_LIFE_DAYS),
    efforts: z.array(calculationTrustObservedEffortSchema).max(MAX_EFFORTS),
  })
  .strict()
  .superRefine((input, context) => {
    const asOfMs = Date.parse(input.asOf);
    const effortIds = new Set<string>();
    for (let index = 0; index < input.efforts.length; index++) {
      const effort = input.efforts[index];
      if (effort === undefined) continue;
      if (Date.parse(effort.observedAt) > asOfMs) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index, "observedAt"],
          message: "Observed effort cannot occur after asOf",
        });
      }
      if (effortIds.has(effort.effortId)) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index, "effortId"],
          message: "Observed effort identity must be unique",
        });
      }
      effortIds.add(effort.effortId);
    }
  });

export const calculationTrustContributorSchema = z
  .object({
    effortId: z.string().min(1),
    source: calculationTrustEffortSourceSchema,
    observedAt: z.iso.datetime({ offset: true }),
    performanceSignal: z.number().finite().positive(),
    durationSeconds: z.number().finite().positive(),
    expectedDurationSeconds: z.number().finite().positive(),
    coveredDurationSeconds: z.number().finite().nonnegative(),
    gapDurationSeconds: z.number().finite().nonnegative(),
    coverageRatio: z.number().finite().min(0).max(1),
    gapIntegrityRatio: z.number().finite().min(0).max(1),
    durationEvidenceRatio: z.number().finite().min(0).max(1),
    qualityWeight: z.number().finite().positive().max(1),
    ageDays: z.number().finite().nonnegative(),
    recencyWeight: z.number().finite().positive().max(1),
    combinedWeight: z.number().finite().positive().max(1),
    weightedSignal: z.number().finite().positive(),
    residual: z.number().finite(),
    residualWeight: z.number().finite().positive().max(1),
    robustWeight: z.number().finite().positive().max(1),
    robustWeightedSignal: z.number().finite().positive(),
    influenceShare: z.number().finite().positive().max(1),
  })
  .strict();

const calculationTrustAggregateSchema = z
  .object({
    contributorCount: z.number().int().nonnegative(),
    totalCombinedWeight: z.number().finite().nonnegative(),
    totalRobustWeight: z.number().finite().nonnegative(),
    effectiveContributorCount: z.number().finite().nonnegative(),
    coverage: z.number().finite().min(0).max(1),
    quality: z.number().finite().min(0).max(1),
    recency: z.number().finite().min(0).max(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

const calculationTrustDiagnosticsSchema = z
  .object({
    weightedMedian: z.number().finite().positive().nullable(),
    weightedMedianAbsoluteDeviation: z.number().finite().nonnegative().nullable(),
    robustScale: z.number().finite().positive().nullable(),
    qualityWeightFloor: z.literal(QUALITY_WEIGHT_FLOOR),
    recencyWeightFloor: z.literal(RECENCY_WEIGHT_FLOOR),
    residualWeightFloor: z.literal(RESIDUAL_WEIGHT_FLOOR),
    residualCutoffMultiplier: z.literal(RESIDUAL_CUTOFF_MULTIPLIER),
    recencyHalfLifeDays: z.number().finite().positive(),
    qualityFormula: z.literal(
      "floor_plus_0.9_times_0.5_coverage_plus_0.3_gap_integrity_plus_0.2_duration",
    ),
    recencyFormula: z.literal("max_floor_two_to_negative_age_over_half_life"),
    aggregationMethod: z.literal("weighted_median_then_bounded_residual_weighted_mean"),
  })
  .strict();

const calculationTrustResultBaseSchema = z.object({
  calculationVersion: z.literal(CALCULATION_TRUST_MVP_VERSION),
  modelVersion: z.literal(CALCULATION_TRUST_MODEL_VERSION),
  asOf: z.iso.datetime({ offset: true }),
  signalKind: z.string().min(1),
  signalUnit: z.string().min(1),
});

export const calculationTrustEstimateResultSchema = z.discriminatedUnion("status", [
  calculationTrustResultBaseSchema
    .extend({
      status: z.literal("available"),
      centralValue: z.number().finite().positive(),
      contributors: z.array(calculationTrustContributorSchema).min(1),
      aggregate: calculationTrustAggregateSchema,
      diagnostics: calculationTrustDiagnosticsSchema,
    })
    .strict(),
  calculationTrustResultBaseSchema
    .extend({
      status: z.literal("unavailable"),
      reason: z.literal("no_observed_efforts"),
      centralValue: z.null(),
      contributors: z.tuple([]),
      aggregate: calculationTrustAggregateSchema,
      diagnostics: calculationTrustDiagnosticsSchema,
    })
    .strict(),
]);

export type CalculationTrustObservedEffort = z.infer<typeof calculationTrustObservedEffortSchema>;
export type CalculationTrustEstimateInput = z.input<typeof calculationTrustEstimateInputSchema>;
export type CalculationTrustContributor = z.infer<typeof calculationTrustContributorSchema>;
export type CalculationTrustEstimateResult = z.infer<typeof calculationTrustEstimateResultSchema>;

interface WeightedValue {
  value: number;
  weight: number;
  tieBreaker: string;
}

interface BaseContributor {
  effort: CalculationTrustObservedEffort;
  coverageRatio: number;
  gapIntegrityRatio: number;
  durationEvidenceRatio: number;
  qualityWeight: number;
  ageDays: number;
  recencyWeight: number;
  combinedWeight: number;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function weightedMedian(values: readonly WeightedValue[]): number {
  const ordered = [...values].sort(
    (left, right) => left.value - right.value || left.tieBreaker.localeCompare(right.tieBreaker),
  );
  const threshold = ordered.reduce((sum, item) => sum + item.weight, 0) / 2;
  let cumulativeWeight = 0;
  for (const item of ordered) {
    cumulativeWeight += item.weight;
    if (cumulativeWeight >= threshold) return item.value;
  }
  return ordered.at(-1)?.value ?? 0;
}

function weightedAverage(
  contributors: readonly BaseContributor[],
  select: (contributor: BaseContributor) => number,
): number {
  const totalWeight = contributors.reduce(
    (sum, contributor) => sum + contributor.combinedWeight,
    0,
  );
  if (totalWeight <= 0) return 0;
  return (
    contributors.reduce(
      (sum, contributor) => sum + select(contributor) * contributor.combinedWeight,
      0,
    ) / totalWeight
  );
}

function buildBaseContributor(
  effort: CalculationTrustObservedEffort,
  asOfMs: number,
  recencyHalfLifeDays: number,
): BaseContributor {
  const coverageRatio = clampUnit(effort.coveredDurationSeconds / effort.durationSeconds);
  const gapIntegrityRatio = clampUnit(1 - effort.gapDurationSeconds / effort.durationSeconds);
  const durationEvidenceRatio = clampUnit(effort.durationSeconds / effort.expectedDurationSeconds);
  const rawQuality = 0.5 * coverageRatio + 0.3 * gapIntegrityRatio + 0.2 * durationEvidenceRatio;
  const qualityWeight = QUALITY_WEIGHT_FLOOR + (1 - QUALITY_WEIGHT_FLOOR) * rawQuality;
  const ageDays = (asOfMs - Date.parse(effort.observedAt)) / MILLISECONDS_PER_DAY;
  const recencyWeight = Math.max(RECENCY_WEIGHT_FLOOR, 2 ** (-ageDays / recencyHalfLifeDays));
  return {
    effort,
    coverageRatio,
    gapIntegrityRatio,
    durationEvidenceRatio,
    qualityWeight,
    ageDays,
    recencyWeight,
    combinedWeight: qualityWeight * recencyWeight,
  };
}

/**
 * Produces a projection only. It deliberately does not adopt a threshold,
 * mutate a calibration snapshot, persist state, or choose a downstream policy.
 */
export function calculatePerformanceSignalEstimate(
  rawInput: CalculationTrustEstimateInput,
): CalculationTrustEstimateResult {
  const input = calculationTrustEstimateInputSchema.parse(rawInput);
  const emptyAggregate = {
    contributorCount: 0,
    totalCombinedWeight: 0,
    totalRobustWeight: 0,
    effectiveContributorCount: 0,
    coverage: 0,
    quality: 0,
    recency: 0,
    confidence: 0,
  };
  const emptyDiagnostics = {
    weightedMedian: null,
    weightedMedianAbsoluteDeviation: null,
    robustScale: null,
    qualityWeightFloor: QUALITY_WEIGHT_FLOOR,
    recencyWeightFloor: RECENCY_WEIGHT_FLOOR,
    residualWeightFloor: RESIDUAL_WEIGHT_FLOOR,
    residualCutoffMultiplier: RESIDUAL_CUTOFF_MULTIPLIER,
    recencyHalfLifeDays: input.recencyHalfLifeDays,
    qualityFormula: "floor_plus_0.9_times_0.5_coverage_plus_0.3_gap_integrity_plus_0.2_duration",
    recencyFormula: "max_floor_two_to_negative_age_over_half_life",
    aggregationMethod: "weighted_median_then_bounded_residual_weighted_mean",
  };
  if (input.efforts.length === 0) {
    return calculationTrustEstimateResultSchema.parse({
      status: "unavailable",
      reason: "no_observed_efforts",
      centralValue: null,
      calculationVersion: CALCULATION_TRUST_MVP_VERSION,
      modelVersion: CALCULATION_TRUST_MODEL_VERSION,
      asOf: input.asOf,
      signalKind: input.signalKind,
      signalUnit: input.signalUnit,
      contributors: [],
      aggregate: emptyAggregate,
      diagnostics: emptyDiagnostics,
    });
  }

  const asOfMs = Date.parse(input.asOf);
  const baseContributors = input.efforts.map((effort) =>
    buildBaseContributor(effort, asOfMs, input.recencyHalfLifeDays),
  );
  const weightedValues = baseContributors.map((contributor) => ({
    value: contributor.effort.performanceSignal,
    weight: contributor.combinedWeight,
    tieBreaker: contributor.effort.effortId,
  }));
  const median = weightedMedian(weightedValues);
  const medianAbsoluteDeviation = weightedMedian(
    baseContributors.map((contributor) => ({
      value: Math.abs(contributor.effort.performanceSignal - median),
      weight: contributor.combinedWeight,
      tieBreaker: contributor.effort.effortId,
    })),
  );
  const robustScale = Math.max(medianAbsoluteDeviation, Math.abs(median) * 0.05, 1e-9);

  const residualContributors = baseContributors.map((contributor) => {
    const residual = contributor.effort.performanceSignal - median;
    const absoluteResidual = Math.abs(residual);
    const residualWeight =
      absoluteResidual === 0
        ? 1
        : Math.min(1, (RESIDUAL_CUTOFF_MULTIPLIER * robustScale) / absoluteResidual);
    return {
      base: contributor,
      residual,
      residualWeight,
      robustWeight: contributor.combinedWeight * residualWeight,
    };
  });
  const totalCombinedWeight = baseContributors.reduce(
    (sum, contributor) => sum + contributor.combinedWeight,
    0,
  );
  const totalRobustWeight = residualContributors.reduce(
    (sum, contributor) => sum + contributor.robustWeight,
    0,
  );
  const centralValue =
    residualContributors.reduce(
      (sum, contributor) =>
        sum + contributor.base.effort.performanceSignal * contributor.robustWeight,
      0,
    ) / totalRobustWeight;
  const contributors: CalculationTrustContributor[] = residualContributors.map(
    ({ base, residual, residualWeight, robustWeight }) => ({
      effortId: base.effort.effortId,
      source: base.effort.source,
      observedAt: base.effort.observedAt,
      performanceSignal: base.effort.performanceSignal,
      durationSeconds: base.effort.durationSeconds,
      expectedDurationSeconds: base.effort.expectedDurationSeconds,
      coveredDurationSeconds: base.effort.coveredDurationSeconds,
      gapDurationSeconds: base.effort.gapDurationSeconds,
      coverageRatio: base.coverageRatio,
      gapIntegrityRatio: base.gapIntegrityRatio,
      durationEvidenceRatio: base.durationEvidenceRatio,
      qualityWeight: base.qualityWeight,
      ageDays: base.ageDays,
      recencyWeight: base.recencyWeight,
      combinedWeight: base.combinedWeight,
      weightedSignal: base.effort.performanceSignal * base.combinedWeight,
      residual,
      residualWeight,
      robustWeight,
      robustWeightedSignal: base.effort.performanceSignal * robustWeight,
      influenceShare: robustWeight / totalRobustWeight,
    }),
  );
  const sumOfSquaredWeights = baseContributors.reduce(
    (sum, contributor) => sum + contributor.combinedWeight ** 2,
    0,
  );
  const effectiveContributorCount =
    sumOfSquaredWeights > 0 ? totalCombinedWeight ** 2 / sumOfSquaredWeights : 0;
  const coverage = weightedAverage(baseContributors, (contributor) => contributor.coverageRatio);
  const quality = weightedAverage(baseContributors, (contributor) => contributor.qualityWeight);
  const recency = weightedAverage(baseContributors, (contributor) => contributor.recencyWeight);
  const confidence = clampUnit(
    quality * recency * (0.5 + 0.5 * coverage) * Math.min(1, effectiveContributorCount / 3),
  );

  return calculationTrustEstimateResultSchema.parse({
    status: "available",
    centralValue,
    calculationVersion: CALCULATION_TRUST_MVP_VERSION,
    modelVersion: CALCULATION_TRUST_MODEL_VERSION,
    asOf: input.asOf,
    signalKind: input.signalKind,
    signalUnit: input.signalUnit,
    contributors,
    aggregate: {
      contributorCount: contributors.length,
      totalCombinedWeight,
      totalRobustWeight,
      effectiveContributorCount,
      coverage,
      quality,
      recency,
      confidence,
    },
    diagnostics: {
      ...emptyDiagnostics,
      weightedMedian: median,
      weightedMedianAbsoluteDeviation: medianAbsoluteDeviation,
      robustScale,
    },
  });
}
