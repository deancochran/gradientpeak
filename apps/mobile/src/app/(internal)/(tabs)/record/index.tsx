import { EnhancedBluetoothModal } from "@/components/modals/EnhancedBluetoothModal";
import { PermissionsModal } from "@/components/modals/PermissionsModal";
import { Stepper, useStepper } from "@/components/ui/stepper";
import { Text } from "@/components/ui/text";
import { useRecordSelection } from "@/lib/hooks/useRecordSelection";
import { type PublicActivityType } from "@repo/core";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { ActivityModeStep } from "./components/ActivityModeStep";
import { BluetoothStep } from "./components/BluetoothStep";
import { PermissionsStep } from "./components/PermissionsStep";
import { PlannedActivityStep } from "./components/PlannedActivityStep";
import { ReadyStep } from "./components/ReadyStep";
import { UnplannedActivityStep } from "./components/UnplannedActivityStep";

export default function RecordScreen() {
  const selection = useRecordSelection();
  const router = useRouter();
  const { goToNext } = useStepper();

  // Mock permissions state for demonstration
  const [mockPermissions, setMockPermissions] = useState({
    location: {
      name: "Location",
      description: "GPS tracking",
      granted: false,
      canAskAgain: true,
      icon: "location" as const,
      required: true,
    },
    bluetooth: {
      name: "Bluetooth",
      description: "Device connections",
      granted: false,
      canAskAgain: true,
      icon: "bluetooth" as const,
      required: true,
    },
    motion: {
      name: "Motion & Fitness",
      description: "Activity detection",
      granted: false,
      canAskAgain: true,
      icon: "fitness" as const,
      required: false,
    },
  });

  // Reset selections when component mounts (tab is initialized)
  useEffect(() => {
    selection.reset();
  }, []);

  const handleModeSelect = useCallback(
    (mode: "planned" | "unplanned") => {
      selection.setActivityMode(mode);
      goToNext();
    },
    [selection, goToNext],
  );

  const handlePlannedActivitySelect = useCallback(
    (activityId: string, activityType: PublicActivityType) => {
      selection.setPlannedActivity(activityId, activityType);
      goToNext();
    },
    [selection, goToNext],
  );

  const handleUnplannedActivitySelect = useCallback(
    (activityType: PublicActivityType) => {
      selection.setActivityType(activityType);
      goToNext();
    },
    [selection, goToNext],
  );

  const handlePermissionsComplete = useCallback(() => {
    goToNext();
  }, [goToNext]);

  const handleBluetoothSkip = useCallback(() => {
    goToNext();
  }, [goToNext]);

  const handleComplete = useCallback(async () => {
    // Prepare workout data for recording
    const workoutData = {
      type: selection.selectedActivityType,
      plannedActivityId: selection.plannedActivityId,
      mode: selection.mode,
      connectedDevices: selection.connectedDevices,
    };

    // Navigate to recording screen with prepared data
    router.push({
      pathname: "/(internal)/recording",
      params: { workoutData: JSON.stringify(workoutData) },
    });

    // Reset selection state for next visit
    selection.reset();
  }, [selection, router]);

  // Mock permissions request handler
  const handleRequestPermissions = useCallback(async () => {
    // Mock granting permissions
    setMockPermissions((prev) => ({
      location: { ...prev.location, granted: true },
      bluetooth: { ...prev.bluetooth, granted: true },
      motion: { ...prev.motion, granted: true },
    }));

    selection.setPermissions({
      location: true,
      bluetooth: true,
      backgroundLocation: true,
    });

    selection.hidePermissionsModal();
    return true;
  }, [selection]);

  // Handle bluetooth device selection
  const handleBluetoothDeviceSelect = useCallback(
    (deviceId: string) => {
      selection.addConnectedDevice(deviceId);
    },
    [selection],
  );

  // Dynamic step configuration
  const steps = useMemo(() => {
    const stepConfigs = [
      {
        id: "mode",
        component: <ActivityModeStep onSelectMode={handleModeSelect} />,
        enabled: true,
      },
      {
        id: "activity",
        component:
          selection.mode === "planned" ? (
            <PlannedActivityStep
              onSelectActivity={handlePlannedActivitySelect}
            />
          ) : (
            <UnplannedActivityStep
              onSelectActivity={handleUnplannedActivitySelect}
            />
          ),
        enabled: selection.mode !== null,
      },
      {
        id: "permissions",
        component: (
          <PermissionsStep
            activityType={selection.selectedActivityType}
            onOpenPermissions={selection.showPermissionsModal}
            onComplete={handlePermissionsComplete}
            permissions={selection.permissions}
          />
        ),
        enabled: selection.selectedActivityType !== null,
      },
      {
        id: "bluetooth",
        component: (
          <BluetoothStep
            onOpenBluetooth={selection.showBluetoothModal}
            onSkip={handleBluetoothSkip}
            connectedDevices={selection.connectedDevices}
          />
        ),
        enabled: selection.selectedActivityType !== null,
      },
      {
        id: "ready",
        component: (
          <ReadyStep
            activityType={selection.selectedActivityType}
            mode={selection.mode}
            plannedActivityId={selection.plannedActivityId}
          />
        ),
        enabled: selection.selectedActivityType !== null,
      },
    ];

    return stepConfigs
      .filter((step) => step.enabled)
      .map((step) => step.component);
  }, [
    selection.mode,
    selection.selectedActivityType,
    selection.plannedActivityId,
    selection.connectedDevices,
    selection.permissions,
    handleModeSelect,
    handlePlannedActivitySelect,
    handleUnplannedActivitySelect,
    handlePermissionsComplete,
    handleBluetoothSkip,
  ]);

  // Step validation function
  const validateStep = useCallback(
    (step: number) => {
      switch (step) {
        case 0: // Mode selection
          return selection.mode !== null;
        case 1: // Activity selection
          return selection.selectedActivityType !== null;
        case 2: // Permissions
          return true; // Skip validation for permissions - they can proceed without
        case 3: // Bluetooth
          return true; // Skip validation for bluetooth - they can proceed without
        case 4: // Ready
          return true;
        default:
          return true;
      }
    },
    [selection.mode, selection.selectedActivityType],
  );

  const handleStepChange = useCallback(
    (step: number) => {
      if (!validateStep(step)) {
        return false;
      }
      return true;
    },
    [validateStep],
  );

  return (
    <>
      <Stepper
        initialStep={0}
        onStepChange={handleStepChange}
        onComplete={handleComplete}
        className="bg-background"
        header={({ currentStep, totalSteps, progress }) => (
          <View className="px-6 py-4 border-b border-border">
            <View className="flex-row justify-between mb-2">
              <Text className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {totalSteps}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {Math.round(progress)}%
              </Text>
            </View>
            <View className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <View
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </View>
          </View>
        )}
        scrollable={true}
        showScrollIndicator={false}
      >
        {steps.map((step, index) => (
          <Stepper.Step key={index}>{step}</Stepper.Step>
        ))}
      </Stepper>

      {/* Permissions Modal */}
      <PermissionsModal
        visible={selection.showPermissionsModal}
        onClose={selection.hidePermissionsModal}
        permissions={mockPermissions}
        onRequestPermissions={handleRequestPermissions}
      />

      {/* Bluetooth Modal */}
      <EnhancedBluetoothModal
        visible={selection.showBluetoothModal}
        onClose={selection.hideBluetoothModal}
        onSelectDevice={handleBluetoothDeviceSelect}
      />
    </>
  );
}
