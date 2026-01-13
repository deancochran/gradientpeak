/**
 * FTMS Control Page
 *
 * Full-screen page for controlling FTMS machines during recording.
 * Accessed via navigation from footer "Adjust" tile.
 *
 * Features:
 * - Auto-detect connected FTMS machine type
 * - Route to machine-specific UI based on type
 * - Auto/Manual mode toggle (when plan is active)
 * - Standard back button navigation
 * - Recording continues in background
 */

import React, { useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { usePlan } from "@/lib/hooks/useActivityRecorder";

// Machine-specific UIs (to be implemented)
import { BikeControlUI } from "@/components/recording/ftms/BikeControlUI";
import { RowerControlUI } from "@/components/recording/ftms/RowerControlUI";
import { TreadmillControlUI } from "@/components/recording/ftms/TreadmillControlUI";
import { EllipticalControlUI } from "@/components/recording/ftms/EllipticalControlUI";

export default function FTMSControlPage() {
  const service = useSharedActivityRecorder();
  const plan = usePlan(service);

  const [machineType, setMachineType] = useState<string | null>(null);
  const [isControlMode, setIsControlMode] = useState<"auto" | "manual">("auto");
  const [isLoading, setIsLoading] = useState(true);

  // Detect connected FTMS machine type on mount
  useEffect(() => {
    detectMachineType();
  }, [service]);

  /**
   * Detect the type of connected FTMS machine
   * Uses FTMS features to determine machine type
   */
  const detectMachineType = () => {
    if (!service) {
      setIsLoading(false);
      return;
    }

    const trainer = service.sensorsManager.getControllableTrainer();

    if (!trainer || !trainer.ftmsFeatures) {
      console.warn("[FTMS Page] No controllable trainer connected");
      setMachineType(null);
      setIsLoading(false);
      return;
    }

    // Detect machine type based on FTMS features
    const features = trainer.ftmsFeatures;

    // Bike/Trainer: Supports power, cadence, indoor bike simulation
    if (
      features.indoorBikeSimulationSupported &&
      features.powerTargetSettingSupported
    ) {
      setMachineType("bike");
    }
    // Treadmill: Supports speed and inclination
    else if (
      features.speedTargetSettingSupported &&
      features.inclinationTargetSettingSupported
    ) {
      setMachineType("treadmill");
    }
    // Rower: Supports resistance, cadence (stroke rate)
    else if (
      features.resistanceTargetSettingSupported &&
      features.cadenceSupported
    ) {
      setMachineType("rower");
    }
    // Elliptical: Supports resistance, cadence, and step count
    else if (
      features.resistanceTargetSettingSupported &&
      features.stepCountSupported
    ) {
      setMachineType("elliptical");
    }
    // Default to bike if power target is supported (most trainers)
    else if (features.powerTargetSettingSupported) {
      setMachineType("bike");
    }
    // Default to resistance control
    else if (features.resistanceTargetSettingSupported) {
      setMachineType("bike"); // Use bike UI with resistance mode only
    }
    // Unknown/unsupported
    else {
      setMachineType(null);
      console.warn("[FTMS Page] Unknown machine type");
    }

    setIsLoading(false);
  };

  /**
   * Toggle between Auto and Manual control modes
   * Auto mode: Machine follows plan targets automatically
   * Manual mode: User controls machine manually (overrides plan)
   */
  const handleToggleControlMode = () => {
    if (isControlMode === "auto") {
      // Switching to manual
      Alert.alert(
        "Manual Control",
        "Plan targets will no longer be applied automatically. You will control the trainer manually.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enable Manual",
            onPress: () => setIsControlMode("manual"),
          },
        ]
      );
    } else {
      // Switching to auto
      setIsControlMode("auto");
    }
  };

  // No service available
  if (!service) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">No recording service active</Text>
      </View>
    );
  }

  // Loading machine detection
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-4">
          Detecting trainer...
        </Text>
      </View>
    );
  }

  // No trainer connected
  if (!machineType) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-lg font-semibold text-center mb-2">
          No Trainer Connected
        </Text>
        <Text className="text-sm text-muted-foreground text-center">
          Connect an FTMS trainer via the Sensors page to control resistance,
          power, or incline.
        </Text>
      </View>
    );
  }

  // Render machine-specific UI
  return (
    <ScrollView className="flex-1 bg-background" bounces={false}>
      <View className="px-4 pt-4 pb-6">
        {/* Header: Machine type and control mode toggle */}
        <View className="mb-6">
          <Text className="text-2xl font-bold capitalize mb-2">
            {machineType} Control
          </Text>

          {/* Auto/Manual Mode Toggle (only when plan is active) */}
          {plan.hasPlan && (
            <View className="flex-row items-center justify-between bg-card p-4 rounded-lg border border-border mt-3">
              <View className="flex-1">
                <Text className="text-sm font-medium">
                  {isControlMode === "auto" ? "Auto Mode" : "Manual Mode"}
                </Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  {isControlMode === "auto"
                    ? "Following plan targets automatically"
                    : "Manual control enabled"}
                </Text>
              </View>
              {/* TODO: Add Switch component when available */}
              <View
                onTouchEnd={handleToggleControlMode}
                className="bg-primary px-4 py-2 rounded"
              >
                <Text className="text-xs text-primary-foreground">
                  Toggle
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Render machine-specific control UI */}
        {machineType === "bike" && (
          <BikeControlUI
            service={service}
            controlMode={isControlMode}
            hasPlan={plan.hasPlan}
          />
        )}
        {machineType === "rower" && (
          <RowerControlUI
            service={service}
            controlMode={isControlMode}
            hasPlan={plan.hasPlan}
          />
        )}
        {machineType === "treadmill" && (
          <TreadmillControlUI
            service={service}
            controlMode={isControlMode}
            hasPlan={plan.hasPlan}
          />
        )}
        {machineType === "elliptical" && (
          <EllipticalControlUI
            service={service}
            controlMode={isControlMode}
            hasPlan={plan.hasPlan}
          />
        )}
      </View>
    </ScrollView>
  );
}
