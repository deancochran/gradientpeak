import type { CanonicalSport } from "../../schemas/sport";
import {
  type CalculationResult,
  estimatedResult,
  observedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import {
  type AthleteMetricRole,
  type AthleteMetricType,
  athleteMetricRoleByType,
  type CalculationEligibleEvidence,
  resolveEvidenceEligibility,
} from "../evidence-contracts";
import {
  type AthleteIntelligenceModelInput,
  athleteIntelligenceModelInputSchema,
  type MetricEvidenceInput,
} from "../model-input-contracts";

export const PHYSIOLOGY_METRICS_POLICY_VERSION = "physiology_metrics_v1";

/**
 * Policy constants affect evidence influence and uncertainty only. They never
 * transform a raw measurement or define a physiological category.
 */
export const PHYSIOLOGY_METRICS_POLICY_CONSTANTS = Object.freeze({
  version: PHYSIOLOGY_METRICS_POLICY_VERSION,
  freshnessHalfLifeDays: 90,
  minimumInfluence: 0.05,
  baselineWindowDays: 90,
  minimumHistoricalLineages: 5,
});

const expectedUnits: Record<AthleteMetricType, string> = {
  ftp: "watts",
  threshold_pace_seconds_per_km: "seconds_per_km",
  css_seconds_per_100m: "seconds_per_100m",
  lthr: "beats_per_minute",
  max_hr: "beats_per_minute",
  resting_hr: "beats_per_minute",
  vo2_max: "milliliters_per_kilogram_per_minute",
  weight_kg: "kilograms",
  hrv_rmssd: "milliseconds",
  sleep_hours: "hours",
  stress_score: "score",
  soreness_level: "score",
  wellness_score: "score",
  age_years: "years",
};

export const PHYSIOLOGY_METRIC_TYPES = [
  "ftp",
  "threshold_pace_seconds_per_km",
  "css_seconds_per_100m",
  "lthr",
  "max_hr",
  "resting_hr",
  "vo2_max",
  "weight_kg",
  "hrv_rmssd",
  "sleep_hours",
  "stress_score",
  "soreness_level",
  "wellness_score",
  "age_years",
] satisfies readonly AthleteMetricType[];

export type PhysiologyMetricEffect = Readonly<{
  role: AthleteMetricRole;
  result: CalculationResult;
  influence: number;
}>;

export type PhysiologyMetricsPolicyResult = Readonly<{
  policyVersion: typeof PHYSIOLOGY_METRICS_POLICY_VERSION;
  metrics: Readonly<Record<AthleteMetricType, PhysiologyMetricEffect>>;
  wattsPerKilogram: CalculationResult;
  heartRateReserve: CalculationResult;
  individualizedRatios: Readonly<
    Record<"hrvRmssd" | "sleep" | "stress" | "soreness" | "wellness", CalculationResult>
  >;
}>;

type Candidate = Readonly<{
  metric: MetricEvidenceInput;
  evidence: CalculationEligibleEvidence;
  influence: number;
}>;

const unavailable = (reasonCode: string, sourceIds: readonly string[] = []): CalculationResult =>
  unavailableResult({
    state: "insufficient_evidence",
    missingDataState: sourceIds.length > 0 ? "partial" : "required_data_missing",
    uncertainty: 1,
    reasonCodes: [reasonCode],
    contributingSourceIds: sourceIds,
  });

function freshnessInfluence(observedAt: string, asOf: string): number {
  const ageDays = Math.max(0, (Date.parse(asOf) - Date.parse(observedAt)) / 86_400_000);
  const influence = 2 ** (-ageDays / PHYSIOLOGY_METRICS_POLICY_CONSTANTS.freshnessHalfLifeDays);
  return Math.max(PHYSIOLOGY_METRICS_POLICY_CONSTANTS.minimumInfluence, influence);
}

function candidatesFor(
  input: AthleteIntelligenceModelInput,
  metricType: AthleteMetricType,
  targetSport?: CanonicalSport | null,
): Candidate[] {
  return input.metricEvidence
    .filter((metric) => metric.metricType === metricType)
    .flatMap((metric) =>
      metric.value.evidenceSourceIds.flatMap((sourceId) => {
        const source = input.evidenceRegistry[sourceId];
        if (
          !source ||
          (metricType === "lthr" &&
            targetSport != null &&
            source.sport !== null &&
            source.sport !== targetSport) ||
          metric.value.value === null ||
          metric.value.unit !== expectedUnits[metricType]
        )
          return [];
        const eligibility = resolveEvidenceEligibility({
          evidence: source,
          asOf: input.assessmentAsOf,
        });
        if (
          !eligibility.eligible ||
          eligibility.evidence.rawObservation.value !== metric.value.value ||
          eligibility.evidence.rawObservation.unit !== metric.value.unit
        )
          return [];
        return [
          {
            metric,
            evidence: eligibility.evidence,
            influence: freshnessInfluence(source.observedAt, input.assessmentAsOf),
          },
        ];
      }),
    );
}

function preferredCandidate(
  candidates: readonly Candidate[],
  preferredSport?: CanonicalSport | null,
): Candidate | undefined {
  return [...candidates].sort((left, right) => {
    const sportPriority = (candidate: Candidate) =>
      preferredSport != null && candidate.evidence.sport === preferredSport ? 1 : 0;
    const performancePriority = (candidate: Candidate) =>
      candidate.evidence.sourceType === "activity_effort" ||
      candidate.evidence.sourceType === "activity"
        ? 1
        : 0;
    return (
      sportPriority(right) - sportPriority(left) ||
      performancePriority(right) - performancePriority(left) ||
      Date.parse(right.evidence.observedAt) - Date.parse(left.evidence.observedAt) ||
      right.evidence.sourceId.localeCompare(left.evidence.sourceId)
    );
  })[0];
}

function independentCandidates(candidates: readonly Candidate[]): Candidate[] {
  const byLineage = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const lineage = byLineage.get(candidate.evidence.lineageGroupId) ?? [];
    lineage.push(candidate);
    byLineage.set(candidate.evidence.lineageGroupId, lineage);
  }
  return [...byLineage.values()].flatMap((lineage) => {
    const preferred = preferredCandidate(lineage);
    return preferred ? [preferred] : [];
  });
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) return Number.NaN;
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

