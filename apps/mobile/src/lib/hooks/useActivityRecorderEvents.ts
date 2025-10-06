import {
  ActivityRecorderService,
  PlannedActivityProgress,
  RecordingState,
} from "@/lib/services/ActivityRecorder";
import { PermissionState } from "@/lib/services/ActivityRecorder/permissions";
import { PublicActivityType, RecordingServiceActivityPlan } from "@repo/core";
import { useCallback, useEffect, useState } from "react";

// ================================
// Core Event Hooks
// ================================

/**
 * Subscribe to recording state changes
 */
export function useRecordingState(
  service: ActivityRecorderService | null,
): RecordingState {
  const [state, setState] = useState<RecordingState>("pending");

  useEffect(() => {
    if (!service) return;

    // Initial state
    setState(service.state);

    // Subscribe to changes
    const handler = (newState: RecordingState) => {
      setState(newState);
    };

    service.on("stateChange", handler);

    return () => {
      service.off("stateChange", handler);
    };
  }, [service]);

  return state;
}

/**
 * Subscribe to activity type changes
 */
export function useActivityType(
  service: ActivityRecorderService | null,
): PublicActivityType {
  const [activityType, setActivityType] = useState<PublicActivityType>(
    "indoor_bike_trainer",
  );

  useEffect(() => {
    if (!service) return;

    // Initial value
    setActivityType(service.selectedActivityType);

    // Subscribe to changes
    const handler = (newType: PublicActivityType) => {
      setActivityType(newType);
    };

    service.on("activityTypeChange", handler);

    return () => {
      service.off("activityTypeChange", handler);
    };
  }, [service]);

  return activityType;
}

// ================================
// Metric Hooks - Granular subscriptions
// ================================

/**
 * Subscribe to a specific metric by name
 */
export function useMetric(
  service: ActivityRecorderService | null,
  metricName: string,
): number | undefined {
  const [value, setValue] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!service) return;

    // Initial value
    setValue(service.liveMetrics.get(metricName));

    // Subscribe to specific metric changes
    const handler = (newValue: number) => {
      setValue(newValue);
    };

    service.on(`metric:${metricName}`, handler);

    return () => {
      service.off(`metric:${metricName}`, handler);
    };
  }, [service, metricName]);

  return value;
}

/**
 * Subscribe to heart rate updates
 */
export function useHeartRate(
  service: ActivityRecorderService | null,
): number | undefined {
  return useMetric(service, "heartrate");
}

/**
 * Subscribe to power updates
 */
export function usePower(
  service: ActivityRecorderService | null,
): number | undefined {
  return useMetric(service, "power");
}

/**
 * Subscribe to cadence updates
 */
export function useCadence(
  service: ActivityRecorderService | null,
): number | undefined {
  return useMetric(service, "cadence");
}

/**
 * Subscribe to speed updates
 */
export function useSpeed(
  service: ActivityRecorderService | null,
): number | undefined {
  return useMetric(service, "speed");
}

/**
 * Subscribe to distance updates
 */
export function useDistance(
  service: ActivityRecorderService | null,
): number | undefined {
  return useMetric(service, "distance");
}

/**
 * Subscribe to elapsed time updates
 */
export function useElapsedTime(
  service: ActivityRecorderService | null,
): number | undefined {
  return useMetric(service, "elapsedTime");
}

/**
 * Subscribe to GPS coordinates
 */
export function useLocation(service: ActivityRecorderService | null) {
  const latitude = useMetric(service, "latitude");
  const longitude = useMetric(service, "longitude");
  const altitude = useMetric(service, "altitude");
  const heading = useMetric(service, "heading");

  return { latitude, longitude, altitude, heading };
}

// ================================
// Multi-Metric Hooks - Optimized for common use cases
// ================================

/**
 * Subscribe to multiple metrics efficiently for dashboard
 */
export function useDashboardMetrics(service: ActivityRecorderService | null) {
  const [metrics, setMetrics] = useState({
    heartrate: undefined as number | undefined,
    power: undefined as number | undefined,
    cadence: undefined as number | undefined,
    speed: undefined as number | undefined,
    distance: undefined as number | undefined,
    elapsedTime: undefined as number | undefined,
  });

  useEffect(() => {
    if (!service) return;

    // Initial values
    setMetrics({
      heartrate: service.liveMetrics.get("heartrate"),
      power: service.liveMetrics.get("power"),
      cadence: service.liveMetrics.get("cadence"),
      speed: service.liveMetrics.get("speed"),
      distance: service.liveMetrics.get("distance"),
      elapsedTime: service.liveMetrics.get("elapsedTime"),
    });

    // Subscribe to metric updates
    const handler = ({ metric, value }: { metric: string; value: number }) => {
      if (
        [
          "heartrate",
          "power",
          "cadence",
          "speed",
          "distance",
          "elapsedTime",
        ].includes(metric)
      ) {
        setMetrics((prev) => ({
          ...prev,
          [metric]: value,
        }));
      }
    };

    service.on("metricUpdate", handler);

    return () => {
      service.off("metricUpdate", handler);
    };
  }, [service]);

  return metrics;
}

