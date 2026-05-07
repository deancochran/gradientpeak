import { Text } from "@repo/ui/components/text";
import { Circle, useFont } from "@shopify/react-native-skia";
import React from "react";
import { useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CartesianChart, Line } from "victory-native";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

interface RouteElevationBackdropProps {
  service: ActivityRecorderService | null;
}

interface RouteElevationProfileProps extends RouteElevationBackdropProps {
  className?: string;
  showHeader?: boolean;
  variant?: "compact" | "expanded";
}

interface RouteElevationDatum extends Record<string, unknown> {
  distanceMeters: number;
  elevation: number;
}

interface RenderedChartPoint {
  x?: number;
  y?: number | null;
  xValue?: unknown;
  yValue?: unknown;
  distanceMeters?: number;
  elevation?: number;
}

interface RouteSnapshot {
  currentDistance: number;
  grade: number;
  isGpsEnabled: boolean;
  isOnRoute: boolean;
  profile: Array<{ distance: number; elevation: number }>;
  progress: number;
  routeDistance: number;
}

interface RouteBackdropViewModel {
  clampedDistanceMeters: number;
  completedProfilePoints: RouteElevationDatum[];
  currentDistanceMeters: number;
  currentProfilePoint: RouteElevationDatum | null;
  gradeLabel: string;
  isRouteComplete: boolean;
  shouldShowPosition: boolean;
  profilePoints: RouteElevationDatum[];
  progressLabel: string;
  progressRatio: number;
  routeDistanceMeters: number;
  upcomingProfilePoints: RouteElevationDatum[];
}

type ChartYKey = "elevation";

const compactChartPadding = { bottom: 0, left: 0, right: 0, top: 0 };
const expandedChartPadding = { bottom: 0, left: 0, right: 4, top: 4 };

export function RouteElevationBackdrop({ service }: RouteElevationBackdropProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0 bg-background" testID="route-elevation-backdrop">
      <View
        className="absolute inset-x-4 rounded-[28px] border border-border bg-card p-4 shadow-2xl"
        style={{ top: insets.top + 14 }}
        testID="route-profile-stage"
      >
        <RouteElevationProfile service={service} />
      </View>
    </View>
  );
}