function directEffect(
  input: AthleteIntelligenceModelInput,
  metricType: AthleteMetricType,
  targetSport?: CanonicalSport | null,
): PhysiologyMetricEffect {
  const candidate = preferredCandidate(
    independentCandidates(candidatesFor(input, metricType, targetSport)),
    targetSport,
  );
  if (!candidate) {
    const referenced = input.metricEvidence
      .filter((metric) => metric.metricType === metricType)
      .flatMap((metric) => metric.value.evidenceSourceIds);
    return {
      role: athleteMetricRoleByType[metricType],
      result: unavailable(
        referenced.length ? "invalid_or_incompatible_metric_evidence" : "metric_evidence_missing",
        referenced,
      ),
      influence: 0,
    };
  }
  return {
    role: athleteMetricRoleByType[metricType],
    result: observedResult({
      rawValue: candidate.evidence.rawObservation.value,
      unit: candidate.evidence.rawObservation.unit,
      sourceId: candidate.evidence.sourceId,
      uncertainty: 1 - candidate.influence,
      reasonCodes: ["freshness_affects_influence_only"],
    }),
    influence: candidate.influence,
  };
}

function derivedRatio(
  input: AthleteIntelligenceModelInput,
  metricType: AthleteMetricType,
): CalculationResult {
  const candidates = independentCandidates(candidatesFor(input, metricType)).sort(
    (left, right) => Date.parse(right.evidence.observedAt) - Date.parse(left.evidence.observedAt),
  );
  const current = candidates[0];
  if (!current) return unavailable("athlete_baseline_missing");
  const currentTime = Date.parse(current.evidence.observedAt);
  const windowStart =
    Date.parse(input.assessmentAsOf) -
    PHYSIOLOGY_METRICS_POLICY_CONSTANTS.baselineWindowDays * 86_400_000;
  const history = candidates.filter((candidate) => {
    const observedAt = Date.parse(candidate.evidence.observedAt);
    return observedAt < currentTime && observedAt >= windowStart;
  });
  if (history.length < PHYSIOLOGY_METRICS_POLICY_CONSTANTS.minimumHistoricalLineages)
    return unavailable(
      "athlete_baseline_insufficient_independent_history",
      [current, ...history].map((item) => item.evidence.sourceId),
    );
  const historicalValues = history.map((item) => item.evidence.rawObservation.value);
  const baseline = median(historicalValues);
  if (!(baseline > 0))
    return unavailable(
      "athlete_baseline_invalid",
      history.map((item) => item.evidence.sourceId),
    );
  const medianAbsoluteDeviation = median(
    historicalValues.map((value) => Math.abs(value - baseline)),
  );
  const robustVariation = medianAbsoluteDeviation / baseline;
  return estimatedResult({
    estimate: current.evidence.rawObservation.value / baseline,
    unit: "ratio_to_athlete_baseline",
    uncertainty: Math.min(
      1,
      1 - Math.min(current.influence, ...history.map((item) => item.influence)) + robustVariation,
    ),
    reasonCodes: ["individualized_median_mad_baseline_ratio"],
    contributingSourceIds: [
      current.evidence.sourceId,
      ...history.map((item) => item.evidence.sourceId),
    ],
  });
}

