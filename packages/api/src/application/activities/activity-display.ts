import {
  ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES,
  type ActivityCardEffortProfile,
  type ActivityCardEffortSample,
  type ActivityDetailDisplay,
  type ActivityDisplayModel,
  activityCardEffortLevelChartValue,
  activityCardEffortProfileSchema,
  activityCardEffortSampleSchema,
  activityDetailDisplaySchema,
  activityDisplayModelSchema,
  activityObservationQuantificationBundleSchema,
  createSemanticMetric,
  getNormalizedIntensity,
  type SemanticMetric,
} from "@repo/core";
import { z } from "zod";

type ActivityDetailSegmentSource = {
  id: string;
  ordinal: number;
  role: "activity" | "transition" | "rest" | "unknown";
  activity_category: ActivityDisplayModel["activityComposition"]["categories"][number] | null;
  timing_coverage: "complete" | "partial" | "unavailable";
  status: "processing" | "available" | "failed";
  summary: unknown;
  reason?: string;
};

type ActivityDetailSource = {
  timing_coverage: "complete" | "partial" | "unavailable";
  elapsed_ms: number;
  active_ms: number | null;
  moving_ms: number | null;
  distance_meters: number;
  elevation_gain_meters: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_power: number | null;
  max_power: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  pool_length_meters: number | null;
  total_strokes: number | null;
  avg_swolf: number | null;
  polyline: string | null;
  laps: unknown[];
  segments: ActivityDetailSegmentSource[];
  activity_plans: { id: string; name: string } | null;
  current_artifact: {
    id: string;
    format: string;
    original_name: string | null;
    availability: "accepted";
  } | null;
  ingestion?: { status?: string | null; failure_code?: string | null } | null;
  effective_session_rpe: {
    id: string;
    rpe: number;
    scale: "borg_cr10";
    scale_version: "1";
    source: "user" | "provider" | "manual";
    recorded_at: Date | string;
    corrected_at: Date | string | null;
  } | null;
};

type ActivityDisplaySource = {
  id: string;
  name?: string | null;
  profile_id: string;
  started_at: Date | string;
  finished_at?: Date | string | null;
  activity_kind?: "single" | "multisport" | "unknown";
  activity_categories?: string[];
  type?: string | null;
  notes?: string | null;
  distance_meters?: number | null;
  elapsed_ms?: number | null;
  elapsed_seconds?: number | null;
  active_ms?: number | null;
  duration_seconds?: number | null;
  moving_ms?: number | null;
  moving_seconds?: number | null;
  timing_coverage?: "complete" | "partial" | "unavailable";
  elevation_gain_meters?: number | null;
  avg_heart_rate?: number | null;
  avg_power?: number | null;
  calories?: number | null;
  polyline?: string | null;
  content_visibility: "private" | "followers" | "public";
  likes_count?: number | null;
  comments_count?: number | null;
  has_liked?: boolean | null;
  profile?: { username?: string | null; avatar_url?: string | null } | null;
  derived?: { observationQuantification?: unknown } | null;
  /** Explicit threshold-free ordinal samples only. Scalar summary intensity is not a source. */
  effort_profile?: readonly ActivityCardEffortSample[] | null;
};

const activityCardEffortSourceMaximumSamples = 100_000;
const activityCardEffortSourceSchema = z
  .array(activityCardEffortSampleSchema)
  .min(2)
  .max(activityCardEffortSourceMaximumSamples)
  .superRefine((samples, context) => {
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (previous && current && current.elapsedSeconds <= previous.elapsedSeconds) {
        context.addIssue({
          code: "custom",
          path: [index, "elapsedSeconds"],
          message: "Elapsed time must be strictly increasing",
        });
      }
    }
  });

/**
 * Bounds a threshold-free ordinal series for card transport while retaining each
 * time bucket's lowest/highest shape. Numeric measurements are never accepted.
 */
