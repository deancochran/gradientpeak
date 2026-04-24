import { decodePolyline, formatDurationSec, type IntervalStepV2 } from "@repo/core";
import type {
  ActivityPlanStructureV2,
  IntensityTargetV2,
} from "@repo/core/schemas/activity_plan_v2";
import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { StaticRouteMapPreview } from "@/components/shared/StaticRouteMapPreview";
import {
  getActivityPlanRoute,
  getAuthoritativeActivityPlanMetrics,
} from "@/lib/activityPlanMetrics";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

type ActivityPlanPreviewLike = {
  estimated_duration_minutes?: number | null;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  route?: {
    distance?: number | null;
    ascent?: number | null;
    descent?: number | null;
  } | null;
  route_id?: string | null;
  structure?: unknown;
};

type RouteLike = {
  name?: string | null;
  polyline?: string | null;
  total_ascent?: number | null;
  total_descent?: number | null;
  total_distance?: number | null;
};

type FullRouteLike = {
  coordinates?: Array<{ latitude: number; longitude: number; altitude?: number }>;
};

type ActivityPlanContentPreviewProps = {
  compact?: boolean;
  durationLabel?: string | null;
  intensityFactor?: number | null;
  onRoutePress?: (() => void) | null;
  plan: ActivityPlanPreviewLike | null | undefined;
  route?: RouteLike | null;
  routeFull?: FullRouteLike | null;
  size?: "small" | "medium" | "large";
  testIDPrefix?: string;
  tss?: number | null;
};

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getIntervals(structure: unknown): Array<{ repetitions: number; steps: IntervalStepV2[] }> {
  if (!structure || typeof structure !== "object") return [];
  const maybeIntervals = (structure as { intervals?: unknown }).intervals;
  return Array.isArray(maybeIntervals)
    ? (maybeIntervals as Array<{ repetitions: number; steps: IntervalStepV2[] }>)
    : [];
}

function getTimelineStructure(structure: unknown): ActivityPlanStructureV2 | null {
  if (!structure || typeof structure !== "object") {
    return null;
  }

  const maybeIntervals = (structure as { intervals?: unknown }).intervals;
  return Array.isArray(maybeIntervals) ? (structure as ActivityPlanStructureV2) : null;
}

function getStructure(structure: unknown): ActivityPlanStructureV2 | null {
  if (!structure || typeof structure !== "object") {
    return null;
  }

  const maybeIntervals = (structure as { intervals?: unknown }).intervals;
  return Array.isArray(maybeIntervals) ? (structure as ActivityPlanStructureV2) : null;
}

function flattenSteps(structure: unknown): IntervalStepV2[] {
  const intervals = getIntervals(structure);
  if (intervals.length === 0) return [];

  const steps: IntervalStepV2[] = [];
  for (const interval of intervals) {
    for (let iteration = 0; iteration < interval.repetitions; iteration += 1) {
      for (const step of interval.steps) {
        steps.push(step);
      }
    }
  }

  return steps;
}

function formatStepDuration(duration: any): string | null {
  if (!duration || typeof duration !== "object") return null;

  if (duration.type === "time" && typeof duration.seconds === "number") {
    return formatDurationSec(duration.seconds);
  }

  if (duration.type === "distance" && typeof duration.meters === "number") {
    return `${(duration.meters / 1000).toFixed(2)} km`;
  }

  if (duration.type === "repetitions" && typeof duration.count === "number") {
    return `${duration.count} reps`;
  }

  if (duration.type === "untilFinished") {
    return "Until finished";
  }

  return null;
}

function formatTarget(target: IntensityTargetV2): string {
  return `${target.intensity}${target.type}`;
}

function RouteMetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-[11px] font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function calculateCoordinateDistance(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const earthRadiusMeters = 6371e3;
  const lat1 = (left.latitude * Math.PI) / 180;
  const lat2 = (right.latitude * Math.PI) / 180;
  const deltaLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const deltaLng = ((right.longitude - left.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildRouteStreams(
  coordinates: Array<{ latitude: number; longitude: number; altitude?: number }> | undefined,
): { distanceStream: DecompressedStream; elevationStream: DecompressedStream } | null {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const elevatedCoordinates = coordinates.filter((point) => typeof point.altitude === "number");
  if (elevatedCoordinates.length < 2) {
    return null;
  }

  const distanceValues: number[] = [];
  const elevationValues: number[] = [];
  const timestamps: number[] = [];
  let cumulativeDistance = 0;

  elevatedCoordinates.forEach((point, index) => {
    if (index > 0) {
      cumulativeDistance += calculateCoordinateDistance(elevatedCoordinates[index - 1]!, point);
    }

    distanceValues.push(cumulativeDistance);
    elevationValues.push(point.altitude as number);
    timestamps.push(index);
  });

  return {
    distanceStream: {
      type: "distance",
      dataType: "float",
      values: distanceValues,
      timestamps,
      sampleCount: distanceValues.length,
    },
    elevationStream: {
      type: "elevation",
      dataType: "float",
      values: elevationValues,
      timestamps,
      sampleCount: elevationValues.length,
    },
  };
}

export function ActivityPlanContentPreview({
  compact = false,
  durationLabel,
  intensityFactor,
  onRoutePress,
  plan,
  route,
  routeFull,
  size,
  testIDPrefix,
  tss,
}: ActivityPlanContentPreviewProps) {
  const resolvedSize = size ?? (compact ? "small" : "large");
  const authoritativeMetrics = getAuthoritativeActivityPlanMetrics(plan);
  const planRoute = getActivityPlanRoute(plan);
  const estimatedDurationSeconds = readMetric(authoritativeMetrics.estimated_duration);
  const estimatedDurationMinutes = readMetric(plan?.estimated_duration_minutes);
  const estimatedTss = readMetric(authoritativeMetrics.estimated_tss);
  const routeDistanceMeters = readMetric(route?.total_distance ?? planRoute.distance);
  const routeAscentMeters = readMetric(route?.total_ascent ?? planRoute.ascent);
  const routeDescentMeters = readMetric(route?.total_descent ?? planRoute.descent);
  const structure = useMemo(() => getStructure(plan?.structure), [plan?.structure]);
  const timelineStructure = useMemo(() => getTimelineStructure(plan?.structure), [plan?.structure]);
  const steps = useMemo(() => flattenSteps(plan?.structure), [plan?.structure]);
  const routeCoordinates = useMemo(
    () => (route?.polyline ? decodePolyline(route.polyline) : null),
    [route?.polyline],
  );
  const routeStreams = useMemo(
    () => buildRouteStreams(routeFull?.coordinates),
    [routeFull?.coordinates],
  );
  const hasTimeline = getIntervals(plan?.structure).length > 0;
  const maxVisibleSteps = resolvedSize === "small" ? 2 : resolvedSize === "medium" ? 3 : 4;
  const visibleSteps = steps.slice(0, maxVisibleSteps);
  const hasMetrics =
    estimatedDurationSeconds !== null ||
    estimatedDurationMinutes !== null ||
    !!durationLabel ||
    estimatedTss !== null ||
    typeof tss === "number" ||
    typeof intensityFactor === "number" ||
    steps.length > 0 ||
    !!plan?.route_id ||
    routeDistanceMeters !== null ||
    !!route?.name;

  if (!plan || (!hasMetrics && !hasTimeline && visibleSteps.length === 0 && !routeCoordinates)) {
    return null;
  }

  return (
    <View className={resolvedSize === "small" ? "gap-3" : "gap-4"} testID={testIDPrefix}>
      {hasTimeline ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <View
            className="overflow-hidden rounded-xl"
            testID={testIDPrefix ? `${testIDPrefix}-timeline` : undefined}
          >
            {timelineStructure ? (
              <TimelineChart
                structure={timelineStructure}
                height={resolvedSize === "small" ? 72 : resolvedSize === "medium" ? 92 : 104}
                compact={resolvedSize !== "large"}
              />
            ) : null}
          </View>
        </View>
      ) : routeStreams && resolvedSize !== "large" ? (
        <ElevationProfileChart
          elevationStream={routeStreams.elevationStream}
          distanceStream={routeStreams.distanceStream}
          title={resolvedSize === "small" ? undefined : "Elevation Profile"}
          height={resolvedSize === "small" ? 88 : 150}
          showStats={resolvedSize !== "small"}
        />
      ) : null}

      {route && routeCoordinates && routeCoordinates.length > 0 && resolvedSize !== "small" ? (
        <Pressable
          onPress={onRoutePress ?? undefined}
          disabled={!onRoutePress}
          className="overflow-hidden rounded-2xl border border-border bg-card"
          testID={testIDPrefix ? `${testIDPrefix}-route-card` : undefined}
        >
          <View className="px-3 py-3 border-b border-border bg-card">
            {route.name ? (
              <Text className="text-sm font-semibold text-foreground mb-2">{route.name}</Text>
            ) : null}
            <View className="rounded-lg bg-muted/30 px-2.5 py-2">
              <View className="flex-row justify-between gap-2">
                {typeof routeDistanceMeters === "number" ? (
                  <RouteMetricCell
                    label="Distance"
                    value={`${(routeDistanceMeters / 1000).toFixed(1)} km`}
                  />
                ) : null}
                <RouteMetricCell
                  label="Climb"
                  value={
                    typeof routeAscentMeters === "number" && routeAscentMeters > 0
                      ? `${routeAscentMeters}m`
                      : "--"
                  }
                />
                <RouteMetricCell
                  label="Descent"
                  value={
                    typeof routeDescentMeters === "number" && routeDescentMeters > 0
                      ? `${routeDescentMeters}m`
                      : "--"
                  }
                />
              </View>
            </View>
          </View>
          <View className="h-36">
            <StaticRouteMapPreview coordinates={routeCoordinates} strokeColor="#3b82f6" />
          </View>
        </Pressable>
      ) : null}

      {routeStreams && resolvedSize === "large" ? (
        <ElevationProfileChart
          elevationStream={routeStreams.elevationStream}
          distanceStream={routeStreams.distanceStream}
          title="Elevation Profile"
          height={150}
          showStats={true}
        />
      ) : null}

      {visibleSteps.length > 0 && resolvedSize === "large" ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session Flow
          </Text>
          <View className="mt-3 gap-2">
            {structure?.intervals.slice(0, structure.intervals.length).map((interval, index) => (
              <View
                key={interval.id || `${interval.name}-${index}`}
                className="rounded-xl border border-border/60 bg-background px-3 py-3"
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-sm font-medium text-foreground">
                      {interval.name || `Block ${index + 1}`}
                    </Text>
                    {interval.notes ? (
                      <Text className="text-xs leading-4 text-muted-foreground">
                        {interval.notes}
                      </Text>
                    ) : null}
                  </View>
                  {interval.repetitions > 1 ? (
                    <Text className="text-xs text-muted-foreground">
                      Repeat {interval.repetitions}x
                    </Text>
                  ) : null}
                </View>
                <View className="mt-3 gap-2.5">
                  {interval.steps.map((step, stepIndex) => {
                    const stepDurationLabel = formatStepDuration(step.duration);
                    const targetSummary = step.targets?.length
                      ? step.targets.map((target) => formatTarget(target)).join(" · ")
                      : null;

                    return (
                      <View key={step.id || `${interval.id}-${stepIndex}`} className="gap-1.5">
                        <View className="flex-row items-start justify-between gap-3">
                          <Text className="flex-1 text-sm font-medium text-foreground">
                            {step.name || `Step ${stepIndex + 1}`}
                          </Text>
                          {stepDurationLabel ? (
                            <Text className="text-xs text-muted-foreground">
                              {stepDurationLabel}
                            </Text>
                          ) : null}
                        </View>
                        {targetSummary ? (
                          <Text className="text-xs font-medium text-foreground/80">
                            {targetSummary}
                          </Text>
                        ) : null}
                        {step.description ? (
                          <Text className="text-xs leading-4 text-muted-foreground">
                            {step.description}
                          </Text>
                        ) : null}
                        {step.notes ? (
                          <Text className="text-xs leading-4 text-muted-foreground">
                            {step.notes}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
