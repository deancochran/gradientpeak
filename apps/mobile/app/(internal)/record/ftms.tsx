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

import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { ScrollView, View } from "react-native";
import { BikeControlUI } from "@/components/recording/ftms/BikeControlUI";
import { EllipticalControlUI } from "@/components/recording/ftms/EllipticalControlUI";
import { RowerControlUI } from "@/components/recording/ftms/RowerControlUI";
import { TreadmillControlUI } from "@/components/recording/ftms/TreadmillControlUI";
import { usePlan, useSessionView } from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

export default function FTMSControlPage() {
  const service = useSharedActivityRecorder();
  const plan = usePlan(service);
  const sessionView = useSessionView(service);
  const controlMode = sessionView?.overrideState.trainerMode ?? "auto";
  const machineType =
    sessionView?.trainer.machineType === "generic"
      ? "bike"
      : (sessionView?.trainer.machineType ?? null);

  /**
   * Toggle between Auto and Manual control modes
   * Auto mode: Machine follows plan targets automatically
   * Manual mode: User controls machine manually (overrides plan)
   */
  const handleToggleControlMode = () => {
    if (!service) return;

    if (controlMode === "auto") {
      // Switching to manual
      console.log("[FTMS Page] Switching to Manual mode");
      service.setManualControlMode(true);
    } else {
      // Switching to auto - reapply plan targets
      console.log("[FTMS Page] Switching to Auto mode");
      service.setManualControlMode(false);
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

  // No trainer connected
  if (!machineType) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-lg font-semibold text-center mb-2">No Trainer Connected</Text>
        <Text className="text-sm text-muted-foreground text-center">
          Connect an FTMS trainer via the Sensors page to control resistance, power, or incline.
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
          <Text className="text-2xl font-bold capitalize mb-2">{machineType} Control</Text>

          {/* Auto/Manual Mode Toggle */}
          <View className="flex-row items-center justify-between bg-card p-4 rounded-lg border border-border mt-3">
            <View className="flex-1">
              <Text className="text-sm font-medium">
                {controlMode === "auto" ? "Auto Mode" : "Manual Mode"}
              </Text>
              <Text className="text-xs text-muted-foreground mt-1">
                {controlMode === "auto"
                  ? plan.hasPlan
                    ? "Following plan targets automatically"
                    : "Auto mode (no plan active)"
                  : "Manual control enabled"}
              </Text>
            </View>
            <Button onPress={handleToggleControlMode} variant="default" size="sm">
              <Text className="text-xs text-primary-foreground font-medium">
                Switch to {controlMode === "auto" ? "Manual" : "Auto"}
              </Text>
            </Button>
          </View>
        </View>

        {/* Render machine-specific control UI */}
        {machineType === "bike" && (
          <BikeControlUI service={service} controlMode={controlMode} hasPlan={plan.hasPlan} />
        )}
        {machineType === "rower" && (
          <RowerControlUI service={service} controlMode={controlMode} hasPlan={plan.hasPlan} />
        )}
        {machineType === "treadmill" && (
          <TreadmillControlUI service={service} controlMode={controlMode} hasPlan={plan.hasPlan} />
        )}
        {machineType === "elliptical" && (
          <EllipticalControlUI service={service} controlMode={controlMode} hasPlan={plan.hasPlan} />
        )}
      </View>
    </ScrollView>
  );
}
