import type {
  ActivityPlanDuration,
  ActivityPlanIntervalStep,
  ActivityPlanPresentationModel,
  ActivityPlanStructureV3,
  ActivityPlanTarget,
} from "@repo/core";
import { decodePolyline, deriveActivityPlanPresentation, formatDurationSec } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { TimelineChart } from "@/components/activity-plan/workout/TimelineChart";
import { StaticRouteMapPreview } from "@/components/shared/StaticRouteMapPreview";
import { getActivityPlanRoute } from "@/lib/activityPlanMetrics";
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
  /** @deprecated Activity plan routes are no longer owned by plans. */
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
  onRoutePress?: (() => void) | null;
  plan: ActivityPlanPreviewLike | null | undefined;
  presentation?: ActivityPlanPresentationModel | null;
  route?: RouteLike | null;
  routeFull?: FullRouteLike | null;
  showRoutePreview?: boolean;
  size?: "small" | "medium" | "large";
  testIDPrefix?: string;
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

function flattenSteps(structure: ActivityPlanStructureV3 | null): ActivityPlanIntervalStep[] {
  if (!structure) return [];
  const steps: ActivityPlanIntervalStep[] = [];
  for (const segment of structure.segments) {
    if (segment.role !== "activity") continue;
    for (const interval of segment.intervals) {
      for (let iteration = 0; iteration < interval.repetitions; iteration += 1) {
        steps.push(...interval.steps);
      }
    }
  }
  return steps;
}

