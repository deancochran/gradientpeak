// stores/activityRecorderStore.ts
import { create } from "zustand";
import { PublicActivityType, RecordingServiceActivityPlan } from "@repo/core";
import {
  ActivityRecorderService,
  RecordingState,
} from "../services/ActivityRecorder";
import { PermissionState } from "../services/ActivityRecorder/permissions";
import { Device } from "react-native-ble-plx";

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
    syncFromService: (service: ActivityRecorderService) => {
      // Convert Map to plain object for React
      const metricsObj: LiveMetrics = {};
      service.liveMetrics.forEach((value, key) => {
        metricsObj[key as keyof LiveMetrics] = value;
      });

      set({
        state: service.state,
        activityType: service.selectedActivityType,
        liveMetrics: metricsObj,
        connectedSensors: service.getConnectedSensors(),
        planProgress: service.planManager?.planProgress,
        activityPlan: service.planManager?.selectedActivityPlan,
        permissions: { ...service.permissionsManager.permissions },
      });
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

// Get location data
export const useLocation = () => {
  return useActivityRecorderStore((state) => ({
    latitude: state.liveMetrics.latitude,
    longitude: state.liveMetrics.longitude,
    altitude: state.liveMetrics.altitude,
    heading: state.liveMetrics.heading,
  }));
};

// Get connected sensors
export const useConnectedSensors = () => {
  return useActivityRecorderStore((state) => state.connectedSensors);
};

// Get permissions
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

// Get all live metrics (use sparingly - causes re-render on any metric change)
export const useLiveMetrics = () => {
  return useActivityRecorderStore((state) => state.liveMetrics);
};

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
