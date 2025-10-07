/**
 * useActivityRecorder - Consolidated Activity Recorder Hooks
 *
 * Single source of truth for all ActivityRecorder service interactions.
 *
 * @example
 * ```tsx
 * const service = useActivityRecorder(profile);
 * const state = useRecordingState(service);
 * const current = useCurrentReadings(service);
 * const stats = useSessionStats(service);
 * const { sensors, count } = useSensors(service);
 * const actions = useRecorderActions(service);
 * ```
 */

import {
  ActivityRecorderService,
  RecordingState,
  TimeUpdate,
} from "@/lib/services/ActivityRecorder";
import type { PermissionState } from "@/lib/services/ActivityRecorder/permissions";
import type { ConnectedSensor } from "@/lib/services/ActivityRecorder/sensors";
import type {
  CurrentReadings,
  SensorUpdateEvent,
  SessionStats,
  StatsUpdateEvent,
} from "@/lib/services/ActivityRecorder/types";
import type {
  PublicActivityType,
  PublicProfilesRow,
  RecordingServiceActivityPlan,
} from "@repo/core";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Device } from "react-native-ble-plx";

// ================================
// Types
// ================================

/**
 * Sensors state with utility accessors
 */
export interface SensorsState {
  sensors: ConnectedSensor[];
  count: number;
}

/**
 * Permission states for all required permissions
 */
export interface PermissionsState {
  bluetooth: PermissionState | null;
  location: PermissionState | null;
  locationBackground: PermissionState | null;
}

/**
 * All recorder actions consolidated
 */
export interface RecorderActions {
  // Recording controls
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<void>;

  // Activity selection
  selectActivity: (type: PublicActivityType) => void;

  // Device management
  scanDevices: () => Promise<Device[]>;
  connectDevice: (deviceId: string) => Promise<void>;
  disconnectDevice: (deviceId: string) => void;

  // Permission management
  checkPermissions: () => Promise<void>;
  ensurePermission: (
    type: "bluetooth" | "location" | "location-background",
  ) => Promise<boolean>;
}

// ================================
// 1. useActivityRecorder - Service Creation & Lifecycle
// ================================

/**
 * Automatically creates service when profile is available and cleans up on unmount.
 *
 * @param profile - User profile (service created when available)
 * @returns Service instance or null
 *
 * @example
 * ```tsx
 * const service = useActivityRecorder(profile);
 * ```
 */
export function useActivityRecorder(
  profile: PublicProfilesRow | null,
): ActivityRecorderService | null {
  const service = useMemo(() => {
    if (!profile) return null;
    console.log(
      "[useActivityRecorder] Creating new service instance for profile:",
      profile.id,
    );
    return new ActivityRecorderService(profile);
  }, [profile]);

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
 * Comprehensive hook that returns current readings, session stats, and state
 * This is the recommended hook for most use cases
 *
 * @example
 * ```tsx
 * const { current, stats, isActive, isPaused } = useActivityRecorderData(service);
 * console.log(current.heartRate); // Current HR
 * console.log(stats.avgHeartRate); // Average HR
 * ```
 */
export function useActivityRecorderData(
  service: ActivityRecorderService | null,
) {
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);
  const recordingState = useRecordingState(service);

  return {
    // Real-time sensor data
    current,

    // Computed session statistics
    stats,

    // Recording state
    isActive: recordingState === "recording",
    isPaused: recordingState === "paused",
    recordingId: service?.recording?.id,

    // Service reference for advanced use
    service,
  };
}

// ================================
// 2. useRecordingState - Recording State Tracking
// ================================

/**
 * Subscribe to recording state changes.
 *
 * @param service - ActivityRecorderService instance
 * @returns Current recording state
 *
 * @example
 * ```tsx
 * const state = useRecordingState(service);
 * // 'pending' | 'recording' | 'paused' | 'finished'
 * ```
 */
export function useRecordingState(
  service: ActivityRecorderService | null,
): RecordingState {
  const [state, setState] = useState<RecordingState>(
    service?.state ?? "pending",
  );

  useEffect(() => {
    if (!service) return;

    // Initial state
    setState(service.state);

    // Subscribe to state changes
    const handleStateChange = (newState: RecordingState) => {
      console.log("[useRecordingState] State changed:", newState);
      setState(newState);
    };

    service.on("stateChanged", handleStateChange);

    return () => {
      service.off("stateChanged", handleStateChange);
    };
  }, [service]);

  return state;
}

// ================================
// Hooks: Metrics
// ================================

// ================================
// 4. useSensors - Sensor Management
// ================================

