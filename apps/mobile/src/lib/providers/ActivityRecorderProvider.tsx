import { PublicActivityType, RecordingServiceActivityPlan } from "@repo/core";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Device } from "react-native-ble-plx";
import {
  ActivityRecorderService,
  type RecordingState,
} from "../services/ActivityRecorder";
import { type PermissionState } from "../services/ActivityRecorder/permissions";

// ================================
// Context State Interface
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

interface ActivityRecorderContextValue {
  // Reactive state
  state: RecordingState;
  activityType: PublicActivityType;
  liveMetrics: LiveMetrics;
  connectedSensors: any[];
  permissions: Record<string, PermissionState | null>;
  plannedActivityId?: string;
  activityPlan?: RecordingServiceActivityPlan;
  planProgress?: any;

  // Actions
  startRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  resumePlan: () => Promise<void>;
  finishRecording: () => Promise<void>;

  // Selection Modal
  selectPlannedActivity: (plan: RecordingServiceActivityPlan) => void;
  selectActivityPlanTemplate: (
    activity_plan: RecordingServiceActivityPlan,
  ) => void;
  selectActivity: (type: PublicActivityType) => void;

  // Permissions Modal
  checkPermissions: () => Promise<void>;
  grantPermissions: (type: string) => Promise<void>;

  // Bluetooth Modal
  connectDevice: (deviceId: string) => Promise<void>;
  disconnectDevice: (deviceId: string) => Promise<void>;
  scanForDevices: () => Promise<Device[]>;
}

const ActivityRecorderContext =
  createContext<ActivityRecorderContextValue | null>(null);

// ================================
// Provider Component
// ================================

interface ActivityRecorderProviderProps {
  children: ReactNode;
  profileId: string;
}

// Singleton service instance
let serviceInstance: ActivityRecorderService | null = null;

export const ActivityRecorderProvider: React.FC<
  ActivityRecorderProviderProps
> = ({ children, profileId }) => {
  // Initialize service once
  const [service] = useState(() => {
    if (!serviceInstance) {
      serviceInstance = new ActivityRecorderService({ id: profileId } as any);
    }
    return serviceInstance;
  });

  // Reactive state
  const [state, setState] = useState<RecordingState>(service.state);
  const [activityType, setActivityType] = useState<PublicActivityType>(
    service.selectedActivityType,
  );
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({});
  const [connectedSensors, setConnectedSensors] = useState<any[]>([]);
  const [planProgress, setPlanProgress] = useState<any>();
  const [activityPlan, setActivityPlan] =
    useState<RecordingServiceActivityPlan>();
  const [permissions, setPermissions] = useState<
    Record<string, PermissionState | null>
  >({});

  // Sync state from service
  const syncState = useCallback(() => {
    setState(service.state);
    setActivityType(service.selectedActivityType);

    // Convert Map to plain object for React state
    const metricsObj: LiveMetrics = {};
    service.liveMetrics.forEach((value, key) => {
      metricsObj[key as keyof LiveMetrics] = value;
    });
    setLiveMetrics(metricsObj);

    setConnectedSensors(service.getConnectedSensors());
    setPlanProgress(service.planManager?.planProgress);
    setActivityPlan(service.planManager?.selectedActivityPlan);
    setPermissions({ ...service.permissionsManager.permissions });
  }, [service]);

  // Subscribe to service changes
  useEffect(() => {
    // Initial sync
    syncState();

    // Subscribe to changes
    const unsubscribe = service.subscribe(() => {
      syncState();
    });

    return unsubscribe;
  }, [service, syncState]);

  // Action wrappers
  const startRecording = useCallback(async () => {
    await service.startRecording();
  }, [service]);

  const pauseRecording = useCallback(async () => {
    await service.pauseRecording();
  }, [service]);

  const resumeRecording = useCallback(async () => {
    await service.resumeRecording();
  }, [service]);

  const finishRecording = useCallback(async () => {
    await service.finishRecording();
  }, [service]);

  const selectActivity = useCallback(
    (type: PublicActivityType) => {
      service.selectUnplannedActivity(type);
    },
    [service],
  );

  const selectPlannedActivity = useCallback(
    (plan: RecordingServiceActivityPlan) => {
      service.selectPlannedActivity(plan);
    },
    [service],
  );

  const selectActivityPlanTemplate = useCallback(
    (activity_plan: RecordingServiceActivityPlan) => {
      // Templates are just applied via selectPlannedActivity
      service.selectPlannedActivity(activity_plan);
    },
    [service],
  );

  const resumePlan = useCallback(async () => {
    if (service.planManager) {
      service.planManager.advanceStep();
    }
  }, [service]);

  const checkPermissions = useCallback(async () => {
    await service.permissionsManager.checkAll();
    setPermissions({ ...service.permissionsManager.permissions });
  }, [service]);

  const grantPermissions = useCallback(
    async (type: string) => {
      await service.ensurePermission(type as any);
      setPermissions({ ...service.permissionsManager.permissions });
    },
    [service],
  );

  const connectDevice = useCallback(
    async (deviceId: string) => {
      await service.connectToDevice(deviceId);
    },
    [service],
  );

  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      await service.disconnectDevice(deviceId);
    },
    [service],
  );

  const scanForDevices = useCallback(async () => {
    return await service.scanForDevices();
  }, [service]);

  const value: ActivityRecorderContextValue = {
    state,
    activityType,
    liveMetrics,
    connectedSensors,
    planProgress,
    activityPlan,
    permissions,
    startRecording,
    pauseRecording,
    resumeRecording,
    finishRecording,
    selectActivity,
    selectPlannedActivity,
    selectActivityPlanTemplate,
    resumePlan,
    checkPermissions,
    grantPermissions,
    connectDevice,
    disconnectDevice,
    scanForDevices,
  };

  return (
    <ActivityRecorderContext.Provider value={value}>
      {children}
    </ActivityRecorderContext.Provider>
  );
};

// ================================
// Hook
// ================================

export const useActivityRecorder = () => {
  const context = useContext(ActivityRecorderContext);
  if (!context) {
    throw new Error(
      "useActivityRecorder must be used within ActivityRecorderProvider",
    );
  }
  return context;
};

// ================================
// Cleanup
// ================================

export const cleanupActivityRecorder = async () => {
  if (serviceInstance) {
    await serviceInstance.cleanup();
    serviceInstance = null;
  }
};
