import { type PublicActivityType } from "@repo/core";
import { useEffect, useState } from "react";

interface RecordSelectionState {
  currentStep: number;
  mode: "planned" | "unplanned" | null;
  selectedActivityType: PublicActivityType | null;
  plannedActivityId: string | null;
  permissions: {
    location: boolean;
    backgroundLocation: boolean;
    bluetooth: boolean;
  };
  connectedDevices: string[];
  setupComplete: boolean;
  showPermissionsModal: boolean;
  showBluetoothModal: boolean;
}

const initialState: RecordSelectionState = {
  currentStep: 0,
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
  showPermissionsModal: false,
  showBluetoothModal: false,
};

export const useRecordSelection = () => {
  const [state, setState] = useState<RecordSelectionState>(initialState);

  // Reset state when hook is initialized (on tab focus)
  useEffect(() => {
    setState({
      ...initialState,
      currentStep: 0,
    });
  }, []);

  const reset = () => {
    setState(initialState);
  };

  const updateStep = (step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const setActivityMode = (mode: "planned" | "unplanned") => {
    setState((prev) => ({ ...prev, mode, currentStep: prev.currentStep + 1 }));
  };

  const setActivityType = (activityType: PublicActivityType) => {
    setState((prev) => ({
      ...prev,
      selectedActivityType: activityType,
      currentStep: prev.currentStep + 1,
    }));
  };

  const setPlannedActivity = (
    plannedActivityId: string,
    activityType: PublicActivityType,
  ) => {
    setState((prev) => ({
      ...prev,
      plannedActivityId,
      selectedActivityType: activityType,
      currentStep: prev.currentStep + 1,
    }));
  };

  const setPermissions = (
    permissions: Partial<RecordSelectionState["permissions"]>,
  ) => {
    setState((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, ...permissions },
    }));
  };

  const addConnectedDevice = (device: string) => {
    setState((prev) => ({
      ...prev,
      connectedDevices: [...prev.connectedDevices, device],
    }));
  };

  const completeSelection = () => {
    setState((prev) => ({ ...prev, setupComplete: true }));
  };

  const showPermissionsModal = () => {
    setState((prev) => ({ ...prev, showPermissionsModal: true }));
  };

  const hidePermissionsModal = () => {
    setState((prev) => ({ ...prev, showPermissionsModal: false }));
  };

  const showBluetoothModal = () => {
    setState((prev) => ({ ...prev, showBluetoothModal: true }));
  };

  const hideBluetoothModal = () => {
    setState((prev) => ({ ...prev, showBluetoothModal: false }));
  };

  return {
    ...state,
    reset,
    updateStep,
    setActivityMode,
    setActivityType,
    setPlannedActivity,
    setPermissions,
    addConnectedDevice,
    completeSelection,
    showPermissionsModal,
    hidePermissionsModal,
    showBluetoothModal,
    hideBluetoothModal,
  };
};