/** Applies role-bounded, continuous physiology policies without producing an athlete score. */
export function evaluatePhysiologyMetrics(
  rawInput: AthleteIntelligenceModelInput,
  targetSport?: CanonicalSport | null,
): PhysiologyMetricsPolicyResult {
  const assessmentTime = Date.parse(rawInput.assessmentAsOf);
  const evidenceRegistry = Object.fromEntries(
    Object.entries(rawInput.evidenceRegistry).filter(
      ([, evidence]) => Date.parse(evidence.observedAt) <= assessmentTime,
    ),
  );
  const input = athleteIntelligenceModelInputSchema.parse({
    ...rawInput,
    evidenceRegistry,
    metricEvidence: rawInput.metricEvidence.flatMap((metric) => {
      const evidenceSourceIds = metric.value.evidenceSourceIds.filter(
        (sourceId) => evidenceRegistry[sourceId] !== undefined,
      );
      return evidenceSourceIds.length > 0
        ? [{ ...metric, value: { ...metric.value, evidenceSourceIds } }]
        : [];
    }),
  });
  const metrics: Record<AthleteMetricType, PhysiologyMetricEffect> = {
    ftp: directEffect(input, "ftp"),
    threshold_pace_seconds_per_km: directEffect(input, "threshold_pace_seconds_per_km", "run"),
    css_seconds_per_100m: directEffect(input, "css_seconds_per_100m", "swim"),
    lthr: directEffect(input, "lthr", targetSport),
    max_hr: directEffect(input, "max_hr"),
    resting_hr: directEffect(input, "resting_hr"),
    vo2_max: directEffect(input, "vo2_max"),
    weight_kg: directEffect(input, "weight_kg"),
    hrv_rmssd: directEffect(input, "hrv_rmssd"),
    sleep_hours: directEffect(input, "sleep_hours"),
    stress_score: directEffect(input, "stress_score"),
    soreness_level: directEffect(input, "soreness_level"),
    wellness_score: directEffect(input, "wellness_score"),
    age_years: directEffect(input, "age_years"),
  };

  const ftp = metrics.ftp.result;
  const weight = metrics.weight_kg.result;
  const ftpSource = ftp.contributingSourceIds[0];
  const weightSource = weight.contributingSourceIds[0];
  const wattsPerKilogram =
    ftp.estimate !== null &&
    weight.estimate !== null &&
    weight.estimate > 0 &&
    ftpSource &&
    weightSource
      ? estimatedResult({
          estimate: ftp.estimate / weight.estimate,
          unit: "watts_per_kilogram",
          uncertainty: Math.max(ftp.uncertainty, weight.uncertainty),
          reasonCodes: ["ftp_divided_by_weight"],
          contributingSourceIds: [ftpSource, weightSource],
        })
      : unavailable("ftp_and_weight_required");

  const maxHr = metrics.max_hr.result;
  const restingHr = metrics.resting_hr.result;
  const maxHrSource = maxHr.contributingSourceIds[0];
  const restingHrSource = restingHr.contributingSourceIds[0];
  const heartRateReserve =
    maxHr.estimate !== null &&
    restingHr.estimate !== null &&
    maxHr.estimate > restingHr.estimate &&
    maxHrSource &&
    restingHrSource
      ? estimatedResult({
          estimate: maxHr.estimate - restingHr.estimate,
          unit: "beats_per_minute",
          uncertainty: Math.max(maxHr.uncertainty, restingHr.uncertainty),
          reasonCodes: ["max_hr_minus_resting_hr"],
          contributingSourceIds: [maxHrSource, restingHrSource],
        })
      : unavailable("max_and_resting_hr_required");

  return {
    policyVersion: PHYSIOLOGY_METRICS_POLICY_VERSION,
    metrics,
    wattsPerKilogram,
    heartRateReserve,
    individualizedRatios: {
      hrvRmssd: derivedRatio(input, "hrv_rmssd"),
      sleep: derivedRatio(input, "sleep_hours"),
      stress: derivedRatio(input, "stress_score"),
      soreness: derivedRatio(input, "soreness_level"),
      wellness: derivedRatio(input, "wellness_score"),
    },
  };
}
