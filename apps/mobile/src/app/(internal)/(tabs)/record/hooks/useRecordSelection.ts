import { PublicActivityType } from "@repo/core";
import { useState } from "react";

export interface PermissionsState {
  location: boolean;
  backgroundLocation: boolean;
  bluetooth: boolean;
}

interface RecordSelectionState {
  mode: "planned" | "unplanned" | null;
  selectedActivityType: PublicActivityType | null;
  plannedActivityId: string | null;
  permissions: PermissionsState;
  connectedDevices: string[];
  setupComplete: boolean;
}

// Custom hook for record selection state
export function useRecordSelection() {
  const [state, setState] = useState<RecordSelectionState>({
    mode: null,
    selectedActivityType: null,
    plannedActivityId: null,
    permissions: {
      location: false,
      backgroundLocation: false,
      bluetooth: false,
    },
    connectedDevices: [],
    setupComplete: false,
  });

  const setMode = (mode: "planned" | "unplanned" | null) => {
    setState((prev: RecordSelectionState) => ({ ...prev, mode }));
  };

  const setActivityType = (activityType: PublicActivityType | null) => {
    setState((prev: RecordSelectionState) => ({
      ...prev,
      selectedActivityType: activityType,
    }));
  };

  const setPlannedActivity = (
    activityId: string | null,
    activityType: PublicActivityType | null = null,
  ) => {
    setState((prev: RecordSelectionState) => ({
      ...prev,
      plannedActivityId: activityId,
      selectedActivityType: activityType,
    }));
  };

  const setPermissions = (permissions: Partial<PermissionsState>) => {
    setState((prev: RecordSelectionState) => ({
      ...prev,
      permissions: { ...prev.permissions, ...permissions },
    }));
  };

  const addConnectedDevice = (device: string) => {
    setState((prev: RecordSelectionState) => ({
      ...prev,
      connectedDevices: [...prev.connectedDevices, device],
    }));
  };

  const reset = () => {
    setState({
      mode: null,
      selectedActivityType: null,
      plannedActivityId: null,
      permissions: {
        location: false,
        backgroundLocation: false,
        bluetooth: false,
      },
      connectedDevices: [],
      setupComplete: false,
    });
  };

  return {
    ...state,
    setMode,
    setActivityType,
    setPlannedActivity,
    setPermissions,
    addConnectedDevice,
    reset,
  };
}
