/**
 * useSimplifiedMetrics - React hook for accessing clean, structured metrics
 *
 * This hook provides a simpler API than the raw LiveMetricsManager,
 * with zone arrays that match the database schema and a cleaner structure.
 *
 * @example
 * ```tsx
 * function RecordingScreen() {
 *   const service = useSharedActivityRecorder();
 *   const metrics = useSimplifiedMetrics(service);
 *
 *   return (
 *     <View>
 *       <Text>Power: {metrics.current.power}W</Text>
 *       <Text>HR: {metrics.current.heartRate} bpm</Text>
 *       <Text>Distance: {(metrics.totals.distance / 1000).toFixed(2)} km</Text>
 *       <ZoneChart zones={metrics.zones.power} names={POWER_ZONE_NAMES} />
 *     </View>
 *   );
 * }
 * ```
 */

import type {
  ActivityRecorderService,
  SimplifiedMetrics,
} from "@/lib/services/ActivityRecorder";
import { useEffect, useState } from "react";
import { isEqual } from "lodash";

/**
 * Hook to get simplified metrics from ActivityRecorderService
 * Updates automatically when metrics change (via statsUpdate event)
 */
export function useSimplifiedMetrics(
  service: ActivityRecorderService | null,
): SimplifiedMetrics | null {
  const [metrics, setMetrics] = useState<SimplifiedMetrics | null>(null);

  useEffect(() => {
    if (!service) {
      setMetrics(null);
      return;
    }

    // Get initial metrics
    const initialMetrics = service.getSimplifiedMetrics();
    setMetrics(initialMetrics);

    // Subscribe to updates from LiveMetricsManager
    const subscription = service.liveMetricsManager.addListener(
      "statsUpdate",
      () => {
        const updatedMetrics = service.getSimplifiedMetrics();
        setMetrics((prev) => {
          // Deep comparison to prevent unnecessary re-renders
          if (isEqual(prev, updatedMetrics)) return prev;
          return updatedMetrics;
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }, [service]);

  return metrics;
}

/**
 * Hook to get only current sensor readings (updates more frequently)
 * Use this for real-time displays that need 10Hz updates
 */
export function useCurrentReadings(
  service: ActivityRecorderService | null,
): SimplifiedMetrics["current"] | null {
  const [readings, setReadings] = useState<SimplifiedMetrics["current"] | null>(
    null,
  );

  useEffect(() => {
    if (!service) {
      setReadings(null);
      return;
    }

    // Get initial readings
    const initialMetrics = service.getSimplifiedMetrics();
    setReadings(initialMetrics.current);

    // Subscribe to sensor updates (10Hz batched)
    const subscription = service.liveMetricsManager.addListener(
      "sensorUpdate",
      () => {
        const updatedMetrics = service.getSimplifiedMetrics();
        setReadings(updatedMetrics.current);
      },
    );

    return () => {
      subscription.remove();
    };
  }, [service]);

  return readings;
}

/**
 * Hook to get zone distributions with percentages
 * Useful for zone charts and analysis displays
 */
export function useZoneDistribution(service: ActivityRecorderService | null): {
  power: Array<{ zone: number; seconds: number; percentage: number }>;
  hr: Array<{ zone: number; seconds: number; percentage: number }>;
} | null {
  const metrics = useSimplifiedMetrics(service);

  if (!metrics) return null;

  const powerTotal = metrics.zones.power.reduce((sum, time) => sum + time, 0);
  const hrTotal = metrics.zones.hr.reduce((sum, time) => sum + time, 0);

  return {
    power: metrics.zones.power.map((seconds, index) => ({
      zone: index,
      seconds,
      percentage: powerTotal > 0 ? (seconds / powerTotal) * 100 : 0,
    })),
    hr: metrics.zones.hr.map((seconds, index) => ({
      zone: index,
      seconds,
      percentage: hrTotal > 0 ? (seconds / hrTotal) * 100 : 0,
    })),
  };
}

/**
 * Hook to check if advanced metrics are available
 * Use this to conditionally render advanced metric displays
 */
export function useHasAdvancedMetrics(
  service: ActivityRecorderService | null,
): boolean {
  const metrics = useSimplifiedMetrics(service);
  return metrics?.advanced !== undefined;
}
