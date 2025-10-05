import { useEffect, useState, useCallback, useRef } from "react";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  LiveMetricsState,
  LiveMetricsError,
  PerformanceStats,
} from "@/lib/services/ActivityRecorder/types";
import {
  HeartRateMetrics,
  PowerMetrics,
  AnalysisMetrics,
  DistanceMetrics,
  ElevationMetrics,
  CadenceMetrics,
  EnvironmentalMetrics,
  MetricsSummary,
} from "@/lib/services/ActivityRecorder/types";
import {
  RECORDING_CONFIG,
  roundToPrecision,
} from "@/lib/services/ActivityRecorder/config";

// ================================
// Core Live Metrics Hook
// ================================

export interface UseLiveMetricsReturn {
  metrics: LiveMetricsState | null;
  isLoading: boolean;
  error: LiveMetricsError | null;
  performance: PerformanceStats | null;
  isRecording: boolean;
}

/**
 * Subscribe to comprehensive live metrics updates
 * Optimized for 1Hz updates with minimal re-renders
 */
export function useLiveMetrics(
  service: ActivityRecorderService | null,
): UseLiveMetricsReturn {
  const [metrics, setMetrics] = useState<LiveMetricsState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LiveMetricsError | null>(null);
  const [performance, setPerformance] = useState<PerformanceStats | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!service?.liveMetricsManager) {
      setMetrics(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Initial values
    const initialMetrics = service.liveMetricsManager.getMetrics();
    const initialPerf = service.liveMetricsManager.getPerformanceStats();
    const initialState = service.liveMetricsManager.getState();

    setMetrics(initialMetrics);
    setPerformance(initialPerf);
    setIsRecording(initialState === "active" || initialState === "paused");
    setIsLoading(false);

    // Subscribe to metrics updates
    const handleMetricsUpdate = (updateEvent: any) => {
      setMetrics(updateEvent.metrics);
      setError(null); // Clear error on successful update
    };

    // Subscribe to recording state changes
    const handleStateChange = () => {
      const state = service.liveMetricsManager!.getState();
      setIsRecording(state === "active" || state === "paused");

      // Update performance stats periodically
      const perf = service.liveMetricsManager!.getPerformanceStats();
      setPerformance(perf);
    };

    // Subscribe to errors
    const handleError = (errorEvent: LiveMetricsError) => {
      setError(errorEvent);
    };

    // Event listeners
    service.liveMetricsManager.on("metricsUpdate", handleMetricsUpdate);
    service.liveMetricsManager.on("recordingStarted", handleStateChange);
    service.liveMetricsManager.on("recordingPaused", handleStateChange);
    service.liveMetricsManager.on("recordingResumed", handleStateChange);
    service.liveMetricsManager.on("recordingFinished", handleStateChange);
    service.liveMetricsManager.on("error", handleError);

    return () => {
      if (service.liveMetricsManager) {
        service.liveMetricsManager.off("metricsUpdate", handleMetricsUpdate);
        service.liveMetricsManager.off("recordingStarted", handleStateChange);
        service.liveMetricsManager.off("recordingPaused", handleStateChange);
        service.liveMetricsManager.off("recordingResumed", handleStateChange);
        service.liveMetricsManager.off("recordingFinished", handleStateChange);
        service.liveMetricsManager.off("error", handleError);
      }
    };
  }, [service]);

  return {
    metrics,
    isLoading,
    error,
    performance,
    isRecording,
  };
}

// ================================
// Optimized Metric-Specific Hooks
// ================================

/**
 * Subscribe to power-related metrics with precision control
 */
