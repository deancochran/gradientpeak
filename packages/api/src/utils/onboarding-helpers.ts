/**
 * Onboarding Helper Functions
 *
 * Reusable utilities for the onboarding flow to reduce code duplication
 * and improve maintainability. Provides abstraction layer for:
 * - Batch inserting profile metrics
 * - Batch inserting activity efforts
 * - Deriving efforts for different sports
 * - Preparing metrics by merging user input with baseline
 */

import { randomUUID } from "node:crypto";
import {
  type DerivedEffort,
  derivePowerCurveFromFTP,
  deriveSpeedCurveFromThresholdPace,
  deriveSwimPaceCurveFromCSS,
} from "@repo/core/calculations";
import type {
  OnboardingBaselineFieldSource,
  OnboardingBaselineFieldSources,
} from "@repo/core/schemas/onboarding";
import {
  type ActivityEffortInsert,
  activityEfforts,
  type ProfileMetricInsert,
  type PublicActivityCategory,
  type PublicEffortType,
  type PublicProfileMetricType,
  profileMetrics,
} from "@repo/db";
import type { getRequiredDb } from "../db";

interface BaselineProfile {
  max_hr: number;
  resting_hr: number;
  lthr: number;
  vo2_max: number;
  ftp?: number;
  threshold_pace_seconds_per_km?: number;
  css_seconds_per_hundred_meters?: number;
  confidence: "high" | "medium" | "low";
  source: string;
}

type ProfileMetricType = PublicProfileMetricType;
type ActivityCategory = PublicActivityCategory;
type EffortType = PublicEffortType;
type OnboardingTransaction = Parameters<
  Parameters<ReturnType<typeof getRequiredDb>["transaction"]>[0]
>[0];
type OnboardingWriteClient = ReturnType<typeof getRequiredDb> | OnboardingTransaction;
type OnboardingMetricSourceField = Exclude<keyof OnboardingBaselineFieldSources, "dob" | "gender">;

type PrepareProfileMetricsOptions = {
  fieldSources?: OnboardingBaselineFieldSources;
  preserveImportedFields?: ReadonlySet<OnboardingMetricSourceField>;
  importedProvenance?: Partial<Record<OnboardingMetricSourceField, Record<string, unknown>>>;
};

/**
 * Batch insert profile metrics with consistent formatting.
 *
 * Handles formatting of timestamps and profile_id for all metrics,
 * reducing duplication in the main onboarding procedure.
 *
 * @param db - Drizzle database client
 * @param profileId - User's profile ID
 * @param metrics - Array of metrics to insert
 * @returns Insert result
 */
export async function batchInsertProfileMetrics(
  tx: OnboardingWriteClient,
  profileId: string,
  metrics: Array<{
    metric_type: ProfileMetricType;
    value: number;
    unit: string;
    source?: string;
    observationSource: NonNullable<ProfileMetricInsert["source"]>;
    method: string;
    calculationVersion: string;
    provenance: Record<string, unknown>;
  }>,
) {
  if (metrics.length === 0) {
    return;
  }

  const metricsToInsert = metrics.map((m) => ({
    id: randomUUID(),
    created_at: new Date(),
    profile_id: profileId,
    metric_type: m.metric_type,
    value: m.value,
    unit: m.unit,
    recorded_at: new Date(),
    notes: m.source ? `Generated from ${m.source}` : null,
    source: m.observationSource,
    method: m.method,
    calculation_version: m.calculationVersion,
    provenance: m.provenance,
  })) satisfies ProfileMetricInsert[];

  await tx.insert(profileMetrics).values(metricsToInsert);
}

/**
 * Batch insert activity efforts with consistent formatting.
 *
 * Handles formatting of timestamps, profile_id, and activity_id for all efforts,
 * reducing duplication across different sports.
 *
 * @param db - Drizzle database client
 * @param profileId - User's profile ID
 * @param efforts - Array of derived efforts to insert
 * @param seedSource - Source of the modeled seed (e.g., 'onboarding', 'baseline_beginner')
 * @returns Insert result
 */
export async function batchInsertActivityEfforts(
  tx: OnboardingWriteClient,
  profileId: string,
  efforts: DerivedEffort[],
  seedSource: string = "onboarding",
) {
  if (efforts.length === 0) {
    return;
  }

  const effortsToInsert = efforts.map((e) => ({
    id: randomUUID(),
    created_at: new Date(),
    profile_id: profileId,
    activity_id: null,
    activity_category: e.activity_category as ActivityCategory,
    duration_seconds: e.duration_seconds,
    effort_type: e.effort_type as EffortType,
    value: e.value,
    unit: e.unit,
    recorded_at: new Date(),
    start_offset: null,
    source: "derived",
    method: "onboarding_modeled_curve",
    calculation_version: "onboarding-effort-curve-v1",
    provenance: { seed_source: seedSource },
  })) satisfies ActivityEffortInsert[];

  await tx.insert(activityEfforts).values(effortsToInsert);
}