/**
 * Subscribe to GPS metrics together
 */
export function useGPSMetrics(service: ActivityRecorderService | null) {
  const [gpsData, setGpsData] = useState({
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    altitude: undefined as number | undefined,
    heading: undefined as number | undefined,
  });

  useEffect(() => {
    if (!service) return;

    // Initial values
    setGpsData({
      latitude: service.liveMetrics.get("latitude"),
      longitude: service.liveMetrics.get("longitude"),
      altitude: service.liveMetrics.get("altitude"),
      heading: service.liveMetrics.get("heading"),
    });

    // Subscribe to GPS metric updates
    const handler = ({ metric, value }: { metric: string; value: number }) => {
      if (["latitude", "longitude", "altitude", "heading"].includes(metric)) {
        setGpsData((prev) => ({
          ...prev,
          [metric]: value,
        }));
      }
    };

    service.on("metricUpdate", handler);

    return () => {
      service.off("metricUpdate", handler);
    };
  }, [service]);

  return gpsData;
}

// ================================
// Sensor Hooks
// ================================

/**
 * Subscribe to sensor connection updates
 */
export function useConnectedSensors(service: ActivityRecorderService | null) {
  const [sensors, setSensors] = useState<any[]>([]);

  useEffect(() => {
    if (!service) return;

    // Initial value
    setSensors(service.getConnectedSensors());

    // Subscribe to changes
    const handler = (newSensors: any[]) => {
      setSensors(newSensors);
    };

    service.on("sensorsUpdate", handler);

    return () => {
      service.off("sensorsUpdate", handler);
    };
  }, [service]);

  return sensors;
}

/**
 * Subscribe to sensor count (more efficient than full sensor array)
 */
export function useSensorCount(
  service: ActivityRecorderService | null,
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!service) return;

    // Initial value
    setCount(service.getConnectedSensors().length);

    // Subscribe to changes
    const handler = (newCount: number) => {
      setCount(newCount);
    };

    service.on("sensorCountUpdate", handler);

    return () => {
      service.off("sensorCountUpdate", handler);
    };
  }, [service]);

  return count;
}

// ================================
// Permission Hooks
// ================================

/**
 * Subscribe to a specific permission state
 */
export function usePermission(
  service: ActivityRecorderService | null,
  type: string,
): PermissionState | null {
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    if (!service) return;

    // Initial value
    setPermission(service.getPermissionState(type as any) || null);

    // Subscribe to changes
    const handler = (newPermission: PermissionState) => {
      setPermission(newPermission);
    };

    service.on(`permission:${type}`, handler);

    return () => {
      service.off(`permission:${type}`, handler);
    };
  }, [service, type]);

  return permission;
}

/**
 * Subscribe to all permissions
 */
export function usePermissions(service: ActivityRecorderService | null) {
  const [permissions, setPermissions] = useState<
    Record<string, PermissionState | null>
  >({});

  useEffect(() => {
    if (!service) return;

    // Initial values
    const initialPermissions: Record<string, PermissionState | null> = {};
    const permissionTypes = ["bluetooth", "location", "location-background"];
    permissionTypes.forEach((type) => {
      initialPermissions[type] =
        service.getPermissionState(type as any) || null;
    });
    setPermissions(initialPermissions);

    // Subscribe to permission updates
    const handler = ({
      type,
      permission,
    }: {
      type: string;
      permission: PermissionState;
    }) => {
      setPermissions((prev) => ({
        ...prev,
        [type]: permission,
      }));
    };

    service.on("permissionUpdate", handler);

    return () => {
      service.off("permissionUpdate", handler);
    };
  }, [service]);

  return permissions;
}

// ================================
// Plan Hooks
// ================================

/**
 * Subscribe to plan progress updates
 */
export function usePlanProgress(
  service: ActivityRecorderService | null,
): PlannedActivityProgress | undefined {
  const [progress, setProgress] = useState<PlannedActivityProgress | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!service) return;

    // Initial value
    setProgress(service.planManager?.planProgress);

    // Subscribe to changes
    const handler = (newProgress: PlannedActivityProgress) => {
      setProgress(newProgress);
    };

    service.on("planProgressUpdate", handler);

    return () => {
      service.off("planProgressUpdate", handler);
    };
  }, [service]);

  return progress;
}