export function usePowerMetrics(
  service: ActivityRecorderService | null,
): PowerMetrics | null {
  const [powerMetrics, setPowerMetrics] = useState<PowerMetrics | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;
      const now = Date.now();

      // Throttle updates to prevent excessive re-renders
      if (now - lastUpdateRef.current < 500) return; // 500ms throttle
      lastUpdateRef.current = now;

      const current = service.liveMetrics.get("power");

      setPowerMetrics({
        current,
        avg: roundToPrecision(metrics.avgPower, "power"),
        max: metrics.maxPower,
        normalized: roundToPrecision(
          metrics.normalizedPowerEst,
          "normalizedPower",
        ),
        totalWork: Math.round(metrics.totalWork),
        zones: {
          z1: metrics.powerZone1Time,
          z2: metrics.powerZone2Time,
          z3: metrics.powerZone3Time,
          z4: metrics.powerZone4Time,
          z5: metrics.powerZone5Time,
          z6: metrics.powerZone6Time,
          z7: metrics.powerZone7Time,
        },
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return powerMetrics;
}

/**
 * Subscribe to heart rate metrics with zone information
 */
export function useHeartRateMetrics(
  service: ActivityRecorderService | null,
): HeartRateMetrics | null {
  const [hrMetrics, setHrMetrics] = useState<HeartRateMetrics | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;
      const now = Date.now();

      // Throttle updates
      if (now - lastUpdateRef.current < 1000) return; // 1s throttle for HR
      lastUpdateRef.current = now;

      const current = service.liveMetrics.get("heartrate");

      setHrMetrics({
        current,
        avg: roundToPrecision(metrics.avgHeartRate, "heartRate"),
        max: metrics.maxHeartRate,
        maxPctThreshold: roundToPrecision(
          metrics.maxHrPctThreshold,
          "heartRate",
        ),
        zones: {
          z1: metrics.hrZone1Time,
          z2: metrics.hrZone2Time,
          z3: metrics.hrZone3Time,
          z4: metrics.hrZone4Time,
          z5: metrics.hrZone5Time,
        },
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return hrMetrics;
}

/**
 * Subscribe to advanced analysis metrics (TSS, NP, IF, etc.)
 */
export function useAnalysisMetrics(
  service: ActivityRecorderService | null,
): AnalysisMetrics | null {
  const [analysisMetrics, setAnalysisMetrics] =
    useState<AnalysisMetrics | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;
      const now = Date.now();

      // Update analysis metrics less frequently (2s)
      if (now - lastUpdateRef.current < 2000) return;
      lastUpdateRef.current = now;

      setAnalysisMetrics({
        normalizedPower: roundToPrecision(
          metrics.normalizedPowerEst,
          "normalizedPower",
        ),
        intensityFactor: roundToPrecision(
          metrics.intensityFactorEst,
          "intensityFactor",
        ),
        tss: roundToPrecision(metrics.trainingStressScoreEst, "tss"),
        variabilityIndex: roundToPrecision(
          metrics.variabilityIndexEst,
          "efficiency",
        ),
        efficiencyFactor: roundToPrecision(
          metrics.efficiencyFactorEst,
          "efficiency",
        ),
        decoupling: roundToPrecision(metrics.decouplingEst, "efficiency"),
        adherence: roundToPrecision(metrics.adherenceCurrentStep, "efficiency"),
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return analysisMetrics;
}

/**
 * Subscribe to distance and speed metrics
 */
export function useDistanceMetrics(
  service: ActivityRecorderService | null,
): DistanceMetrics | null {
  const [distanceMetrics, setDistanceMetrics] =
    useState<DistanceMetrics | null>(null);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;

      setDistanceMetrics({
        distance: roundToPrecision(metrics.distance, "distance"),
        avgSpeed: roundToPrecision(metrics.avgSpeed, "speed"),
        maxSpeed: roundToPrecision(metrics.maxSpeed, "speed"),
        elapsedTime: metrics.elapsedTime,
        movingTime: metrics.movingTime,
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return distanceMetrics;
}

/**
 * Subscribe to elevation metrics
 */
export function useElevationMetrics(
  service: ActivityRecorderService | null,
): ElevationMetrics | null {
  const [elevationMetrics, setElevationMetrics] =
    useState<ElevationMetrics | null>(null);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;

      setElevationMetrics({
        totalAscent: roundToPrecision(metrics.totalAscent, "elevation"),
        totalDescent: roundToPrecision(metrics.totalDescent, "elevation"),
        avgGrade: roundToPrecision(metrics.avgGrade, "grade"),
        elevationGainPerKm: roundToPrecision(
          metrics.elevationGainPerKm,
          "elevation",
        ),
        current: service.liveMetrics.get("altitude"),
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return elevationMetrics;
}

/**
 * Subscribe to cadence metrics
 */
export function useCadenceMetrics(
  service: ActivityRecorderService | null,
): CadenceMetrics | null {
  const [cadenceMetrics, setCadenceMetrics] = useState<CadenceMetrics | null>(
    null,
  );

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;

      setCadenceMetrics({
        current: service.liveMetrics.get("cadence"),
        avg: roundToPrecision(metrics.avgCadence, "cadence"),
        max: metrics.maxCadence,
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return cadenceMetrics;
}

/**
 * Subscribe to environmental metrics (temperature, etc.)
 */
export function useEnvironmentalMetrics(
  service: ActivityRecorderService | null,
): EnvironmentalMetrics | null {
  const [envMetrics, setEnvMetrics] = useState<EnvironmentalMetrics | null>(
    null,
  );

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;

      setEnvMetrics({
        avgTemperature: metrics.avgTemperature
          ? roundToPrecision(metrics.avgTemperature, "temperature")
          : undefined,
        maxTemperature: metrics.maxTemperature
          ? roundToPrecision(metrics.maxTemperature, "temperature")
          : undefined,
        currentTemperature: service.liveMetrics.get("temperature"),
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return envMetrics;
}

// ================================
// Batch and Summary Hooks
// ================================

/**
 * Get a summary of key metrics for dashboard display
 */
export function useMetricsSummary(
  service: ActivityRecorderService | null,
): MetricsSummary | null {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;
      const now = Date.now();

      // Update summary every 2 seconds
      if (now - lastUpdateRef.current < 2000) return;
      lastUpdateRef.current = now;

      setSummary({
        primary: {
          elapsedTime: metrics.elapsedTime,
          distance: roundToPrecision(metrics.distance, "distance"),
          avgPower: roundToPrecision(metrics.avgPower, "power"),
          avgHeartRate: roundToPrecision(metrics.avgHeartRate, "heartRate"),
        },
        secondary: {
          calories: Math.round(metrics.calories),
          avgSpeed: roundToPrecision(metrics.avgSpeed, "speed"),
          maxPower: metrics.maxPower,
          maxHeartRate: metrics.maxHeartRate,
        },
        analysis: {
          tss: Math.round(metrics.trainingStressScoreEst),
          intensityFactor: roundToPrecision(
            metrics.intensityFactorEst,
            "intensityFactor",
          ),
          normalizedPower: Math.round(metrics.normalizedPowerEst),
          adherence: roundToPrecision(
            metrics.adherenceCurrentStep,
            "efficiency",
          ),
        },
      });
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service]);

  return summary;
}

/**
 * Efficient batch subscription for multiple metrics
 * Use this when you need several metrics in one component
 */
export function useMetricsBatch(
  service: ActivityRecorderService | null,
  metricNames: (keyof LiveMetricsState)[],
  throttleMs: number = 1000,
): Record<string, number | undefined> {
  const [metrics, setMetrics] = useState<Record<string, number | undefined>>(
    {},
  );
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!service?.liveMetricsManager || metricNames.length === 0) return;

    const handleUpdate = (updateEvent: any) => {
      const metricsData = updateEvent.metrics;
      const now = Date.now();

      // Throttle updates
      if (now - lastUpdateRef.current < throttleMs) return;
      lastUpdateRef.current = now;

      const updates: Record<string, number | undefined> = {};
      let hasChanges = false;

      metricNames.forEach((metricName) => {
        const newValue = metricsData[metricName] as number | undefined;
        const precision =
          RECORDING_CONFIG.PRECISION[
            metricName as keyof typeof RECORDING_CONFIG.PRECISION
          ] || 0;
        const roundedValue =
          newValue !== undefined
            ? roundToPrecision(newValue, metricName as string)
            : undefined;

        if (metrics[metricName] !== roundedValue) {
          updates[metricName] = roundedValue;
          hasChanges = true;
        } else {
          updates[metricName] = metrics[metricName];
        }
      });

      if (hasChanges) {
        setMetrics(updates);
      }
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial values
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service, metricNames, throttleMs]);

  return metrics;
}

// ================================
// Performance and Debug Hooks
// ================================

/**
 * Monitor performance statistics
 */
export function usePerformanceStats(
  service: ActivityRecorderService | null,
): PerformanceStats | null {
  const [stats, setStats] = useState<PerformanceStats | null>(null);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const updateStats = () => {
      const performance = service.liveMetricsManager!.getPerformanceStats();
      setStats(performance);
    };

    // Update every 5 seconds
    const interval = setInterval(updateStats, 5000);

    // Initial update
    updateStats();

    return () => {
      clearInterval(interval);
    };
  }, [service]);

  return stats;
}

/**
 * Get buffer status for debugging
 */
export function useBufferStatus(service: ActivityRecorderService | null) {
  const [bufferStatus, setBufferStatus] = useState<any>(null);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const updateStatus = () => {
      const status = service.liveMetricsManager!.getBufferStatus();
      setBufferStatus(status);
    };

    // Update every 2 seconds
    const interval = setInterval(updateStatus, 2000);

    // Initial update
    updateStatus();

    return () => {
      clearInterval(interval);
    };
  }, [service]);

  return bufferStatus;
}

// ================================
// Legacy Compatibility Hooks
// ================================

/**
 * Subscribe to a specific metric by name (legacy compatibility)
 */
export function useMetric(
  service: ActivityRecorderService | null,
  metricName: string,
): number | undefined {
  const [value, setValue] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!service?.liveMetricsManager) return;

    const handleUpdate = (updateEvent: any) => {
      const metrics = updateEvent.metrics;
      const newValue = metrics[metricName as keyof LiveMetricsState];

      if (typeof newValue === "number") {
        const precision =
          RECORDING_CONFIG.PRECISION[
            metricName as keyof typeof RECORDING_CONFIG.PRECISION
          ] || 0;
        setValue(roundToPrecision(newValue, metricName));
      } else {
        // Check instantaneous values
        const instantValue = service.liveMetrics.get(metricName);
        setValue(instantValue);
      }
    };

    service.liveMetricsManager.on("metricsUpdate", handleUpdate);

    // Initial value
    const initialMetrics = service.liveMetricsManager.getMetrics();
    handleUpdate({ metrics: initialMetrics });

    return () => {
      service.liveMetricsManager?.off("metricsUpdate", handleUpdate);
    };
  }, [service, metricName]);

  return value;
}

// Specific metric shortcuts for legacy compatibility
export const useHeartRate = (service: ActivityRecorderService | null) =>
  useMetric(service, "heartrate");

export const usePower = (service: ActivityRecorderService | null) =>
  useMetric(service, "power");

export const useCadence = (service: ActivityRecorderService | null) =>
  useMetric(service, "cadence");

export const useSpeed = (service: ActivityRecorderService | null) =>
  useMetric(service, "speed");

export const useDistance = (service: ActivityRecorderService | null) =>
  useMetric(service, "distance");

export const useElapsedTime = (service: ActivityRecorderService | null) =>
  useMetric(service, "elapsedTime");
