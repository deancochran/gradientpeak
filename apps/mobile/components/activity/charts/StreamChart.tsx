import { downsampleStream, getSamplingStrategy } from "@repo/core";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { Circle, useFont } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { View } from "react-native";
import { CartesianChart, Line, useChartPressState } from "victory-native";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

type NumericStream = Omit<DecompressedStream, "values"> & {
  values: Array<number | null | undefined>;
};

interface StreamData {
  type: string;
  stream: DecompressedStream | NumericStream;
  color: string;
  label: string;
  unit: string;
  yAxis?: "left" | "right";
}

type ChartDatum = { x: number; [key: string]: number | null };

function getGapThreshold(timestamps: number[]): number {
  const deltas = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - (timestamps[index] ?? timestamp))
    .filter((delta) => Number.isFinite(delta) && delta > 0)
    .sort((a, b) => a - b);

  if (deltas.length === 0) return 5000;

  const medianDelta = deltas[Math.floor(deltas.length / 2)] ?? 1000;
  return Math.max(5000, medianDelta * 3);
}

function downsampleNullableStream(
  values: Array<number | null | undefined>,
  timestamps: number[],
  type: string,
) {
  const sampledValues: Array<number | null> = [];
  const sampledTimestamps: number[] = [];
  const strategy = getSamplingStrategy(type);
  let segmentValues: number[] = [];
  let segmentTimestamps: number[] = [];

  const flushSegment = () => {
    if (segmentValues.length === 0) return;
    const sampled = downsampleStream(segmentValues, segmentTimestamps, 500, strategy);
    sampledValues.push(...sampled.values);
    sampledTimestamps.push(...sampled.timestamps);
    segmentValues = [];
    segmentTimestamps = [];
  };

  values.forEach((value, index) => {
    const timestamp = timestamps[index];
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return;

    if (typeof value === "number" && Number.isFinite(value)) {
      segmentValues.push(value);
      segmentTimestamps.push(timestamp);
      return;
    }

    flushSegment();
    sampledValues.push(null);
    sampledTimestamps.push(timestamp);
  });

  flushSegment();

  return { values: sampledValues, timestamps: sampledTimestamps };
}

interface StreamChartProps {
  title: string;
  streams: StreamData[];
  xAxisType?: "time" | "distance";
  height?: number;
  showLegend?: boolean;
}

export function StreamChart({
  title,
  streams,
  xAxisType = "time",
  height = 250,
  showLegend = true,
}: StreamChartProps) {
  const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 12);
  const { state, isActive } = useChartPressState({ x: 0, y: {} });

  // Prepare chart data
  const chartData = useMemo(() => {
    if (streams.length === 0) return [];

    // Process each stream without erasing nulls; nulls tell Victory to break line segments.
    const processedStreams = streams.map((streamData) => {
      const stream = streamData.stream;
      const numericValues = (stream.values as unknown[]).map((value) =>
        typeof value === "number" ? value : null,
      );
      const { values: sampledValues, timestamps: sampledTimestamps } = downsampleNullableStream(
        numericValues,
        stream.timestamps,
        stream.type,
      );

      return {
        ...streamData,
        values: sampledValues,
        timestamps: sampledTimestamps,
      };
    });

    // Get the reference stream (first one) for x-axis
    const referenceStream = processedStreams[0];
    const startTime = referenceStream.timestamps[0] || 0;

    // Build data points aligned by timestamp
    // Create a map of timestamp -> point for efficient lookup
    const pointMap = new Map<number, ChartDatum>();

    // Add all points from reference stream
    const gapThreshold = getGapThreshold(referenceStream.timestamps);
    let previousTimestamp: number | null = null;

    referenceStream.timestamps.forEach((timestamp, i) => {
      if (previousTimestamp !== null && timestamp - previousTimestamp > gapThreshold) {
        const gapTimestamp = previousTimestamp + 1;
        pointMap.set(gapTimestamp, {
          x: (gapTimestamp - startTime) / 1000,
          [referenceStream.type]: null,
        });
      }

      const relativeTime = (timestamp - startTime) / 1000; // Convert to seconds
      pointMap.set(timestamp, {
        x: relativeTime,
        [referenceStream.type]: referenceStream.values[i] ?? null,
      });
      previousTimestamp = timestamp;
    });

    // Add data from other streams, interpolating to nearest timestamp
    processedStreams.slice(1).forEach((streamData) => {
      streamData.timestamps.forEach((timestamp, i) => {
        const relativeTime = (timestamp - startTime) / 1000;

        // Find closest point in reference stream
        let closestTimestamp = referenceStream.timestamps[0];
        let minDiff = Math.abs(timestamp - closestTimestamp);

        for (const refTimestamp of referenceStream.timestamps) {
          const diff = Math.abs(timestamp - refTimestamp);
          if (diff < minDiff) {
            minDiff = diff;
            closestTimestamp = refTimestamp;
          }
        }

        // Add value to existing point or create new one if within 1 second
        if (minDiff < 1000) {
          // Within 1 second
          const point = pointMap.get(closestTimestamp);
          if (point) {
            point[streamData.type] = streamData.values[i];
          }
        }
      });
    });

    // Convert map to array and sort by x
    return Array.from(pointMap.values()).sort((a, b) => a.x - b.x);
  }, [streams]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <View style={{ height }} className="items-center justify-center bg-muted rounded-lg">
            <Text className="text-muted-foreground">No data available</Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {showLegend && (
          <View className="flex-row flex-wrap gap-3 mt-2">
            {streams.map((stream) => (
              <View key={stream.type} className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full" style={{ backgroundColor: stream.color }} />
                <Text className="text-xs text-muted-foreground">{stream.label}</Text>
              </View>
            ))}
          </View>
        )}
      </CardHeader>
      <CardContent>
        <View style={{ height }}>
          {font && (
            <CartesianChart
              data={chartData}
              xKey="x"
              yKeys={streams.map((s) => s.stream.type)}
              axisOptions={{
                font,
                formatXLabel: (value) => {
                  if (xAxisType === "time") {
                    const minutes = Math.floor(value / 60);
                    return `${minutes}m`;
                  }
                  return `${value.toFixed(1)}km`;
                },
              }}
              chartPressState={state}
            >
              {({ points, chartBounds }) => (
                <>
                  {streams.map((stream) => (
                    <Line
                      key={stream.type}
                      points={points[stream.type]}
                      color={stream.color}
                      strokeWidth={2}
                      connectMissingData={false}
                      animate={{ type: "timing", duration: 300 }}
                    />
                  ))}
                  {isActive && (
                    <>
                      {streams.map((stream) => {
                        const point = (state.y as any)[stream.type];
                        if (!point) return null;
                        return (
                          <Circle
                            key={`active-${stream.type}`}
                            cx={state.x.position}
                            cy={point.position}
                            r={6}
                            color={stream.color}
                            opacity={0.8}
                          />
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </CartesianChart>
          )}
        </View>

        {/* Active value display */}
        {isActive && (
          <View className="mt-2 p-2 bg-muted rounded-lg">
            <View className="flex-row flex-wrap gap-3">
              {streams.map((stream) => {
                const value = (state.y as any)[stream.type]?.value;
                return (
                  <View key={stream.type} className="flex-row items-center gap-1">
                    <Text className="text-xs font-medium">{stream.label}:</Text>
                    <Text className="text-xs">
                      {value?.toFixed(0)} {stream.unit}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
