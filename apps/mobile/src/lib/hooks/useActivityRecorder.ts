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
  FlattenedStep,
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
  pause: () => void;
  resume: () => void;
  finish: () => void;

  // Activity selection
  selectActivity: (type: PublicActivityType) => void;
  selectPlannedActivity: (
    plan: RecordingServiceActivityPlan,
    plannedId?: string,
  ) => void;

  // Device management
  scanDevices: () => Promise<Device[]>;
  connectDevice: (deviceId: string) => Promise<void>;
  disconnectDevice: (deviceId: string) => void;

  // Permission management
  checkPermissions: () => Promise<void>;
  ensurePermission: (
    type: "bluetooth" | "location" | "location-background",
  ) => Promise<boolean>;

  // Plan management
  advanceStep: () => Promise<boolean>;
  skipStep: () => void;
  resetPlan: () => void;

  // State flags
  isAdvancing: boolean;
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
 * Returns whether a plan is currently selected
 * Zero overhead - just returns a boolean
 *
 * @example
 * ```tsx
 * const hasPlan = useHasPlan(service);
 * if (hasPlan) {
 *   return <PlanCard />;
 * }
 * ```
 */
export function useHasPlan(service: ActivityRecorderService | null): boolean {
  useServiceEvent(service, "stepChanged");
  useServiceEvent(service, "planCleared");
  return service?.hasPlan ?? false;
}

/**
 * Returns the current step details
 * Updates only when step changes
 *
 * @example
 * ```tsx
 * const step = useCurrentPlanStep(service);
 * if (step) {
 *   return <Text>{step.name}</Text>;
 * }
 * ```
 */
export function useCurrentPlanStep(
  service: ActivityRecorderService | null,
): FlattenedStep | undefined {
  useServiceEvent(service, "stepChanged");
  return service?.currentPlanStep;
}

/**
 * Returns the current step index and total count
 * Updates only when step changes
 *
 * @example
 * ```tsx
 * const { index, total } = usePlanStepProgress(service);
 * return <Text>Step {index + 1} of {total}</Text>;
 * ```
 */
export function usePlanStepProgress(service: ActivityRecorderService | null): {
  index: number;
  total: number;
} {
  useServiceEvent(service, "stepChanged");
  return {
    index: service?.planStepIndex ?? 0,
    total: service?.planStepCount ?? 0,
  };
}

/**
 * Returns timer info for the current step
 * Returns null if step is not timed
 * Updates on state changes
 *
 * @example
 * ```tsx
 * const timer = useStepTimer(service);
 * if (timer) {
 *   return <ProgressBar value={timer.progress} />;
 * }
 * ```
 */
export function useStepTimer(
  service: ActivityRecorderService | null,
): { elapsed: number; remaining: number; progress: number } | null {
  useServiceEvent(service, "stateChanged");

  if (!service?.hasPlan) return null;

  const duration = service.currentStepDurationMs;
  if (duration === 0) return null; // Untimed step

  const elapsed = service.planStepElapsed;
  const remaining = Math.max(0, duration - elapsed);
  const progress = Math.min(1, elapsed / duration);

  return { elapsed, remaining, progress };
}

/**
 * Returns whether the current step can be manually advanced
 * and the advance function
 *
 * @example
 * ```tsx
 * const { canAdvance, advance } = useStepAdvance(service);
 * if (canAdvance) {
 *   return <Button onPress={advance}>Next Step</Button>;
 * }
 * ```
 */
export function useStepAdvance(service: ActivityRecorderService | null): {
  canAdvance: boolean;
  advance: () => void;
  isLastStep: boolean;
} {
  useServiceEvent(service, "stepChanged");

  return {
    canAdvance: service?.canManuallyAdvanceStep ?? false,
    advance: () => service?.advanceStep(),
    isLastStep: service?.isLastPlanStep ?? false,
  };
}

/**
 * Comprehensive plan hook that combines all plan data
 * Use specific hooks above for better performance
 *
 * @example
 * ```tsx
 * const plan = usePlan(service);
 * if (!plan.hasPlan) return null;
 * return <Text>{plan.currentStep?.name}</Text>;
 * ```
 */
export function usePlan(service: ActivityRecorderService | null) {
  useServiceEvent(service, "stepChanged");
  useServiceEvent(service, "stateChanged");
  useServiceEvent(service, "planCleared");

  if (!service?.hasPlan) {
    return { hasPlan: false as const };
  }

  const currentStep = service.currentPlanStep;
  const duration = service.currentStepDurationMs;
  const elapsed = service.planStepElapsed;

  return {
    hasPlan: true as const,
    isActive: service.isPlanActive,
    isFinished: service.isPlanFinished,
    stepIndex: service.planStepIndex,
    stepCount: service.planStepCount,
    currentStep,
    nextStep: service.getPlanStep(service.planStepIndex + 1),
    timer:
      duration > 0
        ? {
            elapsed,
            remaining: Math.max(0, duration - elapsed),
            progress: Math.min(1, elapsed / duration),
          }
        : null,
    canAdvance: service.canManuallyAdvanceStep,
    advance: () => service.advanceStep(),
    isLastStep: service.isLastPlanStep,
  };
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
 * Includes recording controls, device management, permissions, and plan management.
 *
 * @param service - ActivityRecorderService instance
 * @returns All available actions
 *
 * @example
 * ```tsx
 * const { start, pause, resume, finish, scanDevices, advanceStep } = useRecorderActions(service);
 * ```
 */
export function useRecorderActions(
  service: ActivityRecorderService | null,
): RecorderActions {
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Recording controls
  const start = useCallback(async () => {
    if (!service) return;
    await service.startRecording();
  }, [service]);

  const pause = useCallback(() => {
    if (!service) return;
    service.pauseRecording();
  }, [service]);

  const resume = useCallback(() => {
    if (!service) return;
    service.resumeRecording();
  }, [service]);

  const finish = useCallback(() => {
    if (!service) return;
    service.finishRecording();
  }, [service]);

  // Activity selection
  const selectActivity = useCallback(
    (type: PublicActivityType) => {
      if (!service) return;
      service.selectUnplannedActivity(type);
    },
    [service],
  );

  const selectPlannedActivity = useCallback(
    (plan: RecordingServiceActivityPlan, plannedId?: string) => {
      if (!service) return;
      service.selectPlan(plan, plannedId);
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

  // Plan management
  const advanceStep = useCallback(async (): Promise<boolean> => {
    if (!service?.hasPlan || isAdvancing) {
      console.log("Cannot advance step: no service or already advancing");
      return false;
    }

    setIsAdvancing(true);
    try {
      service.advanceStep();
      return true;
    } catch (error) {
      console.error("Error advancing step:", error);
      return false;
    } finally {
      // Add delay to prevent rapid clicking
      setTimeout(() => setIsAdvancing(false), 500);
    }
  }, [service, isAdvancing]);

  const skipStep = useCallback(() => {
    if (!service?.hasPlan) return;
    // Skip step - advance to next step
    service.advanceStep();
  }, [service]);

  const resetPlan = useCallback(() => {
    if (!service?.hasPlan) return;
    // Reset plan - clear and reselect if needed
    service.clearPlan();
  }, [service]);

  return {
    // Recording controls
    start,
    pause,
    resume,
    finish,

    // Activity selection
    selectActivity,
    selectPlannedActivity,

    // Device management
    scanDevices,
    connectDevice,
    disconnectDevice,

    // Permission management
    checkPermissions,
    ensurePermission,

    // Plan management
    advanceStep,
    skipStep,
    resetPlan,

    // State flags
    isAdvancing,
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
