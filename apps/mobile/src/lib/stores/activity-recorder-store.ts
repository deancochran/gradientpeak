// stores/activityRecorderStore.ts
//
// ⚠️ DEPRECATED: This Zustand store is being phased out in favor of EventEmitter-based
// service management. New code should use the event-based hooks from
// `useActivityRecorderEvents.ts` directly with fresh service instances.
//
// See: Service Instance Management implementation in useActivityRecorderInit.ts
// Migration guide: Each recording session now gets a fresh ActivityRecorderService
// instance instead of complex state reset mechanisms.
//
// This file is kept for backward compatibility but should not be used in new code.

import { create } from "zustand";
import { PublicActivityType, RecordingServiceActivityPlan } from "@repo/core";
import {
  ActivityRecorderService,
  RecordingState,
} from "../services/ActivityRecorder";
import { PermissionState } from "../services/ActivityRecorder/permissions";

// ================================
// Types
// ================================

interface LiveMetrics {
  heartrate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  heading?: number;
  elapsedTime?: number;
}

// ================================
// Store - Mirrors your service state
// ================================

interface ActivityRecorderStore {
  // State (synced from service)
  state: RecordingState;
  activityType: PublicActivityType;
  liveMetrics: LiveMetrics;
  connectedSensors: any[];
  permissions: Record<string, PermissionState | null>;
  activityPlan?: RecordingServiceActivityPlan;
  planProgress?: any;

  // Internal
  _service?: ActivityRecorderService;
  _unsubscribe?: () => void;

  // Sync from service (called by bridge)
  syncFromService: (service: ActivityRecorderService) => void;

  // Initialize (connects service to store)
  initialize: (service: ActivityRecorderService) => void;

  // Cleanup
  cleanup: () => void;
}

export const useActivityRecorderStore = create<ActivityRecorderStore>(
  (set, get) => ({
    // Initial state
    state: "pending",
    activityType: "indoor_bike_trainer",
    liveMetrics: {},
    connectedSensors: [],
    permissions: {},

    // Sync state from your existing service
    // Sync from service (called by bridge)
    syncFromService: (service: ActivityRecorderService) => {
      const currentState = get();

      // Convert Map to plain object for React
      const metricsObj: LiveMetrics = {};
      service.liveMetrics.forEach((value, key) => {
        metricsObj[key as keyof LiveMetrics] = value;
      });

      // Only update if something actually changed
      const newState = service.state;
      const newActivityType = service.selectedActivityType;
      const newConnectedSensors = service.getConnectedSensors();
      const newPlanProgress = service.planManager?.planProgress;
      const newActivityPlan = service.planManager?.selectedActivityPlan;
      const newPermissions = service.permissionsManager.permissions;

      // Check if we need to update
      const stateChanged = currentState.state !== newState;
      const activityTypeChanged = currentState.activityType !== newActivityType;
      const sensorsChanged =
        JSON.stringify(currentState.connectedSensors) !==
        JSON.stringify(newConnectedSensors);
      const planProgressChanged =
        JSON.stringify(currentState.planProgress) !==
        JSON.stringify(newPlanProgress);
      const planChanged =
        JSON.stringify(currentState.activityPlan) !==
        JSON.stringify(newActivityPlan);
      const permissionsChanged =
        JSON.stringify(currentState.permissions) !==
        JSON.stringify(newPermissions);
      // More efficient metrics comparison - check individual metrics
      let metricsChanged = false;
      const currentMetrics = currentState.liveMetrics;
      for (const [key, value] of Object.entries(metricsObj)) {
        if (currentMetrics[key as keyof LiveMetrics] !== value) {
          metricsChanged = true;
          break;
        }
      }
      // Also check if any metrics were removed
      if (!metricsChanged) {
        for (const key of Object.keys(currentMetrics)) {
          if (!(key in metricsObj)) {
            metricsChanged = true;
            break;
          }
        }
      }

      if (
        stateChanged ||
        activityTypeChanged ||
        sensorsChanged ||
        planProgressChanged ||
        planChanged ||
        permissionsChanged ||
        metricsChanged
      ) {
        set({
          state: newState,
          activityType: newActivityType,
          liveMetrics: metricsObj,
          connectedSensors: newConnectedSensors,
          planProgress: newPlanProgress,
          activityPlan: newActivityPlan,
          permissions: { ...newPermissions },
        });
      }
    },

    // Initialize - subscribe to service changes
    initialize: (service: ActivityRecorderService) => {
      const currentState = get();

      // Cleanup existing subscription
      if (currentState._unsubscribe) {
        currentState._unsubscribe();
      }

      // Initial sync
      get().syncFromService(service);

      // Subscribe to all service changes
      const unsubscribe = service.subscribe(() => {
        get().syncFromService(service);
      });

      set({ _service: service, _unsubscribe: unsubscribe });
    },

    // Cleanup
    cleanup: () => {
      const state = get();
      if (state._unsubscribe) {
        state._unsubscribe();
      }
      set({ _service: undefined, _unsubscribe: undefined });
    },
  }),
);

// ================================
// Granular Hooks - Subscribe to specific data
// ================================

// Get single metric (only re-renders when THIS metric changes)
export const useMetric = (metricName: keyof LiveMetrics) => {
  return useActivityRecorderStore((state) => state.liveMetrics[metricName]);
};

// Get recording state
export const useRecordingState = () => {
  return useActivityRecorderStore((state) => state.state);
};

// Get activity type
export const useActivityType = () => {
  return useActivityRecorderStore((state) => state.activityType);
};

// Get heart rate (common, so make it easy)
export const useHeartRate = () => useMetric("heartrate");

