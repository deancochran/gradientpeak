import {
  type ActivityDetailDisplay,
  type ActivityDisplayModel,
  activityDetailDisplaySchema,
  activityDisplayModelSchema,
  activityObservationQuantificationBundleSchema,
  createSemanticMetric,
  getNormalizedIntensity,
  type SemanticMetric,
} from "@repo/core";

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
};

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
  if (commonLoad.status === "unavailable") {
    return [
      {
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason: commonLoad.reason,
      },
      {
        key: "normalized_intensity",
        label: "Intensity",
        status: "unavailable",
        value: null,
        unit: "ratio",
        reason: commonLoad.reason,
      },
    ];
  }
  const status = commonLoad.status === "partial" ? "partial" : "available";
  const reason = status === "partial" ? "quantification_partial" : null;
  return [
    createSemanticMetric({
      key: "common_load",
      label: "Load",
      status,
      value: commonLoad.load,
      unit: "score",
      reason,
    }),
    createSemanticMetric({
      key: "normalized_intensity",
      label: "Intensity",
      status,
      value: getNormalizedIntensity(commonLoad) ?? 0,
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
      avatarUrl: activity.profile?.avatar_url ?? null,
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