export function RouteElevationProfile({
  className,
  service,
  showHeader = true,
  variant = "expanded",
}: RouteElevationProfileProps) {
  const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 11);
  const isDark = useColorScheme() === "dark";
  const colors = React.useMemo(() => getRouteBackdropColors(isDark), [isDark]);
  const [snapshot, setSnapshot] = React.useState(() => readRouteSnapshot(service));

  React.useEffect(() => {
    if (!service) {
      setSnapshot(readRouteSnapshot(null));
      return;
    }

    setSnapshot(readRouteSnapshot(service));
    const interval = setInterval(() => {
      setSnapshot(readRouteSnapshot(service));
    }, 1000);

    return () => clearInterval(interval);
  }, [service]);

  const model = React.useMemo(
    () => buildRouteBackdropViewModel(snapshot),
    [
      snapshot.currentDistance,
      snapshot.grade,
      snapshot.isGpsEnabled,
      snapshot.isOnRoute,
      snapshot.profile,
      snapshot.progress,
      snapshot.routeDistance,
    ],
  );
  const isCompact = variant === "compact";
  const xAxisTicks = React.useMemo(() => {
    const firstPoint = model.profilePoints[0];
    const lastPoint = model.profilePoints.at(-1);

    return uniqueEndpointTicks(firstPoint?.distanceMeters, lastPoint?.distanceMeters);
  }, [model.profilePoints]);
  const yAxisTicks = React.useMemo(() => {
    if (model.profilePoints.length === 0) return [];

    const { maxElevation, minElevation } = resolveElevationRange(model.profilePoints);

    return uniqueEndpointTicks(minElevation, maxElevation);
  }, [model.profilePoints]);
  const compactMaxXLabel = React.useMemo(() => {
    const lastPoint = model.profilePoints.at(-1);

    return lastPoint ? `${(lastPoint.distanceMeters / 1000).toFixed(1)} km` : null;
  }, [model.profilePoints]);
  const compactMaxYLabel = React.useMemo(() => {
    if (model.profilePoints.length === 0) return null;

    return `${Math.round(resolveElevationRange(model.profilePoints).maxElevation)} m`;
  }, [model.profilePoints]);
  const axisOptions = isCompact
    ? {
        font: null,
        formatXLabel: (value: unknown) => `${(Number(value) / 1000).toFixed(1)} km`,
        formatYLabel: (value: unknown) => `${Math.round(Number(value))} m`,
        labelColor: colors.axisLabel,
        labelOffset: { x: 2, y: 2 },
        labelPosition: { x: "inset" as const, y: "inset" as const },
        lineColor: colors.axisLine,
        lineWidth: 0,
        tickCount: { x: 2, y: 2 },
        tickValues: { x: xAxisTicks, y: yAxisTicks },
      }
    : {
        font,
        formatXLabel: (value: unknown) => `${(Number(value) / 1000).toFixed(1)} km`,
        formatYLabel: (value: unknown) => `${Math.round(Number(value))} m`,
        labelColor: colors.axisLabel,
        labelOffset: { x: 2, y: 3 },
        labelPosition: { x: "inset" as const, y: "inset" as const },
        lineColor: colors.axisLine,
        lineWidth: 1,
      };

  return (
    <View className={className} testID="route-profile-card-content">
      {!isCompact && showHeader ? (
        <View className="mb-3 flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Route profile
            </Text>
            <Text className="mt-1 text-xl font-black leading-tight text-foreground">
              {model.progressLabel}
            </Text>
          </View>
        </View>
      ) : null}

      {model.profilePoints.length > 1 ? (
        <View
          className={`${isCompact ? "min-h-0 flex-1" : "min-h-72 flex-1"} overflow-hidden`}
          testID="route-elevation-chart"
        >
          <CartesianChart<RouteElevationDatum, "distanceMeters", ChartYKey>
            data={model.profilePoints}
            xKey="distanceMeters"
            yKeys={["elevation"]}
            padding={isCompact ? compactChartPadding : expandedChartPadding}
            axisOptions={axisOptions}
            frame={{ lineColor: colors.frame, lineWidth: 1 }}
          >
            {({ points, chartBounds }) => {
              const chartPoints = points.elevation as unknown as RenderedChartPoint[];
              const renderedPoint = model.shouldShowPosition
                ? resolveRenderedCurrentPoint({
                    chartBounds,
                    currentPoint: model.currentProfilePoint,
                    points: chartPoints,
                    progressRatio: model.progressRatio,
                  })
                : null;
              const completedPoints = buildRenderedCompletedPoints({
                currentPoint: model.currentProfilePoint,
                points: chartPoints,
                renderedPoint,
              }) as typeof points.elevation;

              return (
                <>
                  <Line
                    points={points.elevation}
                    color={colors.routeLine}
                    strokeWidth={2}
                    curveType="natural"
                    animate={{ type: "timing", duration: 250 }}
                  />
                  <Line
                    points={completedPoints}
                    color={colors.completedLine}
                    strokeWidth={3}
                    curveType="natural"
                    animate={{ type: "timing", duration: 250 }}
                  />
                  {renderedPoint ? (
                    <>
                      <Circle
                        cx={renderedPoint.x}
                        cy={renderedPoint.y}
                        r={7}
                        color={colors.dotHalo}
                      />
                      <Circle
                        cx={renderedPoint.x}
                        cy={renderedPoint.y}
                        r={4}
                        color={colors.completedLine}
                      />
                    </>
                  ) : null}
                </>
              );
            }}
          </CartesianChart>
          {model.currentProfilePoint && model.shouldShowPosition ? (
            <View
              className="absolute h-1 w-1"
              style={{ left: `${model.progressRatio * 100}%`, top: "50%" }}
              testID="route-profile-current-dot"
            />
          ) : null}
          {isCompact ? (
            <View className="pointer-events-none absolute inset-0 justify-between px-1 py-0.5">
              <Text className="self-start rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                {compactMaxYLabel}
              </Text>
              <Text className="self-end rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                {compactMaxXLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <DistanceFallback compact={isCompact} model={model} />
      )}
    </View>
  );
}

function DistanceFallback({
  compact,
  model,
}: {
  compact?: boolean;
  model: RouteBackdropViewModel;
}) {
  return (
    <View
      className={`${compact ? "h-24 rounded-[20px] px-3 py-2" : "h-44 rounded-[24px] border p-4"} justify-center border-border bg-background`}
      testID="route-distance-fallback"
    >
      {!compact ? (
        <>
          <Text className="text-sm font-semibold text-foreground">Route distance</Text>
          <Text className="mt-2 text-xs leading-5 text-muted-foreground">
            Elevation data is unavailable, so progress follows distance along the route.
          </Text>
        </>
      ) : null}
      <View
        className={`${compact ? "mt-2" : "mt-8"} relative h-2 overflow-visible rounded-full bg-muted`}
      >
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(model.progressRatio * 100)}%` }}
        />
        <View
          className="absolute -top-[5px] h-4 w-4 rounded-full border-2 border-background bg-primary"
          style={{ left: `${clamp(model.progressRatio * 100, 0, 100)}%`, marginLeft: -8 }}
          testID="route-distance-current-dot"
        />
      </View>
    </View>
  );
}

function uniqueEndpointTicks(first?: number, last?: number) {
  const ticks = [first, last].filter((value): value is number => Number.isFinite(value));

  return Array.from(new Set(ticks));
}

function resolveElevationRange(points: RouteElevationDatum[]) {
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minElevation = Math.min(minElevation, point.elevation);
    maxElevation = Math.max(maxElevation, point.elevation);
  }

  return { maxElevation, minElevation };
}

function getRouteBackdropColors(isDark: boolean) {
  return isDark
    ? {
        axisLabel: "rgba(226, 232, 240, 0.7)",
        axisLine: "rgba(148, 163, 184, 0.22)",
        completedLine: "#6ee7b7",
        dotHalo: "rgba(110, 231, 183, 0.28)",
        frame: "rgba(255,255,255,0.12)",
        routeLine: "rgba(226, 232, 240, 0.42)",
      }
    : {
        axisLabel: "rgba(71, 85, 105, 0.72)",
        axisLine: "rgba(100, 116, 139, 0.22)",
        completedLine: "#047857",
        dotHalo: "rgba(4, 120, 87, 0.24)",
        frame: "rgba(15,23,42,0.12)",
        routeLine: "rgba(71, 85, 105, 0.38)",
      };
}

function readRouteSnapshot(service: ActivityRecorderService | null): RouteSnapshot {
  return {
    currentDistance: Math.max(0, service?.currentRouteDistance ?? 0),
    grade: service?.currentRouteGrade ?? 0,
    isGpsEnabled: service?.isGpsRecordingEnabled?.() ?? true,
    isOnRoute: service?.isOnRoute ?? false,
    profile: service?.currentRoute?.elevation_profile ?? [],
    progress: clamp(service?.routeProgress ?? 0, 0, 100),
    routeDistance: Math.max(0, service?.routeDistance ?? 0),
  };
}

function buildRouteBackdropViewModel(snapshot: RouteSnapshot): RouteBackdropViewModel {
  const profilePoints = buildProfilePoints(snapshot.profile, snapshot.routeDistance);
  const profileDistance = profilePoints[profilePoints.length - 1]?.distanceMeters ?? 0;
  const routeDistanceMeters = snapshot.routeDistance > 0 ? snapshot.routeDistance : profileDistance;
  const currentDistanceMeters = Math.max(0, snapshot.currentDistance);
  const clampedDistanceMeters =
    routeDistanceMeters > 0
      ? Math.min(currentDistanceMeters, routeDistanceMeters)
      : currentDistanceMeters;
  const progressRatio =
    routeDistanceMeters > 0
      ? clamp(clampedDistanceMeters / routeDistanceMeters, 0, 1)
      : clamp(snapshot.progress / 100, 0, 1);
  const currentProfilePoint = interpolateProfilePoint(profilePoints, clampedDistanceMeters);
  const shouldShowPosition = !snapshot.isGpsEnabled || snapshot.isOnRoute;
  const completedProfilePoints = currentProfilePoint
    ? [
        ...profilePoints.filter((point) => point.distanceMeters <= clampedDistanceMeters),
        currentProfilePoint,
      ].sort((left, right) => left.distanceMeters - right.distanceMeters)
    : [];

  return {
    clampedDistanceMeters,
    completedProfilePoints,
    currentDistanceMeters,
    currentProfilePoint,
    gradeLabel: formatGrade(snapshot.grade),
    isRouteComplete: routeDistanceMeters > 0 && currentDistanceMeters >= routeDistanceMeters,
    shouldShowPosition,
    profilePoints,
    progressLabel:
      routeDistanceMeters > 0
        ? `${formatDistance(clampedDistanceMeters)} / ${formatDistance(routeDistanceMeters)}`
        : `${formatDistance(clampedDistanceMeters)}`,
    progressRatio,
    routeDistanceMeters,
    upcomingProfilePoints: profilePoints.filter(
      (point) => point.distanceMeters >= clampedDistanceMeters,
    ),
  };
}

function buildProfilePoints(
  profile: Array<{ distance: number; elevation: number }>,
  routeDistance: number,
): RouteElevationDatum[] {
  const routeLimit = routeDistance > 0 ? routeDistance : undefined;

  return profile
    .filter(
      (point) =>
        Number.isFinite(point.distance) && Number.isFinite(point.elevation) && point.distance >= 0,
    )
    .sort((left, right) => left.distance - right.distance)
    .map((point) => ({
      distanceMeters: point.distance,
      elevation: point.elevation,
    }))
    .filter((point, index, points) => {
      if (!routeLimit) return true;
      if (index === points.length - 1) return point.distanceMeters <= routeLimit + 10;
      return point.distanceMeters <= routeLimit;
    });
}

function interpolateProfilePoint(
  profilePoints: RouteElevationDatum[],
  currentDistanceMeters: number,
): RouteElevationDatum | null {
  if (profilePoints.length === 0) return null;

  if (currentDistanceMeters <= profilePoints[0]!.distanceMeters) return profilePoints[0]!;

  for (let index = 0; index < profilePoints.length - 1; index += 1) {
    const start = profilePoints[index]!;
    const end = profilePoints[index + 1]!;
    if (
      currentDistanceMeters >= start.distanceMeters &&
      currentDistanceMeters <= end.distanceMeters
    ) {
      const span = end.distanceMeters - start.distanceMeters;
      const ratio = span > 0 ? (currentDistanceMeters - start.distanceMeters) / span : 0;
      return {
        distanceMeters: currentDistanceMeters,
        elevation: start.elevation + (end.elevation - start.elevation) * ratio,
      };
    }
  }

  return profilePoints[profilePoints.length - 1]!;
}

function resolveRenderedCurrentPoint(params: {
  chartBounds: { bottom: number; left: number; right: number; top: number };
  currentPoint: RouteElevationDatum | null;
  points: RenderedChartPoint[];
  progressRatio: number;
}): { x: number; y: number } | null {
  if (!params.currentPoint || params.points.length === 0) return null;

  const sortedPoints = [...params.points].sort(
    (left, right) => getRenderedPointDistance(left) - getRenderedPointDistance(right),
  );
  const first = sortedPoints[0];
  const last = sortedPoints[sortedPoints.length - 1];
  if (!first || !last) return null;

  if (params.currentPoint.distanceMeters <= getRenderedPointDistance(first)) {
    return getRenderedPointCoordinates(first, params.chartBounds, 0);
  }

  for (let index = 0; index < sortedPoints.length - 1; index += 1) {
    const start = sortedPoints[index]!;
    const end = sortedPoints[index + 1]!;
    const startDistance = getRenderedPointDistance(start);
    const endDistance = getRenderedPointDistance(end);
    if (
      params.currentPoint.distanceMeters >= startDistance &&
      params.currentPoint.distanceMeters <= endDistance
    ) {
      const span = endDistance - startDistance;
      const ratio = span > 0 ? (params.currentPoint.distanceMeters - startDistance) / span : 0;
      const startCoordinates = getRenderedPointCoordinates(
        start,
        params.chartBounds,
        params.progressRatio,
      );
      const endCoordinates = getRenderedPointCoordinates(
        end,
        params.chartBounds,
        params.progressRatio,
      );
      return {
        x: startCoordinates.x + (endCoordinates.x - startCoordinates.x) * ratio,
        y: startCoordinates.y + (endCoordinates.y - startCoordinates.y) * ratio,
      };
    }
  }

  return getRenderedPointCoordinates(last, params.chartBounds, 1);
}

function buildRenderedCompletedPoints(params: {
  currentPoint: RouteElevationDatum | null;
  points: RenderedChartPoint[];
  renderedPoint: { x: number; y: number } | null;
}) {
  if (!params.currentPoint || !params.renderedPoint) return [];

  const completedPoints = params.points.filter(
    (point) => getRenderedPointDistance(point) <= params.currentPoint!.distanceMeters,
  );

  return [
    ...completedPoints,
    {
      ...params.currentPoint,
      x: params.renderedPoint.x,
      y: params.renderedPoint.y,
      xValue: params.currentPoint.distanceMeters,
      yValue: params.currentPoint.elevation,
    },
  ];
}

function getRenderedPointDistance(point: RenderedChartPoint): number {
  const value = point.xValue ?? point.distanceMeters;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getRenderedPointCoordinates(
  point: RenderedChartPoint,
  chartBounds: { bottom: number; left: number; right: number; top: number },
  fallbackRatio: number,
) {
  return {
    x:
      typeof point.x === "number"
        ? point.x
        : chartBounds.left + (chartBounds.right - chartBounds.left) * fallbackRatio,
    y:
      typeof point.y === "number"
        ? point.y
        : chartBounds.top + (chartBounds.bottom - chartBounds.top) / 2,
  };
}

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatGrade(grade: number) {
  if (!Number.isFinite(grade) || Math.abs(grade) < 0.05) return "0.0%";
  return `${grade > 0 ? "+" : ""}${grade.toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