/**
 * Subscribe to connected sensors updates.
 * Returns sensors array, count, and convenient byType accessor.
 *
 * @param service - ActivityRecorderService instance
 * @returns Sensors state with utilities
 *
 * @example
 * ```tsx
 * const { sensors, count, byType } = useSensors(service);
 * const hrSensor = byType.heartRate;
 * ```
 */
export function useSensors(
  service: ActivityRecorderService | null,
): SensorsState {
  const [sensors, setSensors] = useState<ConnectedSensor[]>(
    () => service?.sensorsManager.getConnectedSensors() || [],
  );

  useEffect(() => {
    if (!service) {
      setSensors([]);
      return;
    }

    // Initial sensors
    setSensors(service.sensorsManager.getConnectedSensors());

    // Subscribe to sensor changes
    const handleSensorsChange = (updatedSensors: ConnectedSensor[]) => {
      setSensors(updatedSensors);
    };

    service.on("sensorsChanged", handleSensorsChange);

    return () => {
      service.off("sensorsChanged", handleSensorsChange);
    };
  }, [service]);

  return {
    sensors,
    count: sensors.length,
  };
}

// ================================
// 5. usePermissions - Permission States
// ================================

/**
 * Subscribe to permission state updates.
 *
 * @param service - ActivityRecorderService instance
 * @returns Current permission states
 *
 * @example
 * ```tsx
 * const permissions = usePermissions(service);
 * if (permissions.bluetooth?.granted) {
 *   // Can use bluetooth
 * }
 * ```
 */
export function usePermissions(
  service: ActivityRecorderService | null,
): PermissionsState {
  const [permissions, setPermissions] = useState<PermissionsState>(() => ({
    bluetooth: service?.permissionsManager.permissions.bluetooth || null,
    location: service?.permissionsManager.permissions.location || null,
    locationBackground:
      service?.permissionsManager.permissions["location-background"] || null,
  }));

  useEffect(() => {
    if (!service) {
      setPermissions({
        bluetooth: null,
        location: null,
        locationBackground: null,
      });
      return;
    }

    // Initial values
    setPermissions({
      bluetooth: service.permissionsManager.permissions.bluetooth || null,
      location: service.permissionsManager.permissions.location || null,
      locationBackground:
        service.permissionsManager.permissions["location-background"] || null,
    });

    // Subscribe to permission updates
    const handlePermissionUpdate = ({
      type,
      permission,
    }: {
      type: string;
      permission: PermissionState;
    }) => {
      setPermissions((prev) => ({
        ...prev,
        [type === "location-background" ? "locationBackground" : type]:
          permission,
      }));
    };

    service.on("permissionUpdate", handlePermissionUpdate);

    return () => {
      service.off("permissionUpdate", handlePermissionUpdate);
    };
  }, [service]);

  return permissions;
}

// ================================
// Plan Hooks (Direct Service Access)
// ================================

/**
 * Helper hook to subscribe to service events and trigger re-renders
 */
function useServiceEvent(
  service: ActivityRecorderService | null,
  event: string,
): void {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!service) return undefined;
    service.on(event, forceUpdate);
    return () => service.off(event, forceUpdate);
  }, [service, event]);
}

/**
 * Unified plan hook - provides all plan-related data and actions
 * Replaces: useHasPlan, useCurrentPlanStep, usePlanStepProgress, useStepTimer, useStepAdvance
 *
 * Exposed Actions:
 * - `advance()` - User action to manually advance to the next step (when canAdvance is true)
 * - `select()` - Select a new plan
 * - `clear()` - Clear the current plan
 *
 * @example
 * ```tsx
 * const plan = usePlan(service);
 * if (!plan.hasPlan) return null;
 *
 * return (
 *   <View>
 *     <Text>{plan.currentStep?.name}</Text>
 *     <Text>Step {plan.stepIndex + 1} of {plan.stepCount}</Text>
 *     {plan.progress && (
 *       <>
 *         <ProgressBar value={plan.progress.progress} />
 *         <Text>Moving Time: {formatTime(plan.progress.movingTime)}</Text>
 *       </>
 *     )}
 *     {plan.canAdvance && (
 *       <Button onPress={plan.advance}>
 *         Advance to Next Step
 *       </Button>
 *     )}
 *   </View>
 * );
 * ```
 */
