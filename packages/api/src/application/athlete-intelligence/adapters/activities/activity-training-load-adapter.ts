import {
  analyzeActivityDerivedMetrics,
  type LoadSeriesIdentity,
  loadSeriesIdentityForActivityTss,
} from "@repo/core";
import { resolveActivityContextFromEvidence } from "../../../../lib/activity-analysis";
import type {
  ActivityAnalysisContextSnapshot,
  ActivityAnalysisMetricSnapshot,
} from "../../../../repositories";
import { normalizeSport } from "../../evidence-adapters";

type MetricRow = {
  id: string;
  type: string;
  value: number;
  unit: string;
  recordedAt: Date;
  source?: "manual" | "test" | "imported" | "provider" | "estimated" | "derived" | null;
  method?: string | null;
  provenance?: unknown;
  referenceActivityId: string | null;
  referenceActivityType?: string | null;
};

type EffortRow = {
  id: string;
  activityId: string | null;
  sport: string;
  kind: "power" | "speed";
  durationSeconds: number;
  unit: string;
  value: number;
  recordedAt: Date;
  source?: string | null;
  method?: string | null;
  provenance?: unknown;
};

type ActivityRow = {
  id: string;
  type: string;
  startedAt: Date;
  finishedAt: Date;
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  averageHeartRate: number | null;
  maximumHeartRate: number | null;
  averagePower: number | null;
  maximumPower: number | null;
  averageSpeed: number | null;
  maximumSpeed: number | null;
  normalizedPower: number | null;
};

export type AdaptedActivityTrainingLoad = {
  value: number;
  identity: LoadSeriesIdentity;
};

/** Derives bounded activity load from the same already-read evidence used by the model reader. */
export function adaptActivityTrainingLoads(input: {
  profileDob: Date | null;
  activities: ActivityRow[];
  metrics: MetricRow[];
  efforts: EffortRow[];
}): Map<string, AdaptedActivityTrainingLoad> {
  const evidence: ActivityAnalysisContextSnapshot = {
    profile: { dob: input.profileDob, gender: null },
    profileMetrics: input.metrics.map((metric) => ({
      id: metric.id,
      metric_type: metric.type as ActivityAnalysisMetricSnapshot["metric_type"],
      value: metric.value,
      unit: metric.unit,
      recorded_at: metric.recordedAt,
      source: metric.source,
      method: metric.method,
      provenance: metric.provenance,
      reference_activity_id: metric.referenceActivityId,
      reference_activity_category: metric.referenceActivityType ?? null,
    })),
    recentEfforts: input.efforts.map((effort) => ({
      id: effort.id,
      activity_id: effort.activityId,
      activity_category: normalizeSport(effort.sport),
      effort_type: effort.kind,
      duration_seconds: effort.durationSeconds,
      recorded_at: effort.recordedAt,
      unit: effort.unit,
      value: effort.value,
      source: effort.source,
      method: effort.method,
      provenance: effort.provenance,
    })),
  };
  const result = new Map<string, AdaptedActivityTrainingLoad>();

  for (const activity of input.activities) {
    const sport = normalizeSport(activity.type);
    const context = resolveActivityContextFromEvidence({
      activityTimestamp: activity.startedAt,
      activityId: activity.id,
      evidence,
    });
    const derived = analyzeActivityDerivedMetrics({
      activity: {
        id: activity.id,
        type: sport,
        started_at: activity.startedAt.toISOString(),
        finished_at: activity.finishedAt.toISOString(),
        duration_seconds: activity.durationSeconds,
        moving_seconds: activity.movingSeconds,
        distance_meters: activity.distanceMeters,
        avg_heart_rate: activity.averageHeartRate,
        max_heart_rate: activity.maximumHeartRate,
        avg_power: activity.averagePower,
        max_power: activity.maximumPower,
        avg_speed_mps: activity.averageSpeed,
        max_speed_mps: activity.maximumSpeed,
        normalized_power: activity.normalizedPower,
        normalized_speed_mps: null,
        normalized_graded_speed_mps: null,
      },
      context,
    });
    const identity = derived.stress.tss_identity;
    const value = derived.stress.tss;
    if (
      value === null ||
      identity === null ||
      derived.stress.method === null ||
      identity.method !== derived.stress.method ||
      identity.sport !== sport
    ) {
      continue;
    }
    result.set(activity.id, {
      value,
      identity: loadSeriesIdentityForActivityTss(identity),
    });
  }

  return result;
}
