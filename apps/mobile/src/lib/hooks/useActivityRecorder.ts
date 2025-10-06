/**
 * useActivityRecorder Hook
 *
 * Simple hook to create and manage a single ActivityRecorderService instance.
 * Replaces the overcomplicated ActivityRecorderServiceManager singleton.
 *
 * Usage:
 * ```
 * const service = useActivityRecorder(profile);
 *
 * // Access managers directly
 * const sensors = service.sensorsManager.getConnectedSensors();
 * await service.sensorsManager.scan();
 *
 * // Subscribe to events
 * useEffect(() => {
 *   const handleStateChange = (state) => console.log('State:', state);
 *   service.on('stateChanged', handleStateChange);
 *   return () => service.off('stateChanged', handleStateChange);
 * }, [service]);
 * ```
 */

import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PublicProfilesRow } from "@repo/core";
import { useEffect, useMemo, useState } from "react";

export function useActivityRecorder(profile: PublicProfilesRow | null) {
  // Create service instance once per profile
  const service = useMemo(() => {
    if (!profile) return null;
    console.log("[useActivityRecorder] Creating new service instance");
    return new ActivityRecorderService(profile);
  }, [profile?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (service) {
        console.log("[useActivityRecorder] Cleaning up service on unmount");
        service.cleanup();
      }
    };
  }, [service]);

  return service;
}

/**
 * Hook to subscribe to specific service events
 *
 * Usage:
 * ```
 * const service = useActivityRecorder(profile);
 * const [state, setState] = useState(service?.state);
 *
 * useServiceEvent(service, 'stateChanged', (newState) => {
 *   setState(newState);
 * });
 * ```
 */
export function useServiceEvent<T = any>(
  service: ActivityRecorderService | null,
  event: string,
  handler: (data: T) => void,
) {
  useEffect(() => {
    if (!service) return;

    service.on(event, handler);
    return () => {
      service.off(event, handler);
    };
  }, [service, event, handler]);
}

/**
 * Hook to get current recording state with automatic updates
 */
export function useRecordingState(service: ActivityRecorderService | null) {
  const [state, setState] = useState(service?.state ?? "pending");

  useEffect(() => {
    if (!service) return;

    const handleStateChange = (newState: typeof service.state) => {
      setState(newState);
    };

    service.on("stateChanged", handleStateChange);
    return () => {
      service.off("stateChanged", handleStateChange);
    };
  }, [service]);

  return state;
}

/**
 * Hook to get live metrics with automatic updates
 */
export function useLiveMetrics(service: ActivityRecorderService | null) {
  const [metrics, setMetrics] = useState(
    service?.liveMetricsManager.getMetrics() ?? null,
  );

  useEffect(() => {
    if (!service) return;

    const handleMetricsUpdate = (event: any) => {
      setMetrics(event.metrics);
    };

    service.liveMetricsManager.on("metricsUpdate", handleMetricsUpdate);
    return () => {
      service.liveMetricsManager.off("metricsUpdate", handleMetricsUpdate);
    };
  }, [service]);

  return metrics;
}

/**
 * Hook to get connected sensors with automatic updates
 */
export function useConnectedSensors(service: ActivityRecorderService | null) {
  const [sensors, setSensors] = useState(
    service?.sensorsManager.getConnectedSensors() ?? [],
  );

  useEffect(() => {
    if (!service) return;

    const handleSensorsChange = (updatedSensors: any[]) => {
      setSensors(updatedSensors);
    };

    service.on("sensorsChanged", handleSensorsChange);
    return () => {
      service.off("sensorsChanged", handleSensorsChange);
    };
  }, [service]);

  return sensors;
}

/**
 * Hook to get plan progress with automatic updates
 */
export function usePlanProgress(service: ActivityRecorderService | null) {
  const [progress, setProgress] = useState(
    service?.planManager?.planProgress ?? null,
  );

  useEffect(() => {
    if (!service) return;

    const handleProgressChange = (newProgress: any) => {
      setProgress(newProgress);
    };

    service.on("planProgressChanged", handleProgressChange);
    return () => {
      service.off("planProgressChanged", handleProgressChange);
    };
  }, [service]);

  return progress;
}