export function toActivityCardEffortProfile(
  samples: readonly ActivityCardEffortSample[] | null | undefined,
): ActivityCardEffortProfile | null {
  const source = activityCardEffortSourceSchema.safeParse(samples);
  if (!source.success) return null;
  if (source.data.length <= ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES) {
    return activityCardEffortProfileSchema.parse({
      basis: "activity_wide_signal_ordinal",
      samples: source.data,
    });
  }

  const interiorLength = source.data.length - 2;
  const bucketCount = Math.floor((ACTIVITY_CARD_EFFORT_PROFILE_MAX_SAMPLES - 2) / 2);
  const first = source.data[0];
  if (!first) return null;
  const selected: ActivityCardEffortSample[] = [first];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor((bucket * interiorLength) / bucketCount);
    const end = 1 + Math.floor(((bucket + 1) * interiorLength) / bucketCount);
    let minimumIndex = start;
    let maximumIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      const sample = source.data[index];
      const minimum = source.data[minimumIndex];
      const maximum = source.data[maximumIndex];
      if (
        sample &&
        minimum &&
        activityCardEffortLevelChartValue(sample.effortLevel) <
          activityCardEffortLevelChartValue(minimum.effortLevel)
      ) {
        minimumIndex = index;
      }
      if (
        sample &&
        maximum &&
        activityCardEffortLevelChartValue(sample.effortLevel) >
          activityCardEffortLevelChartValue(maximum.effortLevel)
      ) {
        maximumIndex = index;
      }
    }
    for (const index of [minimumIndex, maximumIndex].sort((left, right) => left - right)) {
      const sample = source.data[index];
      if (sample && selected.at(-1)?.elapsedSeconds !== sample.elapsedSeconds) {
        selected.push(sample);
      }
    }
  }
  const last = source.data.at(-1);
  if (last) selected.push(last);
  return activityCardEffortProfileSchema.parse({
    basis: "activity_wide_signal_ordinal",
    samples: selected,
  });
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function availableMetric(
  key: SemanticMetric["key"],
  label: string,
  value: number | null | undefined,
  unit: string,
  partial = false,
): SemanticMetric | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return partial
    ? { key, label, status: "partial", value, unit, reason: "source_coverage_partial" }
    : { key, label, status: "available", value, unit, reason: null };
}

function quantificationMetrics(value: unknown): SemanticMetric[] {
  const parsed = activityObservationQuantificationBundleSchema.safeParse(value);
  if (!parsed.success) {
    return [
      {
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason: "quantification_unavailable",
      },
      {
        key: "normalized_intensity",
        label: "Intensity",
        status: "unavailable",
        value: null,
        unit: "ratio",
        reason: "quantification_unavailable",
      },
    ];
  }
  const commonLoad = parsed.data.summary.commonLoad;
  if (commonLoad.status === "unavailable" || commonLoad.load === null) {
    const reason = "reason" in commonLoad ? commonLoad.reason : "quantification_unavailable";
    return [
      {
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason,
      },
      {
        key: "normalized_intensity",
        label: "Intensity",
        status: "unavailable",
        value: null,
        unit: "ratio",
        reason,
      },
    ];
  }
  const status = commonLoad.status === "partial" ? "partial" : "available";
  const reason = status === "partial" ? "quantification_partial" : null;
  const normalizedIntensity = getNormalizedIntensity(commonLoad);
  return [
    createSemanticMetric({
      key: "common_load",
      label: "Load",
      status,
      value: commonLoad.load,
      unit: "score",
      reason,
    }),
    normalizedIntensity === null
      ? createSemanticMetric({
          key: "normalized_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          unit: "ratio",
          reason: reason ?? "quantification_unavailable",
        })
      : createSemanticMetric({
          key: "normalized_intensity",
          label: "Intensity",
          status,
          value: normalizedIntensity,
          unit: "ratio",
          reason,
        }),
  ];
}

