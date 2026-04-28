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
  profilePoints: RouteElevationDatum[];
  progressLabel: string;
  progressRatio: number;
  routeDistanceMeters: number;
  upcomingProfilePoints: RouteElevationDatum[];
}

type ChartYKey = "elevation";

const chartPadding = { bottom: 24, left: 6, right: 6, top: 18 };

export function RouteElevationBackdrop({ service }: RouteElevationBackdropProps) {
  const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 11);
  const insets = useSafeAreaInsets();
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
      snapshot.profile,
      snapshot.progress,
      snapshot.routeDistance,
    ],
  );

  return (
    <View className="absolute inset-0 bg-background" testID="route-elevation-backdrop">
      <View
        className="absolute inset-x-4 rounded-[28px] border border-border bg-card p-4 shadow-2xl"
        style={{ top: insets.top + 14 }}
        testID="route-profile-stage"
      >
        <View className="mb-3 flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Indoor route
            </Text>
            <Text className="mt-1 text-xl font-black leading-tight text-foreground">
              {model.progressLabel}
            </Text>
          </View>
        </View>

        {model.profilePoints.length > 1 ? (
          <View
            className="h-44 overflow-hidden rounded-[24px] border border-border bg-background"
            testID="route-elevation-chart"
          >
            <CartesianChart<RouteElevationDatum, "distanceMeters", ChartYKey>
              data={model.profilePoints}
              xKey="distanceMeters"
              yKeys={["elevation"]}
              padding={chartPadding}
              axisOptions={{
                font,
                labelColor: colors.axisLabel,
                lineColor: colors.axisLine,
                lineWidth: 1,
                formatXLabel: (value: unknown) => `${(Number(value) / 1000).toFixed(1)} km`,
                formatYLabel: (value: unknown) => `${Math.round(Number(value))} m`,
              }}
              frame={{ lineColor: colors.frame, lineWidth: 1 }}
            >
              {({ points, chartBounds }) => {
                const chartPoints = points.elevation as unknown as RenderedChartPoint[];
                const renderedPoint = resolveRenderedCurrentPoint({
                  chartBounds,
                  currentPoint: model.currentProfilePoint,
                  points: chartPoints,
                  progressRatio: model.progressRatio,
                });
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
            {model.currentProfilePoint ? (
              <View
                className="absolute h-1 w-1"
                style={{ left: `${model.progressRatio * 100}%`, top: "50%" }}
                testID="route-profile-current-dot"
              />
            ) : null}
            <GradeCue
              chartHeight={176}
              label={model.gradeLabel}
              progressRatio={model.progressRatio}
            />
          </View>
        ) : (
          <DistanceFallback model={model} />
        )}
      </View>
    </View>
  );
}

function GradeCue({
  chartHeight,
  label,
  progressRatio,
}: {
  chartHeight: number;
  label: string;
  progressRatio: number;
}) {
  const leftPercent = clamp(progressRatio * 100, 8, 74);

  return (
    <View
      className="absolute rounded-full border border-border bg-card px-3 py-1.5"
      style={{ left: `${leftPercent}%`, top: chartHeight * 0.08 }}
      testID="route-profile-grade-cue"
    >
      <Text className="text-xs font-black text-foreground">{label}</Text>
    </View>
  );
}

function DistanceFallback({ model }: { model: RouteBackdropViewModel }) {
  return (
    <View
      className="h-44 justify-center rounded-[24px] border border-border bg-background p-4"
      testID="route-distance-fallback"
    >
      <Text className="text-sm font-semibold text-foreground">Distance route</Text>
      <Text className="mt-2 text-xs leading-5 text-muted-foreground">
        Elevation data is not available, so progress follows the route distance.
      </Text>
      <View className="relative mt-8 h-2 overflow-visible rounded-full bg-muted">
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
