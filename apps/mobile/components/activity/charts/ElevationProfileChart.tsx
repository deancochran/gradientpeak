import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";
import { downsampleStream, removeNullValues } from "@/lib/utils/streamSampling";
import { CartesianChart, Area, useChartPressState } from "victory-native";
import { LinearGradient, useFont, vec } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { View } from "react-native";

interface ElevationProfileChartProps {
  elevationStream: DecompressedStream;
  distanceStream?: DecompressedStream;
  title?: string;
  height?: number;
  showStats?: boolean;
}

export function ElevationProfileChart({
  elevationStream,
  distanceStream,
  title = "Elevation Profile",
  height = 200,
  showStats = true,
}: ElevationProfileChartProps) {
  const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 12);
  const { state, isActive } = useChartPressState({ x: 0, y: { elevation: 0 } });

  // Prepare chart data
  const { chartData, stats } = useMemo(() => {
    const { values: elevationValues, timestamps } = removeNullValues(
      elevationStream.values as number[],
      elevationStream.timestamps,
    );

    // Downsample for performance
    const { values: sampledElevation, timestamps: sampledTimestamps } =
      downsampleStream(elevationValues, timestamps, 500, "avg");

    // Calculate distance if not provided
    let xValues: number[];
    if (distanceStream) {
      const { values: distanceValues, timestamps: distanceTimestamps } =
        removeNullValues(
          distanceStream.values as number[],
          distanceStream.timestamps,
        );
      const { values: sampledDistance } = downsampleStream(
        distanceValues,
        distanceTimestamps,
        500,
        "max",
      );
      // Convert to km
      xValues = sampledDistance.map((d) => d / 1000);
    } else {
      // Use time-based x-axis (seconds from start)
      const startTime = sampledTimestamps[0] || 0;
      xValues = sampledTimestamps.map((t) => (t - startTime) / 1000);
    }

    // Ensure x and elevation arrays are same length
    const minLength = Math.min(xValues.length, sampledElevation.length);
    const data = Array.from({ length: minLength }, (_, i) => ({
      x: xValues[i],
      elevation: sampledElevation[i],
    }));

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

    const minElevation = Math.min(...elevationValues);
    const maxElevation = Math.max(...elevationValues);

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

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <View
            style={{ height }}
            className="items-center justify-center bg-muted rounded-lg"
          >
            <Text className="text-muted-foreground">
              No elevation data available
            </Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {showStats && (
          <View className="flex-row gap-4 mt-2">
            <View>
              <Text className="text-xs text-muted-foreground">Ascent</Text>
              <Text className="text-sm font-semibold">
                {stats.totalAscent}m ↗
              </Text>
            </View>
            <View>
              <Text className="text-xs text-muted-foreground">Descent</Text>
              <Text className="text-sm font-semibold">
                {stats.totalDescent}m ↘
              </Text>
            </View>
            <View>
              <Text className="text-xs text-muted-foreground">Range</Text>
              <Text className="text-sm font-semibold">
                {stats.minElevation} - {stats.maxElevation}m
              </Text>
            </View>
          </View>
        )}
      </CardHeader>
      <CardContent>
        <View style={{ height }}>
          {font && (
            <CartesianChart
              data={chartData}
              xKey="x"
              yKeys={["elevation"]}
              axisOptions={{
                font,
                formatXLabel: (value) =>
                  distanceStream
                    ? `${value.toFixed(1)}km`
                    : `${Math.floor(value / 60)}m`,
                formatYLabel: (value) => `${value.toFixed(0)}m`,
              }}
              chartPressState={state}
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

        {/* Active value display */}
        {isActive && (
          <View className="mt-2 p-2 bg-muted rounded-lg">
            <Text className="text-sm">
              {distanceStream ? "Distance" : "Time"}:{" "}
              {distanceStream
                ? `${state.x.value.value.toFixed(2)} km`
                : `${Math.floor(state.x.value.value / 60)}m ${Math.floor(state.x.value.value % 60)}s`}{" "}
              • Elevation: {state.y.elevation.value.value.toFixed(0)}m
            </Text>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