export function usePlan(service: ActivityRecorderService | null) {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!service) return;

    const handleUpdate = () => forceUpdate();
    service.on("stepChanged", handleUpdate);
    service.on("planCleared", handleUpdate);
    service.on("timeUpdated", handleUpdate);

    return () => {
      service.off("stepChanged", handleUpdate);
      service.off("planCleared", handleUpdate);
      service.off("timeUpdated", handleUpdate);
    };
  }, [service]);

  if (!service?.hasPlan) {
    return {
      hasPlan: false as const,
      select: (plan: RecordingServiceActivityPlan, id?: string) =>
        service?.selectPlan(plan, id),
      clear: () => service?.clearPlan(),
    };
  }

  const info = service.getStepInfo();
  const planDetails = service.plan;

  return {
    hasPlan: true as const,
    name: planDetails?.name,
    description: planDetails?.description,
    activityType: planDetails?.activity_type,
    stepIndex: info.index,
    stepCount: info.total,
    currentStep: info.current,
    progress: info.progress,
    isLast: info.isLast,
    isFinished: info.isFinished,
    canAdvance: info.progress?.canAdvance ?? false,
    advance: () => service.advanceStep(),
    select: (plan: RecordingServiceActivityPlan, id?: string) =>
      service.selectPlan(plan, id),
    clear: () => service.clearPlan(),
  };
}

/**
 * Hook for elapsed time (total time since start, including pauses)
 *
 * @example
 * ```tsx
 * const elapsed = useElapsedTime(service);
 * return <Text>{formatTime(elapsed)}</Text>;
 * ```
 */
export function useElapsedTime(
  service: ActivityRecorderService | null,
): number {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!service) return;

    const handleUpdate = ({ elapsed }: TimeUpdate) => setTime(elapsed);
    service.on("timeUpdated", handleUpdate);

    return () => service.off("timeUpdated", handleUpdate);
  }, [service]);

  return time;
}

/**
 * Hook for moving time (active recording time, excluding pauses)
 * This is the time used for plan progression
 *
 * @example
 * ```tsx
 * const movingTime = useMovingTime(service);
 * return <Text>Moving: {formatTime(movingTime)}</Text>;
 * ```
 */
export function useMovingTime(service: ActivityRecorderService | null): number {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!service) return;

    const handleUpdate = ({ moving }: TimeUpdate) => setTime(moving);
    service.on("timeUpdated", handleUpdate);

    return () => service.off("timeUpdated", handleUpdate);
  }, [service]);

  return time;
}
// ================================
// 7. useActivityStatus - Card Visibility Flags
// ================================

/**
 * Provides boolean flags for determining which cards should be visible in the UI.
 * This hook reactively tracks activity type and plan status to control card rendering.
 *
 * @param service - ActivityRecorderService instance
 * @returns Object with boolean flags for card visibility
 *
 * @example
 * ```tsx
 * const { isOutdoorActivity, hasPlan } = useActivityStatus(service);
 *
 * // Use in card list determination
 * if (isOutdoorActivity) cardList.push('map');
 * if (hasPlan) cardList.push('plan');
 * ```
 */
export function useActivityStatus(service: ActivityRecorderService | null): {
  isOutdoorActivity: boolean;
  activityType: PublicActivityType;
} {
  useServiceEvent(service, "activitySelected");

  // Helper function to check if activity is outdoor
  const checkIsOutdoor = (type: PublicActivityType): boolean => {
    return ["outdoor_run", "outdoor_bike"].includes(type);
  };

  const activityType = service?.selectedActivityType || "indoor_bike_trainer";

  return {
    isOutdoorActivity: checkIsOutdoor(activityType),
    activityType,
  };
}

// ================================
// 8. useRecorderActions - All Actions Consolidated
// ================================

/**
 * Get all recorder actions in a single object.
 * Includes recording controls, device management, and permissions.
 * Plan actions are available via the usePlan() hook.
 *
 * @param service - ActivityRecorderService instance
 * @returns All available actions
 *
 * @example
 * ```tsx
 * const { start, pause, resume, finish, scanDevices } = useRecorderActions(service);
 * const plan = usePlan(service);
 * if (plan.hasPlan) {
 *   plan.advance(); // Plan actions
 * }
 * ```
 */