/**
 * Get activity plan (doesn't change frequently, so simple state)
 */
export function useActivityPlan(
  service: ActivityRecorderService | null,
): RecordingServiceActivityPlan | undefined {
  const [plan, setPlan] = useState<RecordingServiceActivityPlan | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!service) return;

    // Update plan when service changes
    setPlan(service.planManager?.selectedActivityPlan);

    // Listen to both activity type changes and plan progress updates
    const handler = () => {
      setPlan(service.planManager?.selectedActivityPlan);
    };

    service.on("activityTypeChange", handler);
    service.on("planProgressUpdate", handler);

    return () => {
      service.off("activityTypeChange", handler);
      service.off("planProgressUpdate", handler);
    };
  }, [service]);

  return plan;
}

// ================================
// Action Hooks - Provide service methods
// ================================

/**
 * Get recording control actions
 */
export function useRecordingActions(service: ActivityRecorderService | null) {
  return {
    start: useCallback(() => service?.startRecording(), [service]),
    pause: useCallback(() => service?.pauseRecording(), [service]),
    resume: useCallback(() => service?.resumeRecording(), [service]),
    finish: useCallback(() => service?.finishRecording(), [service]),
  };
}

/**
 * Get activity selection actions
 */
export function useActivitySelection(service: ActivityRecorderService | null) {
  return {
    selectActivity: useCallback(
      (type: PublicActivityType) => service?.selectUnplannedActivity(type),
      [service],
    ),
    selectPlannedActivity: useCallback(
      (plan: RecordingServiceActivityPlan, plannedId?: string) =>
        service?.selectPlannedActivity(plan, plannedId),
      [service],
    ),
  };
}

/**
 * Get device management actions
 */
export function useDeviceActions(service: ActivityRecorderService | null) {
  return {
    scan: useCallback(
      () => service?.scanForDevices() ?? Promise.resolve([]),
      [service],
    ),
    connect: useCallback(
      (deviceId: string) => service?.connectToDevice(deviceId),
      [service],
    ),
    disconnect: useCallback(
      (deviceId: string) => service?.disconnectDevice(deviceId),
      [service],
    ),
  };
}

/**
 * Get permission management actions
 */
export function usePermissionActions(service: ActivityRecorderService | null) {
  return {
    check: useCallback(() => service?.checkPermissions(), [service]),
    ensure: useCallback(
      (type: any) => service?.ensurePermission(type),
      [service],
    ),
  };
}

/**
 * Get plan management actions
 */
export function usePlanActions(service: ActivityRecorderService | null) {
  const [isAdvancing, setIsAdvancing] = useState(false);

  const resumePlan = useCallback(async () => {
    if (!service?.planManager || isAdvancing) {
      console.log("Cannot advance step: no service or already advancing");
      return false;
    }

    setIsAdvancing(true);
    try {
      const success = await service.planManager.advanceStep();
      if (!success) {
        console.warn("Failed to advance step");
      }
      return success;
    } catch (error) {
      console.error("Error advancing step:", error);
      return false;
    } finally {
      // Add delay to prevent rapid clicking
      setTimeout(() => setIsAdvancing(false), 500);
    }
  }, [service, isAdvancing]);

  const resetPlan = useCallback(() => {
    service?.planManager?.reset?.();
  }, [service]);

  const skipStep = useCallback(() => {
    service?.planManager?.skipCurrentStep?.();
  }, [service]);

  return {
    resumePlan,
    resetPlan,
    skipStep,
    isAdvancing,
  };
}

// ================================
// Utility Hooks
// ================================

/**
 * Check if recording can be started
 */
export function useCanStartRecording(
  service: ActivityRecorderService | null,
): boolean {
  const state = useRecordingState(service);
  return state === "ready" || state === "pending";
}

/**
 * Check if recording is active
 */
export function useIsRecordingActive(
  service: ActivityRecorderService | null,
): boolean {
  const state = useRecordingState(service);
  return state === "recording" || state === "paused";
}

/**
 * Get specific sensor types
 */
export function useHeartRateSensor(service: ActivityRecorderService | null) {
  const sensors = useConnectedSensors(service);
  return sensors.find((s) => s.type === "heartRate");
}

export function usePowerSensor(service: ActivityRecorderService | null) {
  const sensors = useConnectedSensors(service);
  return sensors.find((s) => s.type === "power");
}

export function useCadenceSensor(service: ActivityRecorderService | null) {
  const sensors = useConnectedSensors(service);
  return sensors.find((s) => s.type === "cadence");
}
