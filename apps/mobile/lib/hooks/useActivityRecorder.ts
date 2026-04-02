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

import type { RecordingActivityCategory, RecordingServiceActivityPlan } from "@repo/core";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Device } from "react-native-ble-plx";
import {
  ActivityRecorderService,
  RecordingState,
  TimeUpdate,
} from "@/lib/services/ActivityRecorder";
import type { ConnectedSensor } from "@/lib/services/ActivityRecorder/sensors";
import type {
  CurrentReadings,
  RecorderProfileRef,
  RecordingSessionSnapshot,
  RecordingSessionView,
  SessionStats,
} from "@/lib/services/ActivityRecorder/types";

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
 * All recorder actions consolidated
 */
export interface RecorderActions {
  // Recording controls
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<void>;

  // Activity selection
  selectActivity: (category: RecordingActivityCategory, gpsRecordingEnabled: boolean) => void;

  // Device management
  startScan: () => Promise<void>; // Event-based scanning
  stopScan: () => void;
  subscribeScan: (callback: (device: Device) => void) => () => void;
  connectDevice: (deviceId: string) => Promise<void>;
  disconnectDevice: (deviceId: string) => Promise<void>;
  resetSensors: () => Promise<void>;
}

export type RecorderHookCompatibilityStatus =
  | "canonical_selector"
  | "compatibility_wrapper"
  | "legacy_direct_access";

export const RECORDER_HOOK_COMPATIBILITY_PLAN = {
  useSessionView: {
    status: "canonical_selector",
    replacement: "useSessionView",
  },
  useSessionSnapshot: {
    status: "canonical_selector",
    replacement: "useSessionSnapshot",
  },
  useCurrentReadings: {
    status: "compatibility_wrapper",
    replacement: "useSessionView",
  },
  useSessionStats: {
    status: "compatibility_wrapper",
    replacement: "useSessionView",
  },
  usePlan: {
    status: "compatibility_wrapper",
    replacement: "useSessionView",
  },
  useActivityRecorderData: {
    status: "compatibility_wrapper",
    replacement: "useSessionView",
  },
  useSensors: {
    status: "legacy_direct_access",
    replacement: "future session-connected-devices selector",
  },
  useRecorderActions: {
    status: "compatibility_wrapper",
    replacement: "controller-backed actions",
  },
} as const satisfies Record<
  string,
  { status: RecorderHookCompatibilityStatus; replacement: string }