function formatStepDuration(duration: ActivityPlanDuration): string | null {
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

function formatTarget(target: ActivityPlanTarget): string {
  switch (target.type) {
    case "RPE":
      return `RPE ${target.intensity}`;
    case "%FTP":
      return `${target.intensity}% FTP`;
    case "%MaxHR":
      return `${target.intensity}% max HR`;
    case "%ThresholdHR":
      return `${target.intensity}% threshold HR`;
    case "watts":
      return `${target.intensity} W`;
    case "cadence":
      return `${target.intensity} rpm`;
    case "speed":
      return `${target.intensity} km/h`;
    default:
      return `${target.intensity} ${target.type}`;
  }
}

function normalizeLabel(value: string | null | undefined): string {
  return (
    value
      ?.trim()
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
      .trim() ?? ""
  );
}

function getDistinctLabel(
  value: string | null | undefined,
  parentLabels: Array<string | null | undefined>,
): string | null {
  const normalizedValue = normalizeLabel(value);
  if (!normalizedValue) return null;

  const duplicatesParent = parentLabels.some(
    (parentLabel) => normalizeLabel(parentLabel) === normalizedValue,
  );
  return duplicatesParent ? null : value?.trim() || null;
}

function labelContainsSemantic(value: string, semantic: string): boolean {
  const labelWords = normalizeLabel(value).split(" ");
  return labelWords.includes(normalizeLabel(semantic));
}

function formatSemanticLabel(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
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
      const previous = elevatedCoordinates[index - 1];
      if (previous) cumulativeDistance += calculateCoordinateDistance(previous, point);
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
  onRoutePress,
  plan,
  presentation,
  route,
  routeFull,
  showRoutePreview = true,
  size,
  testIDPrefix,
}: ActivityPlanContentPreviewProps) {
  const resolvedSize = size ?? (compact ? "small" : "large");
  const planRoute = getActivityPlanRoute(plan);
  const routeDistanceMeters = readMetric(route?.total_distance ?? planRoute.distance);
  const routeAscentMeters = readMetric(route?.total_ascent ?? planRoute.ascent);
  const routeDescentMeters = readMetric(route?.total_descent ?? planRoute.descent);
  const presentationModel = useMemo(
    () => presentation ?? deriveActivityPlanPresentation(plan?.structure),
    [plan?.structure, presentation],
  );
  const structure = presentationModel?.structure ?? null;
  const steps = useMemo(() => flattenSteps(structure), [structure]);
  const routeCoordinates = useMemo(
    () =>
      showRoutePreview && resolvedSize !== "small" && route?.polyline
        ? decodePolyline(route.polyline)
        : null,
    [resolvedSize, route?.polyline, showRoutePreview],
  );
  const routeStreams = useMemo(
    () => buildRouteStreams(routeFull?.coordinates),
    [routeFull?.coordinates],
  );
  const hasTimeline = Boolean(presentationModel?.occurrences.length);
  const maxVisibleSteps = resolvedSize === "small" ? 2 : resolvedSize === "medium" ? 3 : 4;
  const visibleSteps = steps.slice(0, maxVisibleSteps);
  const hasRouteMap = Boolean(
    showRoutePreview &&
      route &&
      routeCoordinates &&
      routeCoordinates.length > 0 &&
      resolvedSize !== "small",
  );
  const hasElevationProfile = Boolean(routeStreams);
  const hasSessionFlow = visibleSteps.length > 0 && resolvedSize === "large";

  if (!plan || (!hasTimeline && !hasRouteMap && !hasElevationProfile && !hasSessionFlow)) {
    return null;
  }

  return (
    <View className={resolvedSize === "small" ? "gap-3" : "gap-4"} testID={testIDPrefix}>
      {hasTimeline ? (
        <View
          className="overflow-hidden rounded-xl"
          testID={testIDPrefix ? `${testIDPrefix}-timeline` : undefined}
        >
          {structure ? (
            <TimelineChart
              presentation={presentationModel}
              height={resolvedSize === "small" ? 72 : resolvedSize === "medium" ? 92 : 104}
              compact={resolvedSize !== "large"}
            />
          ) : null}
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

      {showRoutePreview &&
      route &&
      routeCoordinates &&
      routeCoordinates.length > 0 &&
      resolvedSize !== "small" ? (
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

      {hasSessionFlow ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session Flow
          </Text>
          <View className="mt-2">
            {structure?.segments.map((segment, index) => {
              const segmentTitle = segment.name?.trim() || `Segment ${index + 1}`;
              const semantic = segment.role === "activity" ? segment.category : segment.role;
              const showSemantic = !labelContainsSemantic(segmentTitle, semantic);

              return (
                <View
                  key={segment.id}
                  className={index === 0 ? "py-2" : "border-t border-border/60 py-3"}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-semibold text-foreground">{segmentTitle}</Text>
                      {showSemantic ? (
                        <Text className="text-xs text-muted-foreground">
                          {formatSemanticLabel(semantic)}
                        </Text>
                      ) : null}
                      {segment.notes ? (
                        <Text className="text-xs leading-4 text-muted-foreground">
                          {segment.notes}
                        </Text>
                      ) : null}
                    </View>
                    {segment.role !== "activity" ? (
                      <Text className="text-xs font-medium text-foreground/80">
                        {formatStepDuration(segment.duration)}
                      </Text>
                    ) : null}
                  </View>
                  {segment.role === "activity"
                    ? segment.intervals.map((interval) => {
                        const intervalLabel = getDistinctLabel(interval.name, [segmentTitle]);
                        const showIntervalHeader = Boolean(
                          intervalLabel || interval.repetitions > 1,
                        );

                        return (
                          <View key={interval.id} className="mt-2 gap-2.5">
                            {showIntervalHeader ? (
                              <Text className="text-xs font-semibold text-muted-foreground">
                                {intervalLabel}
                                {interval.repetitions > 1 ? ` · ${interval.repetitions}x` : ""}
                              </Text>
                            ) : null}
                            {interval.steps.map((step, stepIndex) => {
                              const stepLabel = getDistinctLabel(step.name, [
                                segmentTitle,
                                interval.name,
                              ]);
                              const detailSummary = [
                                ...(step.targets?.map((target) => formatTarget(target)) ?? []),
                                formatStepDuration(step.duration),
                              ]
                                .filter((value): value is string => Boolean(value))
                                .join(" · ");

                              return (
                                <View
                                  key={step.id || `${interval.id}-${stepIndex}`}
                                  className="gap-1.5"
                                >
                                  {stepLabel ? (
                                    <Text className="text-sm font-medium text-foreground">
                                      {stepLabel}
                                    </Text>
                                  ) : null}
                                  {detailSummary ? (
                                    <Text className="text-xs font-medium text-foreground/80">
                                      {detailSummary}
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
                        );
                      })
                    : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
