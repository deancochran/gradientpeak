/**
 * useActivityRecorder - Consolidated Activity Recorder Hooks
 *
 * Single source of truth for all ActivityRecorder service interactions.
 *
 */

import type { ActivityPayload, MetricFamily, RecordingActivityCategory } from "@repo/core";
import { useCallback, useEffect, useState } from "react";
import type { Device } from "react-native-ble-plx";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PersistedSensor } from "@/lib/services/ActivityRecorder/sensors";
import type { RecordingSessionView } from "@/lib/services/ActivityRecorder/types";

// ================================
// Types
// ================================

export interface RecordingCommands {
  // Recording controls
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<void>;

  // Activity selection
  selectActivity: (category: RecordingActivityCategory, gpsRecordingEnabled: boolean) => void;
  selectActivityFromPayload: (payload: ActivityPayload) => void;
  advancePlanStep: () => void;
  skipPlanStep: () => void;
  previousPlanStep: () => void;

  // Device management
  startScan: () => Promise<void>; // Event-based scanning
  stopScan: () => void;
  subscribeScan: (callback: (device: Device) => void) => () => void;
  connectDevice: (deviceId: string) => Promise<void>;
  disconnectDevice: (deviceId: string) => Promise<void>;
  forgetDevice: (deviceId: string) => Promise<void>;
  resetSensors: () => Promise<void>;

  // Metric sources
  setPreferredMetricSource: (metricFamily: MetricFamily, sourceId: string) => void;
  clearPreferredMetricSource: (metricFamily: MetricFamily) => void;
  disableMetricSource: (metricFamily: MetricFamily, sourceId: string) => void;
  enableMetricSource: (metricFamily: MetricFamily, sourceId: string) => void;

  // FTMS control
  selectFTMSControlTarget: (deviceId: string | null) => boolean;
}

export function useKnownSensors(service: ActivityRecorderService | null): PersistedSensor[] {
  const [sensors, setSensors] = useState<PersistedSensor[]>(
    () => service?.sensorsManager.getPersistedSensors() || [],
  );

  useEffect(() => {
    if (!service) {
      setSensors([]);
      return;
    }

    return service.sensorsManager.subscribePersistedSensors(setSensors);
  }, [service]);

  return sensors;
}

export function useRecordingCommands(service: ActivityRecorderService | null): RecordingCommands {
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
  const selectActivityFromPayload = useCallback(
    (payload: ActivityPayload) => {
      service?.selectActivityFromPayload(payload);
    },
    [service],
  );
  const advancePlanStep = useCallback(() => service?.advanceStep(), [service]);
  const skipPlanStep = useCallback(() => service?.skipStep(), [service]);
  const previousPlanStep = useCallback(() => service?.previousStep(), [service]);

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
      await service.connectSensorForRecording(deviceId);
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

  const forgetDevice = useCallback(
    async (deviceId: string) => {
      if (!service) return;
      await service.sensorsManager.forgetSensor(deviceId);
    },
    [service],
  );

  const resetSensors = useCallback(async () => {
    if (!service) return;
    await service.resetAllSensors();
  }, [service]);

  const setPreferredMetricSource = useCallback(
    (metricFamily: MetricFamily, sourceId: string) => {
      service?.setPreferredMetricSource(metricFamily, sourceId);
    },
    [service],
  );

  const clearPreferredMetricSource = useCallback(
    (metricFamily: MetricFamily) => {
      service?.clearPreferredMetricSource(metricFamily);
    },
    [service],
  );

  const disableMetricSource = useCallback(
    (metricFamily: MetricFamily, sourceId: string) => {
      service?.disableMetricSource(metricFamily, sourceId);
    },
    [service],
  );

  const enableMetricSource = useCallback(
    (metricFamily: MetricFamily, sourceId: string) => {
      service?.enableMetricSource(metricFamily, sourceId);
    },
    [service],
  );

  const selectFTMSControlTarget = useCallback(
    (deviceId: string | null) => service?.selectFTMSControlTarget(deviceId) ?? false,
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
    selectActivityFromPayload,
    advancePlanStep,
    skipPlanStep,
    previousPlanStep,

    // Device management
    startScan,
    stopScan,
    subscribeScan,
    connectDevice,
    disconnectDevice,
    forgetDevice,
    resetSensors,
    setPreferredMetricSource,
    clearPreferredMetricSource,
    disableMetricSource,
    enableMetricSource,
    selectFTMSControlTarget,
  };
}

export function useBleState(service: ActivityRecorderService | null): string {
  const [bleState, setBleState] = useState(service?.getBleState() ?? "Unknown");

  useEffect(() => {
    if (!service) {
      setBleState("Unknown");
      return;
    }

    return service.sensorsManager.subscribeBleState(setBleState);
  }, [service]);

  return bleState;
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