>;

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
  profile: RecorderProfileRef | null,
): ActivityRecorderService | null {
  const service = useMemo(() => {
    if (!profile) return null;
    console.log("[useActivityRecorder] Creating new service instance for profile:", profile.id);
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
export function useActivityRecorderData(service: ActivityRecorderService | null) {
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
    recordingId: service?.recordingMetadata?.eventId,

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
export function useRecordingState(service: ActivityRecorderService | null): RecordingState {
  const [state, setState] = useState<RecordingState>(service?.state ?? "pending");

  useEffect(() => {
    if (!service) return;

    // Initial state
    setState(service.state);

    // Subscribe to state changes
    const handleStateChange = (newState: RecordingState) => {
      console.log("[useRecordingState] State changed:", newState);
      setState(newState);
    };

    const subscription = service.addListener("stateChanged", handleStateChange);

    return () => {
      subscription.remove();
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
export function useSensors(service: ActivityRecorderService | null): SensorsState {
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

    const subscription = service.addListener("sensorsChanged", handleSensorsChange);

    return () => {
      subscription.remove();
    };
  }, [service]);

  return {
    sensors,
    count: sensors.length,
  };
}

// ================================
// Plan Hooks (Direct Service Access)
// ================================

/**
 * Helper hook to subscribe to service events and trigger re-renders
 */
function useServiceEvent(service: ActivityRecorderService | null, event: string): void {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!service) return undefined;
    const subscription = service.addListener(event, forceUpdate);
    return () => subscription.remove();
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
  const planView = useSessionSelector(service, (view) => view.plan, {
    hasPlan: false,
    stepIndex: 0,
    stepCount: 0,
    progress: null,
    isLast: false,
    isFinished: false,
    canAdvance: false,
    planTimeRemaining: 0,
  });

  if (!planView.hasPlan) {
    return {
      hasPlan: false as const,
      select: (plan: RecordingServiceActivityPlan, eventId?: string) =>
        service?.selectPlan(plan, eventId),
      clear: () => service?.clearPlan(),
    };
  }

  return {
    hasPlan: true as const,
    name: planView.name,
    description: planView.description,
    activityType: planView.activityType,
    stepIndex: planView.stepIndex,
    stepCount: planView.stepCount,
    currentStep: planView.currentStep,
    progress: planView.progress,
    isLast: planView.isLast,
    isFinished: planView.isFinished,
    canAdvance: planView.canAdvance,
    advance: () => service?.advanceStep(),
    select: (plan: RecordingServiceActivityPlan, eventId?: string) =>
      service?.selectPlan(plan, eventId),
    clear: () => service?.clearPlan(),
    planTimeRemaining: planView.planTimeRemaining,
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
export function useElapsedTime(service: ActivityRecorderService | null): number {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!service) return;

    const handleUpdate = ({ elapsed }: TimeUpdate) => setTime(elapsed);
    const subscription = service.addListener("timeUpdated", handleUpdate);

    return () => subscription.remove();
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
    const subscription = service.addListener("timeUpdated", handleUpdate);

    return () => subscription.remove();
  }, [service]);

  return time;
}

/**
 * Hook to track current lap time (time since last lap)
 * Updates on time updates and lap recordings
 * Returns time in seconds (consistent with useMovingTime)
 */
export function useLapTime(service: ActivityRecorderService | null): number {
  const [lapTime, setLapTime] = useState(0);

  useEffect(() => {
    if (!service) return;

    // Update lap time on time updates
    const handleTimeUpdate = () => {
      // Convert milliseconds to seconds for consistency with other time hooks
      setLapTime(Math.floor(service.getLapTime() / 1000));
    };

    // Reset lap time display when a lap is recorded
    const handleLapRecorded = () => {
      setLapTime(0);
    };

    const timeSubscription = service.addListener("timeUpdated", handleTimeUpdate);
    const lapSubscription = service.addListener("lapRecorded", handleLapRecorded);

    return () => {
      timeSubscription.remove();
      lapSubscription.remove();
    };
  }, [service]);

  return lapTime;
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
 * const { gpsRecordingEnabled, hasPlan } = useActivityStatus(service);
 *
 * // Use in card list determination
 * if (gpsRecordingEnabled) cardList.push('map');
 * if (hasPlan) cardList.push('plan');
 * ```
 */
export function useActivityStatus(service: ActivityRecorderService | null): {
  gpsRecordingEnabled: boolean;
  activityCategory: RecordingActivityCategory;
} {
  const snapshot = useSessionSnapshot(service);

  const activityCategory =
    snapshot?.activity.category ?? service?.selectedActivityCategory ?? "bike";
  const gpsRecordingEnabled =
    snapshot?.activity.gpsMode === "on" ||
    (!snapshot && (service?.isGpsRecordingEnabled() ?? true));

  return {
    gpsRecordingEnabled,
    activityCategory,
  };
}

// ================================
// GPS Tracking Control
// ================================

/**
 * Subscribe to GPS tracking state changes and provide toggle control.
 *
 * @param service - ActivityRecorderService instance
 * @returns GPS tracking state and control functions
 *
 * @example
 * ```tsx
 * const { gpsEnabled, toggleGps, enableGps, disableGps } = useGpsTracking(service);
 *
 * return (
 *   <Button onPress={toggleGps}>
 *     GPS: {gpsEnabled ? 'ON' : 'OFF'}
 *   </Button>
 * );
 * ```
 */
export function useGpsTracking(service: ActivityRecorderService | null) {
  const [gpsEnabled, setGpsEnabled] = useState(service?.isGpsRecordingEnabled() ?? true);

  useEffect(() => {
    if (!service) return;

    // Initialize with current state
    setGpsEnabled(service.isGpsRecordingEnabled());

    // Subscribe to GPS tracking changes
    const handleGpsTrackingChange = (enabled: boolean) => {
      console.log("[useGpsTracking] GPS tracking changed:", enabled);
      setGpsEnabled(enabled);
    };

    const subscription = service.addListener("gpsTrackingChanged", handleGpsTrackingChange);

    return () => {
      subscription.remove();
    };
  }, [service]);

  const toggleGps = useCallback(async () => {
    if (!service) return;
    await service.toggleGpsRecording();
  }, [service]);

  const enableGps = useCallback(async () => {
    if (!service) return;
    await service.enableGpsRecording();
  }, [service]);

  const disableGps = useCallback(async () => {
    if (!service) return;
    await service.disableGpsRecording();
  }, [service]);

  return {
    gpsEnabled,
    toggleGps,
    enableGps,
    disableGps,
  };
}

/**
 * Hook to track and control workout intensity scaling (FTP scale)
 */
export function useIntensityScale(service: ActivityRecorderService | null) {
  const [scale, setScale] = useState(service?.getIntensityScale() ?? 1.0);
  const [baseFtp, setBaseFtp] = useState(service?.getBaseFtp());
  const [baseThresholdHr, setBaseThresholdHr] = useState(service?.getBaseThresholdHr());
  const [baseWeight, setBaseWeight] = useState(service?.getBaseWeight());
  const [baseThresholdPace, setBaseThresholdPace] = useState(service?.getBaseThresholdPace());

  useEffect(() => {
    if (!service) return;

    const handleUpdate = () => {
      setScale(service.getIntensityScale());
      setBaseFtp(service.getBaseFtp());
      setBaseThresholdHr(service.getBaseThresholdHr());
      setBaseWeight(service.getBaseWeight());
      setBaseThresholdPace(service.getBaseThresholdPace());
    };

    // Initial state
    handleUpdate();

    const sub = service.addListener("metricsUpdated", handleUpdate);
    return () => sub.remove();
  }, [service]);

  return {
    scale,
    baseFtp,
    baseThresholdHr,
    baseWeight,
    baseThresholdPace,
    setIntensityScale: (s: number) => service?.setIntensityScale(s),
    updateMetrics: (m: Parameters<ActivityRecorderService["updateMetrics"]>[0]) =>
      service?.updateMetrics(m),
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
export function useRecorderActions(service: ActivityRecorderService | null): RecorderActions {
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
    (category: RecordingActivityCategory, gpsRecordingEnabled: boolean) => {
      if (!service) return;
      service.selectUnplannedActivity(category, gpsRecordingEnabled);
    },
    [service],
  );

  // Device management
  const startScan = useCallback(async (): Promise<void> => {
    if (!service) return;
    return await service.sensorsManager.startScan();
  }, [service]);

  const stopScan = useCallback((): void => {
    if (!service) return;
    service.sensorsManager.stopScan();
  }, [service]);

  const subscribeScan = useCallback(
    (callback: (device: Device) => void): (() => void) => {
      if (!service) return () => {};
      return service.sensorsManager.subscribeScan(callback);
    },
    [service],
  );

  const connectDevice = useCallback(
    async (deviceId: string) => {
      if (!service) return;
      await service.sensorsManager.connectSensor(deviceId);
    },
    [service],
  );

  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      if (!service) return;
      await service.sensorsManager.disconnectSensor(deviceId);
    },
    [service],
  );

  const resetSensors = useCallback(async () => {
    if (!service) return;
    await service.resetAllSensors();
  }, [service]);

  return {
    // Recording controls
    start,
    pause,
    resume,
    finish,

    // Activity selection
    selectActivity,

    // Device management
    startScan,
    stopScan,
    subscribeScan,
    connectDevice,
    disconnectDevice,
    resetSensors,
  };
}

/**
 * Compatibility selector over `useSessionView()` for current sensor readings.
 */
export function useCurrentReadings(service: ActivityRecorderService | null): CurrentReadings {
  return useSessionSelector(service, (view) => view.currentReadings, EMPTY_CURRENT_READINGS);
}

/**
 * Compatibility selector over `useSessionView()` for session statistics.
 */
export function useSessionStats(service: ActivityRecorderService | null): SessionStats {
  return useSessionSelector(service, (view) => view.sessionStats, EMPTY_SESSION_STATS);
}

export function useSessionSelector<T>(
  service: ActivityRecorderService | null,
  selector: (view: RecordingSessionView) => T,
  fallback: T,
): T {
  const view = useSessionView(service);
  return view ? selector(view) : fallback;
}

export function useSessionSnapshot(
  service: ActivityRecorderService | null,
): RecordingSessionSnapshot | null {
  const [snapshot, setSnapshot] = useState<RecordingSessionSnapshot | null>(
    service?.getSessionSnapshot() ?? null,
  );

  useEffect(() => {
    if (!service) {
      setSnapshot(null);
      return;
    }

    setSnapshot(service.getSessionSnapshot());

    const subscription = service.addListener("snapshotUpdated", setSnapshot);
    return () => subscription.remove();
  }, [service]);

  return snapshot;
}

export function useSessionView(
  service: ActivityRecorderService | null,
): RecordingSessionView | null {
  const [view, setView] = useState<RecordingSessionView | null>(service?.getSessionView() ?? null);

  useEffect(() => {
    if (!service) {
      setView(null);
      return;
    }

    setView(service.getSessionView());

    const subscription = service.addListener("sessionUpdated", setView);
    return () => subscription.remove();
  }, [service]);

  return view;
}

const EMPTY_CURRENT_READINGS: CurrentReadings = {};

const EMPTY_SESSION_STATS: SessionStats = {
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
