/**
 * useActivityRecorder - Consolidated Activity Recorder Hooks
 *
 * Single source of truth for all ActivityRecorder service interactions.
 *
 * @example
 * ```tsx
 * const service = useActivityRecorder(profile);
 * const state = useRecordingState(service);
 * const metrics = useLiveMetrics(service);
 * const { sensors, count } = useSensors(service);
 * const actions = useRecorderActions(service);
 * ```
 */

import type { PlannedActivityProgress } from "@/lib/services/ActivityRecorder";
import {
  ActivityRecorderService,
  RecordingState,
} from "@/lib/services/ActivityRecorder";
import type { PermissionState } from "@/lib/services/ActivityRecorder/permissions";
import type { ConnectedSensor } from "@/lib/services/ActivityRecorder/sensors";
import type {
  PublicActivityType,
  PublicProfilesRow,
  RecordingServiceActivityPlan,
} from "@repo/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Device } from "react-native-ble-plx";

// ================================
// Types
// ================================

/**
 * Consolidated live metrics returned by useLiveMetrics
 */
export interface LiveMetrics {
  // Core metrics
  heartrate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
  elapsedTime?: number;

  // Heart rate analysis
  hrZones: { z1: number; z2: number; z3: number; z4: number; z5: number };
  hrAvg: number;
  hrMax: number;
  maxPctThreshold: number;

  // Power analysis
  powerZones: {
    z1: number;
    z2: number;
    z3: number;
    z4: number;
    z5: number;
    z6: number;
    z7: number;
  };
  powerAvg: number;
  powerMax: number;
  normalizedPower: number;
  totalWork: number;

  // Distance & speed
  avgSpeed: number;
  maxSpeed: number;
  movingTime: number;

  // Elevation
  totalAscent: number;
  totalDescent: number;
  avgGrade: number;
  elevationGainPerKm: number;
  current?: number; // Current elevation

  // Advanced analysis
  tss: number;
  intensityFactor: number;
  variabilityIndex: number;
  efficiencyFactor: number;
  adherence: number;
  decoupling: number;

  // GPS
  latitude?: number;
  longitude?: number;
  altitude?: number;
  heading?: number;
}

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
 * Plan state with progress and activity type
 */
export interface PlanState {
  plan?: RecordingServiceActivityPlan;
  progress?: PlannedActivityProgress;
  activityType: PublicActivityType;
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
 * Creates and manages an ActivityRecorderService instance.
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
      setState(newState);
    };

    service.on("stateChange", handleStateChange);

    return () => {
      service.off("stateChange", handleStateChange);
    };
  }, [service]);

  return state;
}

// ================================
// 3. useLiveMetrics - Consolidated Metrics
// ================================

/**
 * Subscribe to all live metrics updates.
 * Returns comprehensive metrics object with all available data.
 *
 * @param service - ActivityRecorderService instance
 * @returns Consolidated live metrics
 *
 * @example
 * ```tsx
 * const metrics = useLiveMetrics(service);
 * const { heartrate, power, cadence, distance, elapsedTime } = metrics;
 * ```
 */
export function useLiveMetrics(
  service: ActivityRecorderService | null,
): LiveMetrics {
  const [metrics, setMetrics] = useState<LiveMetrics>(() =>
    getMetricsFromService(service),
  );

  useEffect(() => {
    if (!service?.liveMetricsManager) {
      setMetrics(getMetricsFromService(null));
      return;
    }

    // Initial metrics
    setMetrics(getMetricsFromService(service));

    // Subscribe to metrics updates
    const handleMetricsUpdate = () => {
      setMetrics(getMetricsFromService(service));
    };

    service.liveMetricsManager.on("metricsUpdate", handleMetricsUpdate);

    return () => {
      if (service.liveMetricsManager) {
        service.liveMetricsManager.off("metricsUpdate", handleMetricsUpdate);
      }
    };
  }, [service]);

  return metrics;
}

/**
 * Extract all metrics from service into consolidated object
 */
