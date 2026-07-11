import { type LoadSeriesIdentity, sameLoadSeriesIdentity } from "../../load/load-series";
import type { CanonicalSport } from "../../schemas/sport";
import {
  type CalculationResult,
  estimatedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import {
  type FieldEvidenceEligibility,
  type FieldEvidenceEligibilityInput,
  resolveFieldEvidenceEligibility,
} from "../eligibility";
import { type LineageGroupId, type SourceId, selectOnePerLineage } from "../lineage";

export const ACTIVITY_READINESS_POLICY_VERSION = "activity_readiness_v1" as const;

export const ACTIVITY_READINESS_CONSTANTS = {
  historyDays: 56,
  recencyHalfLifeDays: 14,
  trendWindowDays: 14,
  minimumTrendActivitiesPerWindow: 2,
  minimumDurabilityObservations: 4,
  minimumWellnessBaselineObservations: 5,
  currentWellnessDays: 3,
  robustOutlierMadMultiplier: 3,
} as const;

export interface ActivityHistoryObservation {
  sourceId: SourceId;
  lineageGroupId: LineageGroupId;
  startedAt: string;
  sport: CanonicalSport;
  durationSeconds: number | null;
  trainingLoad?: number | null;
  trainingLoadIdentity?: LoadSeriesIdentity | null;
  averagePowerWatts?: number | null;
  averageHeartRateBpm?: number | null;
  efficiencyFactor?: number | null;
  decouplingPercent?: number | null;
  /** One eligibility record may gate every numeric field on this activity. */
  eligibility?: ActivityEvidenceInput;
  /** Field records override the activity record, preserving the supplied raw values. */
  evidence?: Partial<Record<ActivityEvidenceField, ActivityEvidenceInput>>;
}

export type ActivityEvidenceField =
  | "durationSeconds"
  | "trainingLoad"
  | "averagePowerWatts"
  | "averageHeartRateBpm"
  | "efficiencyFactor"
  | "decouplingPercent";

export type ActivityEvidenceInput = Omit<FieldEvidenceEligibilityInput, "asOf" | "requiredSport">;

export type ReadinessContextMetric =
  | "hrv_rmssd"
  | "sleep_hours"
  | "stress_score"
  | "soreness_level"
  | "wellness_score";

export interface ReadinessContextObservation {
  sourceId: SourceId;
  lineageGroupId: LineageGroupId;
  observedAt: string;
  metric: ReadinessContextMetric;
  value: number;
  eligibility?: ActivityEvidenceInput;
}

export interface ActivityReadinessInput {
  assessmentAt: string;
  targetSport: CanonicalSport;
  activities: readonly ActivityHistoryObservation[];
  readinessContext?: readonly ReadinessContextObservation[];
}

export interface ActivityReadinessResults {
  policyVersion: typeof ACTIVITY_READINESS_POLICY_VERSION;
  endurance: CalculationResult;
  durability: CalculationResult;
  sportSpecificity: CalculationResult;
  volumeTrend: CalculationResult;
  frequencyTrend: CalculationResult;
  readinessContext: CalculationResult;
  /** Rejections are retained so callers do not mistake omitted values for zero. */
  rejectedEvidence?: readonly Extract<FieldEvidenceEligibility, { eligible: false }>[];
}

const DAY_MS = 86_400_000;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function robustValues(values: readonly number[]): number[] {
  if (values.length < 3) return [...values];
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  if (mad === 0) {
    // Preserve ordinary variation when a repeated-value baseline has zero MAD,
    // but prevent a single order-of-magnitude anomaly from dominating totals.
    const extremeLimit = Math.max(Math.abs(center), 1) * 10;
    return values.map((value) => (Math.abs(value - center) > extremeLimit ? center : value));
  }
  const limit = ACTIVITY_READINESS_CONSTANTS.robustOutlierMadMultiplier * 1.4826 * mad;
  return values.map((value) => Math.max(center - limit, Math.min(center + limit, value)));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueSources(values: readonly { sourceId: SourceId }[]): [SourceId, ...SourceId[]] {
  return [...new Set(values.map(({ sourceId }) => sourceId))] as [SourceId, ...SourceId[]];
}

function unavailable(
  reason: string,
  sources: readonly { sourceId: SourceId }[] = [],
  rejections: readonly Extract<FieldEvidenceEligibility, { eligible: false }>[] = [],
): CalculationResult {
  const sourceIds = [
    ...sources.map(({ sourceId }) => sourceId),
    ...rejections.map(({ sourceId }) => sourceId),
  ];
  const reasonCodes = [reason, ...rejections.map(({ reasonCode }) => reasonCode)];
  return unavailableResult({
    state: sourceIds.length === 0 ? "unknown" : "insufficient_evidence",
    missingDataState: sourceIds.length === 0 ? "required_data_missing" : "partial",
    uncertainty: 1,
    reasonCodes: [...new Set(reasonCodes)] as [string, ...string[]],
    contributingSourceIds: [...new Set(sourceIds)],
  });
}

function fieldEligibility(
  evidence: ActivityEvidenceInput | undefined,
  asOf: string,
  sport?: CanonicalSport,
): FieldEvidenceEligibility | undefined {
  return evidence === undefined
    ? undefined
    : resolveFieldEvidenceEligibility({ ...evidence, asOf, requiredSport: sport });
}

function uniqueRejections(
  rejections: readonly Extract<FieldEvidenceEligibility, { eligible: false }>[],
): Extract<FieldEvidenceEligibility, { eligible: false }>[] {
  return [
    ...new Map(
      rejections.map((rejection) => [
        `${rejection.sourceId}:${rejection.lineageGroupId}:${rejection.reasonCode}`,
        rejection,
      ]),
    ).values(),
  ];
}

function estimate(
  value: number,
  unit: string,
  reason: string,
  sources: readonly { sourceId: SourceId }[],
  uncertainty: number,
): CalculationResult {
  return estimatedResult({
    estimate: value,
    unit,
    uncertainty,
    reasonCodes: [reason],
    contributingSourceIds: uniqueSources(sources),
  });
}

/** Pure v1 policy. Values are continuous measurements, never categories or a composite score. */
export function calculateActivityReadinessV1(
  input: ActivityReadinessInput,
): ActivityReadinessResults {
  const assessmentMs = Date.parse(input.assessmentAt);
  const activityRejections: Extract<FieldEvidenceEligibility, { eligible: false }>[] = [];
  const eligibilityGatedActivities = input.activities.map((activity) => {
    const gated = { ...activity };
    for (const field of [
      "durationSeconds",
      "trainingLoad",
      "averagePowerWatts",
      "averageHeartRateBpm",
      "efficiencyFactor",
      "decouplingPercent",
    ] as const) {
      const eligibility = fieldEligibility(
        activity.evidence?.[field] ?? activity.eligibility,
        input.assessmentAt,
        activity.sport,
      );
      if (eligibility !== undefined && !eligibility.eligible) {
        activityRejections.push(eligibility);
        gated[field] = null;
      }
    }
    return gated;
  });
  const deduplicatedActivities = selectOnePerLineage({
    values: eligibilityGatedActivities,
    lineageOf: (activity) => activity.lineageGroupId,
    influenceOf: (activity) =>
      [
        activity.durationSeconds,
        activity.trainingLoad,
        activity.efficiencyFactor,
        activity.decouplingPercent,
        activity.averagePowerWatts,
        activity.averageHeartRateBpm,
      ].filter((value) => value !== null && value !== undefined && Number.isFinite(value)).length,
  });
  const eligible = deduplicatedActivities
    .map((activity) => ({
      activity,
      ageDays: (assessmentMs - Date.parse(activity.startedAt)) / DAY_MS,
    }))
    .filter(({ ageDays }) => ageDays >= 0 && ageDays <= ACTIVITY_READINESS_CONSTANTS.historyDays);
  const durationEligible = eligible.filter(
    ({ activity }) =>
      activity.sport === input.targetSport &&
      activity.durationSeconds !== null &&
      activity.durationSeconds > 0,
  );
  const weight = (ageDays: number) =>
    2 ** (-ageDays / ACTIVITY_READINESS_CONSTANTS.recencyHalfLifeDays);
  const robustTargetDurations = robustValues(
    durationEligible.map(({ activity }) => (activity.durationSeconds ?? 0) / 60),
  );

  const endurance =
    durationEligible.length === 0
      ? unavailable("activity_duration_history_missing", [], activityRejections)
      : estimate(
          durationEligible.reduce(
            (sum, { ageDays }, index) =>
              sum + (robustTargetDurations[index] ?? 0) * weight(ageDays),
            0,
          ),
          "recency_weighted_minutes",
          "duration_recency_weighted",
          durationEligible.map(({ activity }) => activity),
          1 / Math.sqrt(durationEligible.length + 1),
        );

  const allDurationEligible = eligible.filter(
    ({ activity }) => activity.durationSeconds !== null && activity.durationSeconds > 0,
  );
  const robustAllDurations = robustValues(
    allDurationEligible.map(({ activity }) => activity.durationSeconds ?? 0),
  );
  const totalWeightedDuration = allDurationEligible.reduce(
    (sum, { ageDays }, index) => sum + (robustAllDurations[index] ?? 0) * weight(ageDays),
    0,
  );
  const matchingWeightedDuration = allDurationEligible.reduce(
    (sum, { activity, ageDays }, index) =>
      sum +
      (activity.sport === input.targetSport
        ? (robustAllDurations[index] ?? 0) * weight(ageDays)
        : 0),
    0,
  );
  const sportSpecificity =
    totalWeightedDuration === 0
      ? unavailable("activity_duration_history_missing", [], activityRejections)
      : estimate(
          matchingWeightedDuration / totalWeightedDuration,
          "ratio",
          "sport_duration_share_recency_weighted",
          allDurationEligible.map(({ activity }) => activity),
          1 / Math.sqrt(allDurationEligible.length + 1),
        );

  const durabilityEligible = eligible
    .filter(({ activity }) => activity.sport === input.targetSport)
    .map(({ activity, ageDays }) => {
      const efficiency =
        activity.efficiencyFactor ??
        (activity.sport === "bike" &&
        activity.averagePowerWatts !== null &&
        activity.averagePowerWatts !== undefined &&
        activity.averagePowerWatts > 0 &&
        activity.averageHeartRateBpm !== null &&
        activity.averageHeartRateBpm !== undefined &&
        activity.averageHeartRateBpm > 0
          ? activity.averagePowerWatts / activity.averageHeartRateBpm
          : null);
      const decoupling = activity.decouplingPercent;
      return {
        activity,
        ageDays,
        value:
          efficiency !== null && efficiency !== undefined && efficiency > 0
            ? efficiency / (1 + Math.max(0, decoupling ?? 0) / 100)
            : null,
      };
    })
    .filter((entry): entry is typeof entry & { value: number } => entry.value !== null);
  const durability =
    durabilityEligible.length < ACTIVITY_READINESS_CONSTANTS.minimumDurabilityObservations
      ? unavailable(
          durabilityEligible.length === 0
            ? "compatible_durability_history_missing"
            : "durability_baseline_insufficient",
          durabilityEligible.map(({ activity }) => activity),
          activityRejections,
        )
      : (() => {
          const robust = robustValues(durabilityEligible.map(({ value }) => value));
          const baseline = median(robust);
          const weighted = durabilityEligible.reduce(
            (sum, entry, index) => sum + (robust[index] ?? baseline) * weight(entry.ageDays),
            0,
          );
          const weights = durabilityEligible.reduce((sum, entry) => sum + weight(entry.ageDays), 0);
          return estimate(
            weighted / weights / baseline,
            "baseline_ratio",
            "efficiency_decoupling_robust_baseline",
            durabilityEligible.map(({ activity }) => activity),
            1 / Math.sqrt(durabilityEligible.length),
          );
        })();

  const recent = durationEligible.filter(
    ({ ageDays }) => ageDays < ACTIVITY_READINESS_CONSTANTS.trendWindowDays,
  );
  const prior = durationEligible.filter(
    ({ ageDays }) =>
      ageDays >= ACTIVITY_READINESS_CONSTANTS.trendWindowDays &&
      ageDays < ACTIVITY_READINESS_CONSTANTS.trendWindowDays * 2,
  );
  const enoughTrend =
    recent.length >= ACTIVITY_READINESS_CONSTANTS.minimumTrendActivitiesPerWindow &&
    prior.length >= ACTIVITY_READINESS_CONSTANTS.minimumTrendActivitiesPerWindow;
  const trendSources = [...recent, ...prior].map(({ activity }) => activity);
  const trendActivities = [...recent, ...prior].map(({ activity }) => activity);
  const firstLoadIdentity = trendActivities.find(
    (activity) => activity.trainingLoad !== null && activity.trainingLoad !== undefined,
  )?.trainingLoadIdentity;
  const compatibleLoadTrend =
    enoughTrend &&
    firstLoadIdentity !== null &&
    firstLoadIdentity !== undefined &&
    trendActivities.every(
      (activity) =>
        activity.trainingLoad !== null &&
        activity.trainingLoad !== undefined &&
        activity.trainingLoadIdentity !== null &&
        activity.trainingLoadIdentity !== undefined &&
        activity.trainingLoadIdentity.sport === activity.sport &&
        sameLoadSeriesIdentity(firstLoadIdentity, activity.trainingLoadIdentity),
    );
  const recentVolume = compatibleLoadTrend
    ? robustValues(recent.map(({ activity }) => activity.trainingLoad as number)).reduce(
        (sum, value) => sum + value,
        0,
      )
    : null;
  const priorVolume = compatibleLoadTrend
    ? robustValues(prior.map(({ activity }) => activity.trainingLoad as number)).reduce(
        (sum, value) => sum + value,
        0,
      )
    : null;
  const volumeTrend =
    enoughTrend && priorVolume !== null && priorVolume > 0 && recentVolume !== null
      ? estimate(
          (recentVolume - priorVolume) / priorVolume,
          "fractional_change",
          "recent_vs_prior_volume",
          trendSources,
          1 / Math.sqrt(trendSources.length),
        )
      : unavailable(
          enoughTrend && !compatibleLoadTrend
            ? "load_trend_identity_unavailable"
            : "volume_trend_history_insufficient",
          trendSources,
          activityRejections,
        );
  const frequencyTrend = enoughTrend
    ? estimate(
        recent.length / prior.length - 1,
        "fractional_change",
        "recent_vs_prior_frequency",
        trendSources,
        1 / Math.sqrt(trendSources.length),
      )
    : unavailable("frequency_trend_history_insufficient", trendSources, activityRejections);

  const contextRejections: Extract<FieldEvidenceEligibility, { eligible: false }>[] = [];
  const eligibilityGatedContext = (input.readinessContext ?? []).map((observation) => {
    const eligibility = fieldEligibility(observation.eligibility, input.assessmentAt);
    if (eligibility === undefined || eligibility.eligible) return observation;
    contextRejections.push(eligibility);
    return { ...observation, value: Number.NaN };
  });
  const deduplicatedContext = selectOnePerLineage({
    values: eligibilityGatedContext,
    lineageOf: (observation) => observation.lineageGroupId,
    influenceOf: (observation) => Date.parse(observation.observedAt),
  });
  const contextEligible = deduplicatedContext
    .map((observation) => ({
      observation,
      ageDays: (assessmentMs - Date.parse(observation.observedAt)) / DAY_MS,
    }))
    .filter(
      ({ observation, ageDays }) =>
        ageDays >= 0 &&
        ageDays <= ACTIVITY_READINESS_CONSTANTS.historyDays &&
        Number.isFinite(observation.value),
    );
  const metricSignals: Array<{ signal: number; sources: ReadinessContextObservation[] }> = [];
  for (const metric of [
    "hrv_rmssd",
    "sleep_hours",
    "stress_score",
    "soreness_level",
    "wellness_score",
  ] as const) {
    const observations = contextEligible.filter(({ observation }) => observation.metric === metric);
    const current = observations.filter(
      ({ ageDays }) => ageDays <= ACTIVITY_READINESS_CONSTANTS.currentWellnessDays,
    );
    const baseline = observations.filter(
      ({ ageDays }) => ageDays > ACTIVITY_READINESS_CONSTANTS.currentWellnessDays,
    );
    if (
      current.length === 0 ||
      baseline.length < ACTIVITY_READINESS_CONSTANTS.minimumWellnessBaselineObservations
    )
      continue;
    const values = robustValues(baseline.map(({ observation }) => observation.value));
    const center = median(values);
    const scale =
      median(values.map((value) => Math.abs(value - center))) * 1.4826 ||
      Math.abs(center) * 0.1 ||
      1;
    const direction = metric === "stress_score" || metric === "soreness_level" ? -1 : 1;
    metricSignals.push({
      signal: Math.max(
        -1,
        Math.min(
          1,
          (direction *
            (mean(robustValues(current.map(({ observation }) => observation.value))) - center)) /
            (3 * scale),
        ),
      ),
      sources: [...current, ...baseline].map(({ observation }) => observation),
    });
  }
  const readinessSources = metricSignals.flatMap(({ sources }) => sources);
  const readinessContext =
    metricSignals.length === 0
      ? unavailable(
          "readiness_context_baseline_insufficient",
          contextEligible.map(({ observation }) => observation),
          contextRejections,
        )
      : estimate(
          mean(metricSignals.map(({ signal }) => signal)),
          "bounded_baseline_deviation",
          "wellness_context_only_no_medical_inference",
          readinessSources,
          1 / Math.sqrt(readinessSources.length + 1),
        );

  return {
    policyVersion: ACTIVITY_READINESS_POLICY_VERSION,
    endurance,
    durability,
    sportSpecificity,
    volumeTrend,
    frequencyTrend,
    readinessContext,
    rejectedEvidence: uniqueRejections([...activityRejections, ...contextRejections]),
  };
}