export function toActivityDisplayModel(input: {
  activity: ActivityDisplaySource;
  viewerId: string;
}): ActivityDisplayModel {
  const activity = input.activity;
  const isOwner = activity.profile_id === input.viewerId;
  const partialTiming = activity.timing_coverage === "partial";
  const elapsedSeconds =
    activity.elapsed_seconds ??
    (typeof activity.elapsed_ms === "number" ? activity.elapsed_ms / 1_000 : null);
  const activeSeconds =
    activity.duration_seconds ??
    (typeof activity.active_ms === "number" ? activity.active_ms / 1_000 : null);
  const movingSeconds =
    activity.moving_seconds ??
    (typeof activity.moving_ms === "number" ? activity.moving_ms / 1_000 : null);
  const categories = activity.activity_categories ?? (activity.type ? [activity.type] : []);
  const avatarUrl = z.string().url().safeParse(activity.profile?.avatar_url);
  const effortProfile = toActivityCardEffortProfile(activity.effort_profile);
  const metrics = [
    ...quantificationMetrics(activity.derived?.observationQuantification),
    availableMetric("distance", "Distance", activity.distance_meters, "meters"),
    availableMetric("elapsed_duration", "Elapsed", elapsedSeconds, "seconds"),
    availableMetric("active_duration", "Active", activeSeconds, "seconds", partialTiming),
    availableMetric("moving_duration", "Moving", movingSeconds, "seconds", partialTiming),
    availableMetric("elevation_gain", "Elevation gain", activity.elevation_gain_meters, "meters"),
    availableMetric("average_heart_rate", "Average heart rate", activity.avg_heart_rate, "bpm"),
    availableMetric("average_power", "Average power", activity.avg_power, "watts"),
    availableMetric("calories", "Calories", activity.calories, "kilocalories"),
  ].filter((metric): metric is SemanticMetric => metric !== null);

  return activityDisplayModelSchema.parse({
    contractVersion: "activity-display-v1",
    id: activity.id,
    href: `/activities/${activity.id}`,
    owner: {
      id: activity.profile_id,
      username: activity.profile?.username ?? null,
      avatarUrl: avatarUrl.success ? avatarUrl.data : null,
    },
    time: { startedAt: toIso(activity.started_at), finishedAt: toIso(activity.finished_at) },
    activityComposition: {
      kind:
        activity.activity_kind ??
        (categories.length === 1 ? "single" : categories.length > 1 ? "multisport" : "unknown"),
      categories,
    },
    title: activity.name?.trim() || "Activity",
    notes: activity.notes ?? null,
    metrics,
    ...(effortProfile === null ? {} : { effortProfile }),
    visibility: activity.content_visibility,
    engagement: {
      likes: activity.likes_count ?? 0,
      comments: activity.comments_count ?? 0,
      viewerHasLiked: activity.has_liked ?? false,
    },
    capabilities: {
      canLike: true,
      canComment: true,
      canShare: activity.content_visibility === "public",
      canEdit: isOwner,
      canDelete: isOwner,
      hasRoute: Boolean(activity.polyline),
    },
  });
}

export function toActivityDetailDisplay(input: {
  display: ActivityDisplayModel;
  activity: ActivityDetailSource;
}): ActivityDetailDisplay {
  const { activity } = input;
  return activityDetailDisplaySchema.parse({
    contractVersion: "activity-detail-display-v1",
    summary: input.display,
    performance: {
      timingCoverage: activity.timing_coverage,
      elapsedSeconds: activity.elapsed_ms / 1_000,
      activeSeconds: activity.active_ms === null ? null : activity.active_ms / 1_000,
      movingSeconds: activity.moving_ms === null ? null : activity.moving_ms / 1_000,
      distanceMeters: activity.distance_meters,
      elevationGainMeters: activity.elevation_gain_meters,
      calories: activity.calories,
      averageHeartRate: activity.avg_heart_rate,
      maximumHeartRate: activity.max_heart_rate,
      averagePower: activity.avg_power,
      maximumPower: activity.max_power,
      averageSpeedMetersPerSecond: activity.avg_speed_mps,
      maximumSpeedMetersPerSecond: activity.max_speed_mps,
      poolLengthMeters: activity.pool_length_meters,
      totalStrokes: activity.total_strokes,
      averageSwolf: activity.avg_swolf,
    },
    routePolyline: activity.polyline,
    laps: activity.laps,
    segments: activity.segments.map((segment) => ({
      id: segment.id,
      ordinal: segment.ordinal,
      role: segment.role,
      activityCategory: segment.activity_category,
      timingCoverage: segment.timing_coverage,
      status: segment.status,
      summary: segment.summary,
      ...(segment.reason === undefined ? {} : { reason: segment.reason }),
    })),
    linkedPlan: activity.activity_plans
      ? { id: activity.activity_plans.id, name: activity.activity_plans.name }
      : null,
    currentArtifact: activity.current_artifact
      ? {
          id: activity.current_artifact.id,
          format: activity.current_artifact.format,
          originalName: activity.current_artifact.original_name,
          availability: activity.current_artifact.availability,
        }
      : null,
    ingestion: activity.ingestion?.status
      ? {
          status: activity.ingestion.status,
          lastErrorMessage: activity.ingestion.failure_code
            ? "Activity file processing did not complete"
            : null,
        }
      : null,
    effectiveSessionRpe: activity.effective_session_rpe
      ? {
          id: activity.effective_session_rpe.id,
          rpe: activity.effective_session_rpe.rpe,
          scale: activity.effective_session_rpe.scale,
          scaleVersion: activity.effective_session_rpe.scale_version,
          source: activity.effective_session_rpe.source,
          recordedAt: toIso(activity.effective_session_rpe.recorded_at),
          correctedAt: toIso(activity.effective_session_rpe.corrected_at),
        }
      : null,
  });
}