function getMetricsFromService(
  service: ActivityRecorderService | null,
): LiveMetrics {
  if (!service?.liveMetricsManager) {
    return getEmptyMetrics();
  }

  const metricsState = service.liveMetricsManager.getMetrics();

  return {
    // Core metrics - these need to come from buffer or sensor readings
    heartrate: undefined, // Will be set from live sensor data
    power: undefined,
    cadence: undefined,
    speed: metricsState.avgSpeed,
    distance: metricsState.distance,
    elapsedTime: metricsState.elapsedTime,

    // Heart rate analysis
    hrZones: {
      z1: metricsState.hrZone1Time,
      z2: metricsState.hrZone2Time,
      z3: metricsState.hrZone3Time,
      z4: metricsState.hrZone4Time,
      z5: metricsState.hrZone5Time,
    },
    hrAvg: metricsState.avgHeartRate,
    hrMax: metricsState.maxHeartRate,
    maxPctThreshold: metricsState.maxHrPctThreshold,

    // Power analysis
    powerZones: {
      z1: metricsState.powerZone1Time,
      z2: metricsState.powerZone2Time,
      z3: metricsState.powerZone3Time,
      z4: metricsState.powerZone4Time,
      z5: metricsState.powerZone5Time,
      z6: metricsState.powerZone6Time,
      z7: metricsState.powerZone7Time,
    },
    powerAvg: metricsState.avgPower,
    powerMax: metricsState.maxPower,
    normalizedPower: metricsState.normalizedPowerEst,
    totalWork: metricsState.totalWork,

    // Distance & speed
    avgSpeed: metricsState.avgSpeed,
    maxSpeed: metricsState.maxSpeed,
    movingTime: metricsState.movingTime,

    // Elevation
    totalAscent: metricsState.totalAscent,
    totalDescent: metricsState.totalDescent,
    avgGrade: metricsState.avgGrade,
    elevationGainPerKm: metricsState.elevationGainPerKm,
    current: undefined, // Current elevation not in LiveMetricsState

    // Advanced analysis
    tss: metricsState.trainingStressScoreEst,
    intensityFactor: metricsState.intensityFactorEst,
    variabilityIndex: metricsState.variabilityIndexEst,
    efficiencyFactor: metricsState.efficiencyFactorEst,
    adherence: 0, // Not in LiveMetricsState
    decoupling: 0, // Not in LiveMetricsState

    // GPS - not in LiveMetricsState, will be undefined
    latitude: undefined,
    longitude: undefined,
    altitude: undefined,
    heading: undefined,
  };
}

/**
 * Returns empty metrics object
 */
function getEmptyMetrics(): LiveMetrics {
  return {
    heartrate: undefined,
    power: undefined,
    cadence: undefined,
    speed: undefined,
    distance: undefined,
    elapsedTime: undefined,

    hrZones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
    hrAvg: 0,
    hrMax: 0,
    maxPctThreshold: 0,

    powerZones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0, z7: 0 },
    powerAvg: 0,
    powerMax: 0,
    normalizedPower: 0,
    totalWork: 0,

    avgSpeed: 0,
    maxSpeed: 0,
    movingTime: 0,

    totalAscent: 0,
    totalDescent: 0,
    avgGrade: 0,
    elevationGainPerKm: 0,
    current: undefined,

    tss: 0,
    intensityFactor: 0,
    variabilityIndex: 0,
    efficiencyFactor: 0,
    adherence: 0,
    decoupling: 0,

    latitude: undefined,
    longitude: undefined,
    altitude: undefined,
    heading: undefined,
  };
}

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
// 6. usePlan - Plan & Activity Type
// ================================

/**
 * Subscribe to activity plan, progress, and activity type.
 *
 * @param service - ActivityRecorderService instance
 * @returns Plan state
 *
 * @example
 * ```tsx
 * const { plan, progress, activityType } = usePlan(service);
 * ```
 */
export function usePlan(service: ActivityRecorderService | null): PlanState {
  const [planState, setPlanState] = useState<PlanState>(() => ({
    plan: service?.planManager?.selectedActivityPlan,
    progress: service?.planManager?.planProgress,
    activityType: service?.selectedActivityType || "indoor_bike_trainer",
  }));

  useEffect(() => {
    if (!service) {
      setPlanState({
        plan: undefined,
        progress: undefined,
        activityType: "indoor_bike_trainer",
      });
      return;
    }

    // Initial values
    setPlanState({
      plan: service.planManager?.selectedActivityPlan,
      progress: service.planManager?.planProgress,
      activityType: service.selectedActivityType,
    });

    // Subscribe to plan progress updates
    const handlePlanProgress = (newProgress: PlannedActivityProgress) => {
      setPlanState((prev) => ({
        ...prev,
        progress: newProgress,
      }));
    };

    // Subscribe to activity type changes
    const handleActivityTypeChange = (newType: PublicActivityType) => {
      setPlanState((prev) => ({
        ...prev,
        activityType: newType,
        plan: service.planManager?.selectedActivityPlan,
      }));
    };

    service.on("planProgressChanged", handlePlanProgress);
    service.on("activitySelected", handleActivityTypeChange);

    return () => {
      service.off("planProgressChanged", handlePlanProgress);
      service.off("activitySelected", handleActivityTypeChange);
    };
  }, [service]);

  return planState;
}

// ================================
// 7. useRecorderActions - All Actions Consolidated
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
      service.selectPlannedActivity(plan, plannedId);
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

  const skipStep = useCallback(() => {
    if (!service?.planManager) return;
    // Skip step - advance to next step
    service.planManager.advanceStep();
  }, [service]);

  const resetPlan = useCallback(() => {
    if (!service?.planManager) return;
    // Reset not implemented in PlanManager yet
    console.warn("Reset plan not yet implemented");
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
