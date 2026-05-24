import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { RouteElevationProfile } from "../RouteElevationBackdrop";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

export function RouteProgressInsightCard({ mode, service, stats }: InsightCardProps) {
  const recordedDistanceMeters = stats.distance ?? 0;
  const routeDistanceMeters = service?.routeDistance ?? 0;
  const routeProgress = service?.routeProgress ?? 0;
  const gpsEnabled = service?.isGpsRecordingEnabled?.() ?? true;
  const routePositionActive = !gpsEnabled || (service?.isOnRoute ?? false);
  const routeName = service?.currentRoute?.name ?? "Attached route";
  const rawCurrentRouteDistanceMeters = routePositionActive
    ? (service?.currentRouteDistance ?? recordedDistanceMeters)
    : 0;
  const currentRouteDistanceMeters =
    routePositionActive && routeDistanceMeters > 0
      ? Math.min(routeDistanceMeters, Math.max(0, rawCurrentRouteDistanceMeters))
      : rawCurrentRouteDistanceMeters;
  const remainingMeters = Math.max(0, routeDistanceMeters - currentRouteDistanceMeters);
  const distanceLabel = routePositionActive
    ? `${(currentRouteDistanceMeters / 1000).toFixed(2)} km`
    : "--";
  const remainingLabel =
    routePositionActive && routeDistanceMeters > 0
      ? `${(remainingMeters / 1000).toFixed(1)} km`
      : "--";
  const progressLabel =
    routeDistanceMeters > 0 ? `${Math.round(clamp(routeProgress, 0, 100))}%` : "--";
  const grade = service?.currentRouteGrade ?? 0;
  const gradeLabel = routePositionActive ? formatGrade(grade) : "--";
  const showProgressIndicator = !gpsEnabled && routeDistanceMeters > 0;

  if (mode === "compact") {
    return (
      <View className="h-full justify-between gap-2" testID="route-progress-insight-card">
        <View className="flex-row items-center justify-between gap-3 px-1">
          <CompactMetric label="Distance" value={distanceLabel} />
          <CompactMetric label="Remaining" value={remainingLabel} />
          <CompactMetric label="Grade" value={gradeLabel} />
        </View>
        <RouteElevationProfile className="min-h-0 flex-1" service={service} variant="compact" />
        {showProgressIndicator ? <ProgressBar progress={routeProgress} /> : null}
      </View>
    );
  }

  return (
    <View className="min-h-full gap-5" testID="route-progress-insight-card">
      <View className="min-h-[420px] flex-1 rounded-[34px] bg-card px-1 py-2">
        <View className="mb-4 flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1 px-4 pt-3">
            <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
              Route profile
            </Text>
            <Text
              className="mt-1 text-2xl font-black leading-tight text-foreground"
              numberOfLines={1}
            >
              {routeName}
            </Text>
            {routeDistanceMeters > 0 ? (
              <Text className="mt-1 text-sm font-semibold text-muted-foreground" numberOfLines={1}>
                {routePositionActive
                  ? `${formatDistance(currentRouteDistanceMeters)} / ${formatDistance(routeDistanceMeters)}`
                  : formatDistance(routeDistanceMeters)}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="mb-3 flex-row gap-3 px-1">
          <MetricTile label="Distance" value={distanceLabel} />
          <MetricTile label="Remaining" value={remainingLabel} />
          <MetricTile label="Grade" value={gradeLabel} />
          {showProgressIndicator ? <MetricTile label="Progress" value={progressLabel} /> : null}
        </View>
        <RouteElevationProfile className="min-h-0 flex-1" service={service} showHeader={false} />
      </View>
      {showProgressIndicator ? <ProgressBar progress={routeProgress} /> : null}
    </View>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 items-center">
      <Text
        className="text-center text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        className="mt-0.5 text-center text-base font-black leading-tight text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-muted">
      <View
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </View>
  );
}

function formatGrade(grade: number) {
  if (!Number.isFinite(grade) || Math.abs(grade) < 0.05) return "0.0%";
  return `${grade > 0 ? "+" : ""}${grade.toFixed(1)}%`;
}

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