/**
 * Derive efforts for a specific sport from a single metric.
 *
 * Provides unified interface for deriving efforts across all sports,
 * reducing switch statements in the main procedure.
 *
 * @param sport - Sport type ('cycling', 'running', 'swimming')
 * @param metric - Performance metric value (FTP, threshold pace, or CSS)
 * @returns Array of derived efforts for standard durations
 *
 * @example
 * const cyclingEfforts = deriveEffortsForSport('cycling', 250); // FTP = 250W
 * const runningEfforts = deriveEffortsForSport('running', 315); // 5:15/km
 * const swimmingEfforts = deriveEffortsForSport('swimming', 90); // 1:30/100m
 */
export function deriveEffortsForSport(
  sport: "cycling" | "running" | "swimming",
  metric: number,
): DerivedEffort[] {
  switch (sport) {
    case "cycling":
      return derivePowerCurveFromFTP(metric);
    case "running":
      return deriveSpeedCurveFromThresholdPace(metric);
    case "swimming":
      return deriveSwimPaceCurveFromCSS(metric);
  }
}

/**
 * Prepare profile metrics by merging user input with baseline.
 *
 * Combines user-provided values with baseline defaults, prioritizing
 * user input and calculating derived metrics (VO2max, LTHR).
 *
 * @param input - User input from onboarding form
 * @param baseline - Baseline profile (may be null for advanced/skip)
 * @returns Array of formatted metrics ready for insertion
 */
