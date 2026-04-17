import { decodePolyline, formatDurationSec, type IntervalStepV2 } from "@repo/core";
import type { ActivityPlanStructureV2 } from "@repo/core/schemas/activity_plan_v2";
import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { View } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";

type ActivityPlanPreviewLike = {
  estimated_duration?: number | null;
  estimated_duration_minutes?: number | null;
  estimated_tss?: number | null;
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

type ActivityPlanContentPreviewProps = {
  compact?: boolean;
  intensityFactor?: number | null;
  plan: ActivityPlanPreviewLike | null | undefined;
  route?: RouteLike | null;
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

export function ActivityPlanContentPreview({
  compact = false,
  intensityFactor,
  plan,
  route,
  testIDPrefix,
}: ActivityPlanContentPreviewProps) {
  const estimatedDurationSeconds = readMetric(plan?.estimated_duration);
  const estimatedDurationMinutes = readMetric(plan?.estimated_duration_minutes);
  const estimatedTss = readMetric(plan?.estimated_tss);
  const timelineStructure = useMemo(() => getTimelineStructure(plan?.structure), [plan?.structure]);
  const steps = useMemo(() => flattenSteps(plan?.structure), [plan?.structure]);
  const routeCoordinates = useMemo(
    () => (route?.polyline ? decodePolyline(route.polyline) : null),
    [route?.polyline],
  );
  const routeInitialRegion =
    routeCoordinates && routeCoordinates.length > 0
      ? {
          latitude: routeCoordinates[Math.floor(routeCoordinates.length / 2)]!.latitude,
          longitude: routeCoordinates[Math.floor(routeCoordinates.length / 2)]!.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : null;
  const hasTimeline = getIntervals(plan?.structure).length > 0;
  const maxVisibleSteps = compact ? 2 : 4;
  const visibleSteps = steps.slice(0, maxVisibleSteps);
  const hasMetrics =
    estimatedDurationSeconds !== null ||
    estimatedDurationMinutes !== null ||
    estimatedTss !== null ||
    typeof intensityFactor === "number" ||
    steps.length > 0 ||
    !!plan?.route_id ||
    !!route?.name;

  if (!plan || (!hasMetrics && !hasTimeline && visibleSteps.length === 0 && !routeInitialRegion)) {
    return null;
  }

  return (
    <View className={compact ? "gap-3" : "gap-4"} testID={testIDPrefix}>
      {hasMetrics ? (
        <View className="flex-row flex-wrap gap-2">
          {estimatedDurationSeconds !== null || estimatedDurationMinutes !== null ? (
            <MetricPill
              label="Duration"
              value={
                estimatedDurationSeconds !== null
                  ? formatDurationSec(Math.max(0, estimatedDurationSeconds))
                  : `${Math.round(estimatedDurationMinutes || 0)} min`
              }
            />
          ) : null}
          {estimatedTss !== null ? <MetricPill label="TSS" value={`${Math.round(estimatedTss)}`} /> : null}
          {typeof intensityFactor === "number" ? (
            <MetricPill label="IF" value={intensityFactor.toFixed(2)} />
          ) : null}
          {steps.length > 0 ? <MetricPill label="Steps" value={`${steps.length}`} /> : null}
          {route?.name ? <MetricPill label="Route" value={route.name} /> : null}
          {!route?.name && plan.route_id ? <MetricPill label="Route" value="Included" /> : null}
        </View>
      ) : null}

      {hasTimeline ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Intensity Profile
          </Text>
          <View
            className="mt-3 overflow-hidden rounded-xl"
            testID={testIDPrefix ? `${testIDPrefix}-timeline` : undefined}
          >
            {timelineStructure ? (
              <TimelineChart
                structure={timelineStructure}
                height={compact ? 80 : 120}
                compact={compact}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {route && routeInitialRegion && routeCoordinates && routeCoordinates.length > 0 && !compact ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          <View className="h-36">
            <MapView
              style={{ flex: 1 }}
              provider={PROVIDER_DEFAULT}
              initialRegion={routeInitialRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#3b82f6"
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
              />
            </MapView>
          </View>
          <View className="gap-2 border-t border-border px-3 py-3">
            {route.name ? <Text className="text-sm font-semibold text-foreground">{route.name}</Text> : null}
            <View className="flex-row flex-wrap gap-3">
              {typeof route.total_distance === "number" ? (
                <Text className="text-xs text-muted-foreground">
                  {(route.total_distance / 1000).toFixed(1)} km
                </Text>
              ) : null}
              {typeof route.total_ascent === "number" && route.total_ascent > 0 ? (
                <Text className="text-xs text-muted-foreground">↑ {route.total_ascent}m</Text>
              ) : null}
              {typeof route.total_descent === "number" && route.total_descent > 0 ? (
                <Text className="text-xs text-muted-foreground">↓ {route.total_descent}m</Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {visibleSteps.length > 0 ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session Flow
          </Text>
          <View className="mt-3 gap-2">
            {visibleSteps.map((step, index) => {
              const durationLabel = formatStepDuration(step.duration);

              return (
                <View
                  key={`${step.id || step.name || "step"}-${index}`}
                  className="flex-row items-start justify-between gap-3"
                >
                  <Text className="flex-1 text-sm font-medium text-foreground">
                    {step.name || `Step ${index + 1}`}
                  </Text>
                  {durationLabel ? (
                    <Text className="text-xs text-muted-foreground">{durationLabel}</Text>
                  ) : null}
                </View>
              );
            })}
            {steps.length > maxVisibleSteps ? (
              <Text className="text-xs text-muted-foreground">+{steps.length - maxVisibleSteps} more steps</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-full bg-muted px-3 py-1.5">
      <Text className="text-[11px] font-medium text-muted-foreground">{label}: {value}</Text>
    </View>
  );
}