export function useRecorderActions(
  service: ActivityRecorderService | null,
): RecorderActions {
  // Recording controls
  const start = useCallback(async () => {
    if (!service) return;
    await service.startRecording();
  }, [service]);

  const pause = useCallback(async () => {
    if (!service) return;
    await service.pauseRecording();
  }, [service]);

  const resume = useCallback(async () => {
    if (!service) return;
    await service.resumeRecording();
  }, [service]);

  const finish = useCallback(async () => {
    if (!service) return;
    await service.finishRecording();
  }, [service]);

  // Activity selection
  const selectActivity = useCallback(
    (type: PublicActivityType) => {
      if (!service) return;
      service.selectUnplannedActivity(type);
    },
    [service],
  );

  // Device management
  const scanDevices = useCallback(async (): Promise<Device[]> => {
    if (!service) return [];
    return await service.sensorsManager.scan();
  }, [service]);

  const connectDevice = useCallback(
    async (deviceId: string) => {
      if (!service) return;
      await service.sensorsManager.connectSensor(deviceId);
    },
    [service],
  );

  const disconnectDevice = useCallback(
    (deviceId: string) => {
      if (!service) return;
      service.sensorsManager.disconnectSensor(deviceId);
    },
    [service],
  );

  // Permission management
  const checkPermissions = useCallback(async () => {
    if (!service) return;
    await service.permissionsManager.checkAll();
  }, [service]);

  const ensurePermission = useCallback(
    async (
      type: "bluetooth" | "location" | "location-background",
    ): Promise<boolean> => {
      if (!service) return false;
      return await service.permissionsManager.ensure(type);
    },
    [service],
  );

  return {
    // Recording controls
    start,
    pause,
    resume,
    finish,

    // Activity selection
    selectActivity,

    // Device management
    scanDevices,
    connectDevice,
    disconnectDevice,

    // Permission management
    checkPermissions,
    ensurePermission,
  };
}

// ================================
// Utility Hooks (Convenience)
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
 * Check if recording is currently active
 */
export function useIsRecordingActive(
  service: ActivityRecorderService | null,
): boolean {
  const state = useRecordingState(service);
  return state === "recording" || state === "paused";
}

// ==================== NEW OPTIMIZED HOOKS ====================

/**
 * Hook for current sensor readings - updates on sensor changes only
 */
export function useCurrentReadings(
  service: ActivityRecorderService | null,
): CurrentReadings {
  const [readings, setReadings] = useState<CurrentReadings>({});

  useEffect(() => {
    if (!service?.liveMetricsManager) {
      setReadings({});
      return;
    }

    // Get initial readings
    setReadings(service.liveMetricsManager.getCurrentReadings());

    // Subscribe to sensor updates
    const handleSensorUpdate = (event: SensorUpdateEvent) => {
      setReadings(event.readings);
    };

    service.liveMetricsManager.on("sensorUpdate", handleSensorUpdate);

    return () => {
      service.liveMetricsManager.off("sensorUpdate", handleSensorUpdate);
    };
  }, [service]);

  return readings;
}

/**
 * Hook for session statistics - updates every second
 */
export function useSessionStats(
  service: ActivityRecorderService | null,
): SessionStats {
  const [stats, setStats] = useState<SessionStats>(getEmptySessionStats());

  useEffect(() => {
    if (!service?.liveMetricsManager) {
      setStats(getEmptySessionStats());
      return;
    }

    // Get initial stats
    setStats(service.liveMetricsManager.getSessionStats());

    // Subscribe to stats updates
    const handleStatsUpdate = (event: StatsUpdateEvent) => {
      setStats(event.stats);
    };

    service.liveMetricsManager.on("statsUpdate", handleStatsUpdate);

    return () => {
      service.liveMetricsManager.off("statsUpdate", handleStatsUpdate);
    };
  }, [service]);

  return stats;
}

/**
 * Hook for specific sensor value - minimizes re-renders
 */
export function useSensorValue(
  service: ActivityRecorderService | null,
  sensor: keyof CurrentReadings,
): number | undefined {
  const readings = useCurrentReadings(service);
  return readings[sensor];
}

/**
 * Hook for data freshness tracking
 */
export function useSensorFreshness(
  service: ActivityRecorderService | null,
  sensor: keyof CurrentReadings,
): { value?: number; age: number; isStale: boolean } {
  const readings = useCurrentReadings(service);
  const [age, setAge] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const lastUpdated = readings.lastUpdated?.[sensor];
      if (lastUpdated) {
        setAge(Date.now() - lastUpdated);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [readings.lastUpdated, sensor]);

  return {
    value: readings[sensor],
    age,
    isStale: age > 5000, // More than 5 seconds old
  };
}

// Helper function
function getEmptySessionStats(): SessionStats {
  return {
    duration: 0,
    movingTime: 0,
    pausedTime: 0,
    distance: 0,
    calories: 0,
    work: 0,
    ascent: 0,
    descent: 0,
    avgHeartRate: 0,
    avgPower: 0,
    avgSpeed: 0,
    avgCadence: 0,
    maxHeartRate: 0,
    maxPower: 0,
    maxSpeed: 0,
    maxCadence: 0,
    hrZones: [0, 0, 0, 0, 0],
    powerZones: [0, 0, 0, 0, 0, 0, 0],
  };
}
