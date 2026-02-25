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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@repo/supabase";

// These specific calculation modules are new and might not be in the main exports yet
// Import them directly from their source files until they're properly exported
const derivePowerCurveFromFTP = (ftp: number): DerivedEffort[] => {
  // We'll implement inline to avoid import issues
  const durations = [5, 10, 30, 60, 180, 300, 600, 1200, 1800, 3600];
  const wPrime = 20000;
  return durations.map((duration) => ({
    duration_seconds: duration,
    effort_type: "power" as const,
    value: Math.round(ftp + wPrime / duration),
    unit: "watts",
    activity_category: "bike" as const,
  }));
};

const deriveSpeedCurveFromThresholdPace = (
  thresholdPaceSecondsPerKm: number,
): DerivedEffort[] => {
  const durations = [5, 10, 30, 60, 180, 300, 600, 1200, 1800, 3600];
  const thresholdSpeedMps = 1000 / thresholdPaceSecondsPerKm;

  return durations.map((duration) => {
    let multiplier: number;
    if (duration < 60)
      multiplier = 1.15; // Sprint
    else if (duration < 300)
      multiplier = 1.08; // VO2max
    else if (duration < 1200)
      multiplier = 1.0; // Threshold
    else multiplier = 0.92; // Tempo

    return {
      duration_seconds: duration,
      effort_type: "speed" as const,
      value: Math.round(thresholdSpeedMps * multiplier * 100) / 100,
      unit: "meters_per_second",
      activity_category: "run" as const,
    };
  });
};

const deriveSwimPaceCurveFromCSS = (
  cssSecondsPerHundredMeters: number,
): DerivedEffort[] => {
  const durations = [10, 20, 30, 60, 120, 180, 300, 600, 900, 1800];
  const cssSpeedMps = 100 / cssSecondsPerHundredMeters;

  return durations.map((duration) => {
    let multiplier: number;
    if (duration < 60)
      multiplier = 1.1; // Sprint
    else if (duration < 180)
      multiplier = 1.06; // Middle
    else if (duration < 600)
      multiplier = 1.0; // CSS
    else multiplier = 0.93; // Distance

    return {
      duration_seconds: duration,
      effort_type: "speed" as const,
      value: Math.round(cssSpeedMps * multiplier * 100) / 100,
      unit: "meters_per_second",
      activity_category: "swim" as const,
    };
  });
};

// Define types locally since they aren't exported at top level yet
interface DerivedEffort {
  duration_seconds: number;
  effort_type: "power" | "speed";
  value: number;
  unit: string;
  activity_category: "bike" | "run" | "swim";
}

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

type ProfileMetricType = Database["public"]["Enums"]["profile_metric_type"];
type ActivityCategory = Database["public"]["Enums"]["activity_category"];
type EffortType = Database["public"]["Enums"]["effort_type"];

/**
 * Batch insert profile metrics with consistent formatting.
 *
 * Handles formatting of timestamps and profile_id for all metrics,
 * reducing duplication in the main onboarding procedure.
 *
 * @param supabase - Supabase client
 * @param profileId - User's profile ID
 * @param metrics - Array of metrics to insert
 * @returns Insert result
 */
export async function batchInsertProfileMetrics(
  supabase: SupabaseClient<Database>,
  profileId: string,
  metrics: Array<{
    metric_type: ProfileMetricType;
    value: number;
    unit: string;
    source?: string;
  }>,
) {
  if (metrics.length === 0) {
    return { data: [], error: null };
  }

  const metricsToInsert = metrics.map((m) => ({
    profile_id: profileId,
    metric_type: m.metric_type,
    value: m.value,
    unit: m.unit,
    recorded_at: new Date().toISOString(),
    notes: m.source ? `Generated from ${m.source}` : null,
  }));

  return supabase.from("profile_metrics").insert(metricsToInsert);
}

/**
 * Batch insert activity efforts with consistent formatting.
 *
 * Handles formatting of timestamps, profile_id, and activity_id for all efforts,
 * reducing duplication across different sports.
 *
 * @param supabase - Supabase client
 * @param profileId - User's profile ID
 * @param efforts - Array of derived efforts to insert
 * @param source - Source of the efforts (e.g., 'onboarding', 'baseline_beginner')
 * @returns Insert result
 */
export async function batchInsertActivityEfforts(
  supabase: SupabaseClient<Database>,
  profileId: string,
  efforts: DerivedEffort[],
  source: string = "onboarding",
) {
  if (efforts.length === 0) {
    return { data: [], error: null };
  }

  // Generate UUIDs for efforts since activity_id is required but we don't have an activity
  const effortsToInsert = efforts.map((e) => ({
    profile_id: profileId,
    activity_id: null, // Manual entries have no associated activity
    activity_category: e.activity_category as ActivityCategory,
    duration_seconds: e.duration_seconds,
    effort_type: e.effort_type as EffortType,
    value: e.value,
    unit: e.unit,
    recorded_at: new Date().toISOString(),
    start_offset: null,
    // source: source, // Uncomment if source column exists
  }));

  return supabase.from("activity_efforts").insert(effortsToInsert);
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
  },
  baseline: BaselineProfile | null,
): Array<{
  metric_type: ProfileMetricType;
  value: number;
  unit: string;
  source?: string;
}> {
  const metrics: Array<{
    metric_type: ProfileMetricType;
    value: number;
    unit: string;
    source?: string;
  }> = [];

  // Weight (if provided)
  if (input.weight_kg) {
    metrics.push({
      metric_type: "weight_kg",
      value: input.weight_kg,
      unit: "kg",
    });
  }

  // Merge HR metrics with baseline
  const maxHR = input.max_hr ?? baseline?.max_hr;
  const restingHR = input.resting_hr ?? baseline?.resting_hr;

  if (maxHR) {
    metrics.push({
      metric_type: "max_hr",
      value: maxHR,
      unit: "bpm",
      source: input.max_hr ? undefined : baseline?.source,
    });
  }

  if (restingHR) {
    metrics.push({
      metric_type: "resting_hr",
      value: restingHR,
      unit: "bpm",
      source: input.resting_hr ? undefined : baseline?.source,
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
    });
  }

  return metrics;
}
