import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";

import type {
  GpsLocation,
  SensorValues,
  WorkoutMetric,
} from "@/lib/types/workout";
import {
  calculateAveragePace,
  estimateCalories,
  formatAccuracy,
  formatAltitude,
  formatDuration,
  formatPace,
  metersToKm,
} from "@/lib/utils/workout-utils";

interface UseWorkoutMetricsParams {
  duration: number;
  totalDistance: number;
  currentSpeed: number;
  locations: GpsLocation[];
  sensorValues?: SensorValues;
  isRecording: boolean;
  isPaused: boolean;
  isTracking: boolean;
}

export const useWorkoutMetrics = ({
  duration,
  totalDistance,
  currentSpeed,
  locations,
  sensorValues,
  isRecording,
  isPaused,
  isTracking,
}: UseWorkoutMetricsParams): WorkoutMetric[] => {
  return useMemo(() => {
    const currentLocation = locations[locations.length - 1];
    const averagePace = calculateAveragePace(totalDistance, duration);
    const estimatedCalories = estimateCalories(
      duration,
      totalDistance,
      sensorValues?.heartRate,
    );

    const metrics: WorkoutMetric[] = [
      {
        id: "duration",
        title: "Duration",
        value: formatDuration(duration),
        unit: "time",
        icon: "time-outline" as keyof typeof Ionicons.glyphMap,
        isLive: isRecording && !isPaused,
      },
      {
        id: "distance",
        title: "Distance",
        value: metersToKm(totalDistance).toFixed(2),
        unit: "km",
        icon: "navigate-outline" as keyof typeof Ionicons.glyphMap,
        isLive: isTracking,
      },
      {
        id: "pace",
        title: "Current Pace",
        value: formatPace(currentSpeed),
        unit: "/km",
        icon: "speedometer-outline" as keyof typeof Ionicons.glyphMap,
        isLive: isTracking && currentSpeed > 0,
      },
      {
        id: "avgPace",
        title: "Avg Pace",
        value: averagePace,
        unit: "/km",
        icon: "analytics-outline" as keyof typeof Ionicons.glyphMap,
        isLive: false,
      },
      {
        id: "heartRate",
        title: "Heart Rate",
        value: sensorValues?.heartRate?.toString() || "--",
        unit: "bpm",
        icon: "heart-outline" as keyof typeof Ionicons.glyphMap,
        isLive: !!sensorValues?.heartRate,
      },
      {
        id: "calories",
        title: "Calories",
        value: estimatedCalories.toString(),
        unit: "kcal",
        icon: "flame-outline" as keyof typeof Ionicons.glyphMap,
        isLive: isRecording,
      },
      {
        id: "altitude",
        title: "Altitude",
        value: formatAltitude(currentLocation?.altitude),
        unit: "m",
        icon: "trending-up-outline" as keyof typeof Ionicons.glyphMap,
        isLive: isTracking,
      },
      {
        id: "accuracy",
        title: "GPS Accuracy",
        value: formatAccuracy(currentLocation?.accuracy),
        unit: "m",
        icon: "locate-outline" as keyof typeof Ionicons.glyphMap,
        isLive: isTracking,
      },
    ];

    return metrics;
  }, [
    duration,
    totalDistance,
    currentSpeed,
    locations,
    sensorValues,
    isRecording,
    isPaused,
    isTracking,
  ]);
};
