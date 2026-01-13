/**
 * Elliptical Control UI
 *
 * Provides controls for smart elliptical machines.
 * Controls:
 * - Resistance level (1-20)
 * - Target cadence (steps per minute)
 * - Power display (read-only)
 *
 * Features:
 * - Auto/Manual mode (auto applies plan targets, manual allows user override)
 * - Grayed out controls in Auto mode
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Pressable, Alert } from "react-native";
import { Text } from "@/components/ui/text";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { usePlan, useCurrentReadings } from "@/lib/hooks/useActivityRecorder";

export interface EllipticalControlUIProps {
  service: ActivityRecorderService;
  controlMode: "auto" | "manual";
  hasPlan: boolean;
}

export function EllipticalControlUI({
  service,
  controlMode,
  hasPlan,
}: EllipticalControlUIProps) {
  const plan = usePlan(service);
  const currentReadings = useCurrentReadings(service);

  // Elliptical control state
  const [resistanceLevel, setResistanceLevel] = useState<number>(5); // 1-20
  const [targetCadence, setTargetCadence] = useState<number>(60); // steps per minute

  // Get trainer features
  const trainer = service.sensorsManager.getControllableTrainer();
  const features = trainer?.ftmsFeatures;

  const supportsResistance = features?.resistanceTargetSettingSupported ?? false;
  const supportsCadence = features?.targetedCadenceSupported ?? false;

  // Auto-apply plan targets in Auto mode
  useEffect(() => {
    if (controlMode === "auto" && plan.hasPlan && plan.currentStep) {
      applyPlanTargets();
    }
  }, [controlMode, plan.currentStep, plan.hasPlan]);

  /**
   * Apply plan targets to elliptical automatically
   * Converts plan step targets to FTMS commands
   */
  const applyPlanTargets = useCallback(async () => {
    if (!plan.currentStep || !plan.currentStep.targets) return;

    const targets = plan.currentStep.targets;

    // Find cadence target
    const cadenceTarget = targets.find((t) => t.type === "cadence");

    if (cadenceTarget && "min" in cadenceTarget && "max" in cadenceTarget && supportsCadence) {
      // Use midpoint of range
      const cadenceSpm = Math.round(((cadenceTarget.min as number) + (cadenceTarget.max as number)) / 2);
      setTargetCadence(cadenceSpm);
      await service.sensorsManager.setTargetCadence(cadenceSpm);
      console.log(`[EllipticalControl] Auto mode: Set target cadence to ${cadenceSpm} spm`);
    }

    // Apply resistance if supported
    if (supportsResistance && resistanceLevel > 0) {
      await service.sensorsManager.setResistanceTarget(resistanceLevel);
    }
  }, [plan.currentStep, resistanceLevel, supportsResistance, supportsCadence]);

  /**
   * Apply resistance target
   */
  const applyResistance = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert(
        "Auto Mode Active",
        "Switch to Manual mode to adjust elliptical settings."
      );
      return;
    }

    if (!supportsResistance) {
      Alert.alert("Not Supported", "Elliptical does not support resistance control.");
      return;
    }

    const success = await service.sensorsManager.setResistanceTarget(
      resistanceLevel
    );

    if (success) {
      console.log(`[EllipticalControl] Manual: Set resistance level to ${resistanceLevel}`);
    } else {
      Alert.alert("Error", "Failed to set resistance. Check elliptical connection.");
    }
  }, [resistanceLevel, controlMode, supportsResistance]);

  /**
   * Apply cadence target
   */
  const applyCadence = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert(
        "Auto Mode Active",
        "Switch to Manual mode to adjust elliptical settings."
      );
      return;
    }

    if (!supportsCadence) {
      Alert.alert("Not Supported", "Elliptical does not support cadence target.");
      return;
    }

    const success = await service.sensorsManager.setTargetCadence(targetCadence);

    if (success) {
      console.log(`[EllipticalControl] Manual: Set target cadence to ${targetCadence} spm`);
    } else {
      Alert.alert("Error", "Failed to set cadence. Check elliptical connection.");
    }
  }, [targetCadence, controlMode, supportsCadence]);

  const isDisabled = controlMode === "auto";

  // Get current power reading (read-only)
  const currentPower = currentReadings.power
    ? Math.round(currentReadings.power)
    : null;

  return (
    <View className="gap-6">
      {/* Resistance Control */}
      {supportsResistance && (
        <View>
          <Text className="text-sm font-medium mb-3">Resistance Level</Text>
          <View className="flex-row items-center gap-3 mb-3">
            <Pressable
              onPress={() => setResistanceLevel(Math.max(1, resistanceLevel - 1))}
              disabled={isDisabled}
              className={`w-12 h-12 items-center justify-center rounded ${
                isDisabled ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text className={isDisabled ? "text-muted-foreground" : "text-primary-foreground"}>
                -
              </Text>
            </Pressable>

            <View className="flex-1 items-center">
              <Text className="text-4xl font-bold">{resistanceLevel}</Text>
              <Text className="text-xs text-muted-foreground mt-1">
                1-20 range
              </Text>
            </View>

            <Pressable
              onPress={() => setResistanceLevel(Math.min(20, resistanceLevel + 1))}
              disabled={isDisabled}
              className={`w-12 h-12 items-center justify-center rounded ${
                isDisabled ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text className={isDisabled ? "text-muted-foreground" : "text-primary-foreground"}>
                +
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={applyResistance}
            disabled={isDisabled}
            className={`py-3 rounded ${isDisabled ? "bg-muted" : "bg-primary"}`}
          >
            <Text className={`text-center font-medium ${
              isDisabled ? "text-muted-foreground" : "text-primary-foreground"
            }`}>
              {isDisabled ? "Auto Mode Active" : "Apply Resistance"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Cadence Target */}
      {supportsCadence && (
        <View>
          <Text className="text-sm font-medium mb-3">Target Cadence</Text>
          <View className="flex-row items-center gap-3 mb-3">
            <Pressable
              onPress={() => setTargetCadence(Math.max(30, targetCadence - 5))}
              disabled={isDisabled}
              className={`w-12 h-12 items-center justify-center rounded ${
                isDisabled ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text className={isDisabled ? "text-muted-foreground" : "text-primary-foreground"}>
                -
              </Text>
            </Pressable>

            <View className="flex-1 items-center">
              <Text className="text-4xl font-bold">{targetCadence}</Text>
              <Text className="text-xs text-muted-foreground mt-1">
                steps/min
              </Text>
            </View>

            <Pressable
              onPress={() => setTargetCadence(Math.min(120, targetCadence + 5))}
              disabled={isDisabled}
              className={`w-12 h-12 items-center justify-center rounded ${
                isDisabled ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text className={isDisabled ? "text-muted-foreground" : "text-primary-foreground"}>
                +
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={applyCadence}
            disabled={isDisabled}
            className={`py-3 rounded ${isDisabled ? "bg-muted" : "bg-primary"}`}
          >
            <Text className={`text-center font-medium ${
              isDisabled ? "text-muted-foreground" : "text-primary-foreground"
            }`}>
              {isDisabled ? "Auto Mode Active" : "Apply Cadence Target"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Power Display (Read-only) */}
      <View className="bg-card p-4 rounded-lg border border-border">
        <Text className="text-xs text-muted-foreground mb-1">Current Power</Text>
        <Text className="text-3xl font-bold">
          {currentPower !== null ? `${currentPower} W` : "--"}
        </Text>
        <Text className="text-xs text-muted-foreground mt-1">
          Read-only (calculated from resistance and cadence)
        </Text>
      </View>

      {/* Plan Target Display (when in Auto mode) */}
      {controlMode === "auto" && plan.hasPlan && plan.currentStep && (
        <View className="bg-primary/10 p-4 rounded-lg border border-primary/20">
          <Text className="text-sm font-medium mb-1">Following Plan</Text>
          <Text className="text-xs text-muted-foreground">
            Current step: {plan.currentStep.name || "Interval"}
          </Text>
          {plan.currentStep.targets && plan.currentStep.targets.length > 0 && (
            <Text className="text-xs text-muted-foreground mt-1">
              Target: {plan.currentStep.targets[0].type}{" "}
              {"min" in plan.currentStep.targets[0] && "max" in plan.currentStep.targets[0] &&
                `${plan.currentStep.targets[0].min}-${plan.currentStep.targets[0].max}`}
              {"value" in plan.currentStep.targets[0] &&
                `${plan.currentStep.targets[0].value}`}
            </Text>
          )}
        </View>
      )}

      {/* Info Note */}
      <View className="bg-muted/30 p-3 rounded-lg">
        <Text className="text-xs text-muted-foreground">
          <Text className="font-medium">Tip:</Text> Higher resistance increases power output
          at the same cadence. Target cadence helps maintain consistent stride rate.
        </Text>
      </View>
    </View>
  );
}
