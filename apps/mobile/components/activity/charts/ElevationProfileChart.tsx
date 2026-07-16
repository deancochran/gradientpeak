import {
  defaultPreferredUnitSystem,
  displayUnitLabel,
  type PreferredUnitSystem,
  toDisplayUnitValue,
} from "@repo/core/units";
import { ChartCard, ChartEmptyState } from "@repo/ui/components/chart";
import { LinearGradient, useFont, vec } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { View } from "react-native";
import { Area, CartesianChart, useChartPressState, useChartTransformState } from "victory-native";
import { InteractiveChartValueTray } from "@/components/charts/InteractiveChartValueTray";
import { buildElevationProfilePoints } from "@/lib/charts/elevationProfile";
import { useTheme } from "@/lib/stores/theme-store";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

function displayElevation(meters: number, preferredUnitSystem: PreferredUnitSystem) {
  const displayValue = toDisplayUnitValue(
    { dimension: "elevation", value: meters, unit: "meters" },
    preferredUnitSystem,
  );

  return `${displayValue.value.toFixed(0)} ${displayUnitLabel(displayValue.unit)}`;
}

function accessibleElevation(meters: number, preferredUnitSystem: PreferredUnitSystem) {
  const displayValue = toDisplayUnitValue(
    { dimension: "elevation", value: meters, unit: "meters" },
    preferredUnitSystem,
  );
  const unit = displayValue.unit === "feet" ? "feet" : "meters";

  return `${displayValue.value.toFixed(0)} ${unit}`;
}

function displayDistance(kilometers: number, preferredUnitSystem: PreferredUnitSystem) {
  const displayValue = toDisplayUnitValue(
    { dimension: "distance", value: kilometers * 1_000, unit: "meters" },
    preferredUnitSystem,
  );

  return `${displayValue.value.toFixed(1)} ${displayUnitLabel(displayValue.unit)}`;
}

interface ElevationProfileChartProps {
  elevationStream: DecompressedStream;
  distanceStream?: DecompressedStream;
  title?: string;
  height?: number;
  showStats?: boolean;
  showHeader?: boolean;
  preferredUnitSystem?: PreferredUnitSystem;
}

export function ElevationProfileChart({
  elevationStream,
  distanceStream,
  title = "Elevation Profile",
  height = 200,
  showStats = true,
  showHeader = true,
  preferredUnitSystem = defaultPreferredUnitSystem,
}: ElevationProfileChartProps) {
  const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 12);
  const { state, isActive } = useChartPressState({ x: 0, y: { elevation: 0 } });
  const { state: transformState } = useChartTransformState();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Prepare chart data
  const { chartData, stats } = useMemo(() => {
    const elevationValues = (elevationStream.values as unknown[]).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    const data = buildElevationProfilePoints(elevationStream, distanceStream);

    // Calculate stats
    const totalAscent = elevationValues.reduce((sum, val, i) => {
      if (i === 0) return 0;
      const diff = val - elevationValues[i - 1];
      return sum + (diff > 0 ? diff : 0);
    }, 0);

    const totalDescent = elevationValues.reduce((sum, val, i) => {
      if (i === 0) return 0;
      const diff = val - elevationValues[i - 1];
      return sum + (diff < 0 ? Math.abs(diff) : 0);
    }, 0);

    const minElevation = elevationValues.length > 0 ? Math.min(...elevationValues) : 0;
    const maxElevation = elevationValues.length > 0 ? Math.max(...elevationValues) : 0;

    return {
      chartData: data,
      stats: {
        totalAscent: Math.round(totalAscent),
        totalDescent: Math.round(totalDescent),
        minElevation: Math.round(minElevation),
        maxElevation: Math.round(maxElevation),
      },
    };
  }, [elevationStream, distanceStream]);

  const summary = [
    { label: "Ascent", value: `${displayElevation(stats.totalAscent, preferredUnitSystem)} ↗` },
    { label: "Descent", value: `${displayElevation(stats.totalDescent, preferredUnitSystem)} ↘` },
    {
      label: "Range",
      value: `${displayElevation(stats.minElevation, preferredUnitSystem)} - ${displayElevation(
        stats.maxElevation,
        preferredUnitSystem,
      )}`,
    },
  ];
  const accessibilityLabel = `${title}. Ascent ${accessibleElevation(
    stats.totalAscent,
    preferredUnitSystem,
  )}. Descent ${accessibleElevation(stats.totalDescent, preferredUnitSystem)}. Elevation range ${accessibleElevation(
    stats.minElevation,
    preferredUnitSystem,
  )} to ${accessibleElevation(stats.maxElevation, preferredUnitSystem)}.`;

  if (chartData.length === 0) {
    const emptyState = (
      <View style={{ height }}>
        <ChartEmptyState message="No elevation data available" />
      </View>
    );
    return showHeader ? <ChartCard title={title}>{emptyState}</ChartCard> : emptyState;
  }

  const chartContent = (
    <>
      <View
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {font && (
          <CartesianChart
            data={chartData}
            xKey="x"
            yKeys={["elevation"]}
            axisOptions={{
              font,
              labelColor: isDark ? "#a3a3a3" : "#525252",
              lineColor: isDark ? "rgba(64,64,64,0.7)" : "rgba(212,212,212,0.85)",
              lineWidth: 1,
              formatXLabel: (value) =>
                distanceStream
                  ? displayDistance(value, preferredUnitSystem)
                  : `${Math.floor(value / 60)}m`,
              formatYLabel: (value) => displayElevation(value, preferredUnitSystem),
            }}
            chartPressState={state}
            transformState={transformState}
          >
            {({ points, chartBounds }) => (
              <Area
                points={points.elevation}
                y0={chartBounds.bottom}
                animate={{ type: "timing", duration: 300 }}
                curveType="natural"
              >
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={["#10b981", "#10b98160", "#10b98110"]}
                />
              </Area>
            )}
          </CartesianChart>
        )}
      </View>

      {isActive ? (
        <InteractiveChartValueTray
          testID="elevation-profile-active-values"
          items={[
            {
              key: "x",
              label: distanceStream ? "Distance" : "Time",
              value: distanceStream
                ? displayDistance(state.x.value.value, preferredUnitSystem)
                : `${Math.floor(state.x.value.value / 60)}m ${Math.floor(state.x.value.value % 60)}s`,
            },
            {
              key: "elevation",
              label: "Elevation",
              value: displayElevation(state.y.elevation.value.value, preferredUnitSystem),
              color: "#10b981",
            },
          ]}
        />
      ) : null}
    </>
  );

  return showHeader ? (
    <ChartCard title={title} summary={showStats ? summary : undefined}>
      {chartContent}
    </ChartCard>
  ) : (
    chartContent
  );
}
