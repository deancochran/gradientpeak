import type { DecompressedStream } from "@/lib/utils/streamDecompression";
import React from "react";
import { StreamChart } from "./StreamChart";

interface MultiMetricChartProps {
  activityType: "run" | "bike" | "swim" | "strength" | "other";
  streams: Map<string, DecompressedStream>;
  title?: string;
  height?: number;
}

/**
 * Intelligently displays multiple metrics based on activity type
 * Automatically selects relevant metrics and colors
 */
export function MultiMetricChart({
  activityType,
  streams,
  title,
  height = 300,
}: MultiMetricChartProps) {
  // Define metric configurations for each activity type
  const getMetricConfig = () => {
    const configs: {
      [key: string]: Array<{
        type: string;
        color: string;
        label: string;
        unit: string;
        yAxis?: "left" | "right";
      }>;
    } = {
      run: [
        {
          type: "speed",
          color: "#3b82f6",
          label: "Pace",
          unit: "min/km",
          yAxis: "left",
        },
        {
          type: "heartrate",
          color: "#ef4444",
          label: "Heart Rate",
          unit: "bpm",
          yAxis: "right",
        },
        {
          type: "cadence",
          color: "#8b5cf6",
          label: "Cadence",
          unit: "spm",
          yAxis: "left",
        },
      ],
      bike: [
        {
          type: "power",
          color: "#eab308",
          label: "Power",
          unit: "W",
          yAxis: "left",
        },
        {
          type: "heartrate",
          color: "#ef4444",
          label: "Heart Rate",
          unit: "bpm",
          yAxis: "right",
        },
        {
          type: "speed",
          color: "#3b82f6",
          label: "Speed",
          unit: "km/h",
          yAxis: "left",
        },
      ],
      swim: [
        {
          type: "speed",
          color: "#3b82f6",
          label: "Pace",
          unit: "min/100m",
          yAxis: "left",
        },
        {
          type: "cadence",
          color: "#8b5cf6",
          label: "Stroke Rate",
          unit: "spm",
          yAxis: "right",
        },
      ],
      strength: [
        {
          type: "heartrate",
          color: "#ef4444",
          label: "Heart Rate",
          unit: "bpm",
          yAxis: "left",
        },
      ],
      other: [
        {
          type: "heartrate",
          color: "#ef4444",
          label: "Heart Rate",
          unit: "bpm",
          yAxis: "left",
        },
        {
          type: "power",
          color: "#eab308",
          label: "Power",
          unit: "W",
          yAxis: "right",
        },
      ],
    };

    return configs[activityType] || configs.other;
  };

  // Filter to only include metrics that have data
  const metricsConfig = getMetricConfig();
  const availableMetrics = metricsConfig
    .filter((config) => streams.has(config.type))
    .map((config) => ({
      ...config,
      stream: streams.get(config.type)!,
    }));

  if (availableMetrics.length === 0) {
    return null;
  }

  // Generate title if not provided
  const chartTitle =
    title ||
    `${availableMetrics.map((m) => m.label).join(" & ")} Over Time`;

  return (
    <StreamChart
      title={chartTitle}
      streams={availableMetrics}
      xAxisType="time"
      height={height}
      showLegend={true}
    />
  );
}
