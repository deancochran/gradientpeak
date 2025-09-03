import { useMemo } from "react";
import type { SensorValues } from "./useBluetooth";

const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
};

export type WorkoutMetric = {
  id: string;
  title: string;
  value: string | number;
  unit: string;
  icon: string;
  isLive: boolean;
};

export const useWorkoutMetrics = (
  duration: number,
  sensorValues: SensorValues | undefined,
): WorkoutMetric[] => {
  return useMemo(() => {
    // Calculate derived values once
    const heartRate = sensorValues?.heartRate;
    const power = sensorValues?.power;
    const cadence = sensorValues?.cadence;

    // Calculate average heart rate (simplified - in real app you'd track over time)
    const avgHeartRate = heartRate ? Math.floor(heartRate * 0.95) : null;

    // Calculate calories based on heart rate and duration
    const calories = heartRate
      ? Math.floor(duration * 0.15 * (heartRate / 100))
      : Math.floor(duration * 0.1);

    return [
      {
        id: "duration",
        title: "Duration",
        value: formatDuration(duration),
        unit: "time",
        icon: "time-outline",
        isLive: false,
      },
      {
        id: "heartRate",
        title: "Heart Rate",
        value: heartRate?.toString() || "--",
        unit: "bpm",
        icon: "heart-outline",
        isLive: !!heartRate,
      },
      {
        id: "power",
        title: "Power",
        value: power?.toString() || "--",
        unit: "watts",
        icon: "flash-outline",
        isLive: !!power,
      },
      {
        id: "cadence",
        title: "Cadence",
        value: cadence?.toString() || "--",
        unit: "rpm",
        icon: "refresh-outline",
        isLive: !!cadence,
      },
      {
        id: "avgHeartRate",
        title: "Avg HR",
        value: avgHeartRate?.toString() || "--",
        unit: "bpm",
        icon: "analytics-outline",
        isLive: false,
      },
      {
        id: "calories",
        title: "Calories",
        value: calories,
        unit: "kcal",
        icon: "flame-outline",
        isLive: false,
      },
    ];
  }, [duration, sensorValues?.heartRate, sensorValues?.power, sensorValues?.cadence]);
};

// Optional: Hook for individual metric calculations if needed
export const useWorkoutStats = (
  duration: number,
  sensorValues: SensorValues | undefined,
) => {
  return useMemo(() => {
    const heartRate = sensorValues?.heartRate;
    const power = sensorValues?.power;
    const cadence = sensorValues?.cadence;

    return {
      duration: formatDuration(duration),
      heartRate: heartRate || null,
      power: power || null,
      cadence: cadence || null,
      avgHeartRate: heartRate ? Math.floor(heartRate * 0.95) : null,
      calories: heartRate
        ? Math.floor(duration * 0.15 * (heartRate / 100))
        : Math.floor(duration * 0.1),
      hasLiveSensors: !!(heartRate || power || cadence),
      connectedSensorCount: [heartRate, power, cadence].filter(Boolean).length,
    };
  }, [duration, sensorValues?.heartRate, sensorValues?.power, sensorValues?.cadence]);
};