// Get power (common for cycling)
export const usePower = () => useMetric("power");

// Get cadence
export const useCadence = () => useMetric("cadence");

// Get speed
export const useSpeed = () => useMetric("speed");

// Get elapsed time (common for all activities)
export const useElapsedTime = () => useMetric("elapsedTime");

// Get location data
export const useLocation = () => {
  return useActivityRecorderStore((state) => ({
    latitude: state.liveMetrics.latitude,
    longitude: state.liveMetrics.longitude,
    altitude: state.liveMetrics.altitude,
    heading: state.liveMetrics.heading,
  }));
};

// Get sensor count without subscribing to array changes
export const useSensorCount = () => {
  return useActivityRecorderStore((state) => state.connectedSensors.length);
};

// Only re-render when specific sensor connects/disconnects
export const useSensorConnection = (deviceId: string) => {
  return useActivityRecorderStore((state) =>
    state.connectedSensors.find((s) => s.id === deviceId),
  );
};

// Only re-render when specific permission changes
export const usePermission = (type: string) => {
  return useActivityRecorderStore((state) => state.permissions[type]);
};

// Get all permissions (use sparingly - re-renders when any permission changes)
export const usePermissions = () => {
  return useActivityRecorderStore((state) => state.permissions);
};

// Get plan progress (for interval workouts)
export const usePlanProgress = () => {
  return useActivityRecorderStore((state) => state.planProgress);
};

// Get activity plan
export const useActivityPlan = () => {
  return useActivityRecorderStore((state) => state.activityPlan);
};

// ❌ REMOVED - Use specific metric hooks instead to avoid unnecessary re-renders
// export const useLiveMetrics = () => {
//   return useActivityRecorderStore((state) => state.liveMetrics);
// };

// ================================
// Service Action Hooks
// ================================

// Get the service instance to call methods
export const useActivityRecorderService = () => {
  return useActivityRecorderStore((state) => state._service);
};

// Convenient action hooks that call service methods
export const useRecordingActions = () => {
  const service = useActivityRecorderService();

  return {
    start: () => service?.startRecording(),
    pause: () => service?.pauseRecording(),
    resume: () => service?.resumeRecording(),
    finish: () => service?.finishRecording(),
  };
};

export const useActivitySelection = () => {
  const service = useActivityRecorderService();

  return {
    selectActivity: (type: PublicActivityType) =>
      service?.selectUnplannedActivity(type),
    selectPlannedActivity: (
      plan: RecordingServiceActivityPlan,
      plannedId?: string,
    ) => service?.selectPlannedActivity(plan, plannedId),
  };
};

export const useDeviceActions = () => {
  const service = useActivityRecorderService();

  return {
    scan: () => service?.scanForDevices() ?? Promise.resolve([]),
    connect: (deviceId: string) => service?.connectToDevice(deviceId),
    disconnect: (deviceId: string) => service?.disconnectDevice(deviceId),
  };
};

export const usePermissionActions = () => {
  const service = useActivityRecorderService();

  return {
    check: () => service?.permissionsManager.checkAll(),
    ensure: (type: any) => service?.ensurePermission(type),
  };
};

// Plan management actions
export const usePlanActions = () => {
  const service = useActivityRecorderService();

  return {
    resumePlan: () => service?.planManager?.advanceStep(),
    resetPlan: () => service?.planManager?.reset(),
    skipStep: () => service?.planManager?.skipCurrentStep(),
  };
};

// ================================
// Optimized Hooks for Recording Dashboard
// ================================

// Get multiple metrics at once (more efficient than individual hooks if you need several)
export const useDashboardMetrics = () => {
  return useActivityRecorderStore(
    (state) => ({
      heartrate: state.liveMetrics.heartrate,
      power: state.liveMetrics.power,
      cadence: state.liveMetrics.cadence,
      speed: state.liveMetrics.speed,
      distance: state.liveMetrics.distance,
      elapsedTime: state.liveMetrics.elapsedTime,
    }),
    (a, b) =>
      a.heartrate === b.heartrate &&
      a.power === b.power &&
      a.cadence === b.cadence &&
      a.speed === b.speed &&
      a.distance === b.distance &&
      a.elapsedTime === b.elapsedTime,
  );
};

// Get GPS metrics together (common for outdoor activities)
export const useGPSMetrics = () => {
  return useActivityRecorderStore(
    (state) => ({
      latitude: state.liveMetrics.latitude,
      longitude: state.liveMetrics.longitude,
      altitude: state.liveMetrics.altitude,
      heading: state.liveMetrics.heading,
    }),
    (a, b) =>
      a.latitude === b.latitude &&
      a.longitude === b.longitude &&
      a.altitude === b.altitude &&
      a.heading === b.heading,
  );
};

// Check if recording can be started
export const useCanStartRecording = () => {
  return useActivityRecorderStore(
    (state) => state.state === "ready" || state.state === "pending",
  );
};

// Check if recording is active (recording or paused)
export const useIsRecordingActive = () => {
  return useActivityRecorderStore(
    (state) => state.state === "recording" || state.state === "paused",
  );
};

// Get sensor connection status for common sensor types
export const useHeartRateSensor = () => {
  return useActivityRecorderStore((state) =>
    state.connectedSensors.find((s) => s.type === "heartRate"),
  );
};

export const usePowerSensor = () => {
  return useActivityRecorderStore((state) =>
    state.connectedSensors.find((s) => s.type === "power"),
  );
};

export const useCadenceSensor = () => {
  return useActivityRecorderStore((state) =>
    state.connectedSensors.find((s) => s.type === "cadence"),
  );
};