export function prepareProfileMetrics(
  input: {
    weight_kg?: number;
    max_hr?: number;
    resting_hr?: number;
    lthr?: number;
    vo2max?: number;
    ftp?: number;
    threshold_pace_seconds_per_km?: number;
    css_seconds_per_hundred_meters?: number;
  },
  baseline: BaselineProfile | null,
  options: PrepareProfileMetricsOptions = {},
): Array<{
  metric_type: ProfileMetricType;
  value: number;
  unit: string;
  source?: string;
  observationSource: NonNullable<ProfileMetricInsert["source"]>;
  method: string;
  calculationVersion: string;
  provenance: Record<string, unknown>;
}> {
  const metrics: Array<{
    metric_type: ProfileMetricType;
    value: number;
    unit: string;
    source?: string;
    observationSource: NonNullable<ProfileMetricInsert["source"]>;
    method: string;
    calculationVersion: string;
    provenance: Record<string, unknown>;
  }> = [];

  const sourceFor = (
    field: OnboardingMetricSourceField,
    hasSubmittedValue: boolean,
  ): Exclude<OnboardingBaselineFieldSource, "cleared"> | "baseline" | null => {
    const explicitSource = options.fieldSources?.[field];
    if (explicitSource === "cleared") return null;
    if (hasSubmittedValue) return explicitSource ?? "manual";
    return "baseline";
  };
  const observationFor = (
    field: OnboardingMetricSourceField,
    source: Exclude<ReturnType<typeof sourceFor>, null>,
    baselineSource?: string,
  ) => {
    if (source === "baseline") {
      return {
        observationSource: "estimated" as const,
        method: "onboarding_baseline_seed",
        provenance: {
          input: "onboarding",
          seed_type: "baseline",
          baseline_source: baselineSource,
        },
      };
    }
    return {
      observationSource: source,
      method: `onboarding_${source}_seed`,
      provenance: {
        input: "onboarding",
        seed_type: source,
        ...(source === "imported" ? options.importedProvenance?.[field] : undefined),
      },
    };
  };
  const shouldPreserveImported = (field: OnboardingMetricSourceField) =>
    options.preserveImportedFields?.has(field) ?? false;

  // Weight (if provided)
  const weightSource = sourceFor("weight_kg", input.weight_kg !== undefined);
  if (input.weight_kg && weightSource && !shouldPreserveImported("weight_kg")) {
    const observation = observationFor("weight_kg", weightSource);
    metrics.push({
      metric_type: "weight_kg",
      value: input.weight_kg,
      unit: "kg",
      observationSource: observation.observationSource,
      method: observation.method,
      calculationVersion: "onboarding-v1",
      provenance: observation.provenance,
    });
  }

  // Merge HR and FTP metrics with baseline
  const ftpSource = sourceFor("ftp", input.ftp !== undefined);
  const maxHrSource = sourceFor("max_hr", input.max_hr !== undefined);
  const restingHrSource = sourceFor("resting_hr", input.resting_hr !== undefined);
  const ftp = ftpSource ? (input.ftp ?? baseline?.ftp) : undefined;
  const maxHR = maxHrSource ? (input.max_hr ?? baseline?.max_hr) : undefined;
  const restingHR = restingHrSource ? (input.resting_hr ?? baseline?.resting_hr) : undefined;

  if (maxHR && maxHrSource && !shouldPreserveImported("max_hr")) {
    const observation = observationFor("max_hr", maxHrSource, baseline?.source);
    metrics.push({
      metric_type: "max_hr",
      value: maxHR,
      unit: "bpm",
      source: maxHrSource === "baseline" ? baseline?.source : undefined,
      observationSource: observation.observationSource,
      method: observation.method,
      calculationVersion: "onboarding-v1",
      provenance: observation.provenance,
    });
  }

  if (restingHR && restingHrSource && !shouldPreserveImported("resting_hr")) {
    const observation = observationFor("resting_hr", restingHrSource, baseline?.source);
    metrics.push({
      metric_type: "resting_hr",
      value: restingHR,
      unit: "bpm",
      source: restingHrSource === "baseline" ? baseline?.source : undefined,
      observationSource: observation.observationSource,
      method: observation.method,
      calculationVersion: "onboarding-v1",
      provenance: observation.provenance,
    });
  }

  if (ftp && ftpSource && !shouldPreserveImported("ftp")) {
    const observation = observationFor("ftp", ftpSource, baseline?.source);
    metrics.push({
      metric_type: "ftp",
      value: ftp,
      unit: "W",
      source: ftpSource === "baseline" ? baseline?.source : undefined,
      observationSource: observation.observationSource,
      method: observation.method,
      calculationVersion: "onboarding-v1",
      provenance: observation.provenance,
    });
  }

  const thresholdPaceSource = sourceFor(
    "threshold_pace_seconds_per_km",
    input.threshold_pace_seconds_per_km !== undefined,
  );
  if (
    input.threshold_pace_seconds_per_km &&
    thresholdPaceSource &&
    !shouldPreserveImported("threshold_pace_seconds_per_km")
  ) {
    const observation = observationFor("threshold_pace_seconds_per_km", thresholdPaceSource);
    metrics.push({
      metric_type: "threshold_pace_seconds_per_km",
      value: input.threshold_pace_seconds_per_km,
      unit: "seconds_per_km",
      observationSource: observation.observationSource,
      method: observation.method,
      calculationVersion: "onboarding-v1",
      provenance: observation.provenance,
    });
  }

  const cssSource = sourceFor(
    "css_seconds_per_hundred_meters",
    input.css_seconds_per_hundred_meters !== undefined,
  );
  if (
    input.css_seconds_per_hundred_meters &&
    cssSource &&
    !shouldPreserveImported("css_seconds_per_hundred_meters")
  ) {
    const observation = observationFor("css_seconds_per_hundred_meters", cssSource);
    metrics.push({
      metric_type: "css_seconds_per_100m",
      value: input.css_seconds_per_hundred_meters,
      unit: "seconds_per_100m",
      observationSource: observation.observationSource,
      method: observation.method,
      calculationVersion: "onboarding-v1",
      provenance: observation.provenance,
    });
  }

  // VO2max (calculated or from baseline)
  const vo2max = input.vo2max ?? baseline?.vo2_max;
  if (vo2max) {
    metrics.push({
      metric_type: "vo2_max",
      value: vo2max,
      unit: "ml/kg/min",
      source: input.vo2max ? undefined : "calculated_from_hr",
      observationSource: input.vo2max ? "manual" : "estimated",
      method: input.vo2max ? "onboarding_manual_seed" : "onboarding_derived_estimate",
      calculationVersion: "onboarding-v1",
      provenance: {
        input: "onboarding",
        seed_type: input.vo2max ? "manual" : "estimated",
      },
    });
  }

  // LTHR (estimated or from baseline)
  const lthr = input.lthr ?? baseline?.lthr;
  if (lthr) {
    metrics.push({
      metric_type: "lthr",
      value: lthr,
      unit: "bpm",
      source: input.lthr ? undefined : "estimated",
      observationSource: input.lthr ? "manual" : "estimated",
      method: input.lthr ? "onboarding_manual_seed" : "onboarding_baseline_seed",
      calculationVersion: "onboarding-v1",
      provenance: {
        input: "onboarding",
        seed_type: input.lthr ? "manual" : "baseline",
        baseline_source: input.lthr ? undefined : baseline?.source,
      },
    });
  }

  return metrics;
}
