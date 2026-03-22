/**
 * Treadmill Control UI
 *
 * Provides controls for smart treadmills.
 * Controls:
 * - Speed (km/h)
 * - Incline (percentage)
 * - Safety limits display (max speed/incline)
 *
 * Features:
 * - Auto/Manual mode (manual dispatches high-level trainer intents)
 * - Safety limit warnings
 * - Grayed out controls in Auto mode
 */

import { Text } from "@repo/ui/components/text";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { usePlan } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

export interface TreadmillControlUIProps {
  service: ActivityRecorderService;
  controlMode: "auto" | "manual";
  hasPlan: boolean;
}

export function TreadmillControlUI({ service, controlMode, hasPlan }: TreadmillControlUIProps) {
  const plan = usePlan(service);

  // Treadmill control state
  const [speedKmh, setSpeedKmh] = useState<number>(8.0); // km/h
  const [inclinePercent, setInclinePercent] = useState<number>(0); // percentage

  // Safety limits (from trainer features or defaults)
  const [maxSpeed, setMaxSpeed] = useState<number>(20); // km/h
  const [maxIncline, setMaxIncline] = useState<number>(15); // percentage

  // Get trainer features
  const features = service.getTrainerFeatures();

  const supportsSpeed = features?.speedTargetSettingSupported ?? false;
  const supportsInclination = features?.inclinationTargetSettingSupported ?? false;

  // Load safety limits from features
  useEffect(() => {
    if (features?.speedRange) {
      setMaxSpeed(features.speedRange.max);
    }
    if (features?.inclinationRange) {
      setMaxIncline(features.inclinationRange.max);
    }
  }, [features]);

  /**
   * Apply speed target
   */
  const applySpeed = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert("Auto Mode Active", "Switch to Manual mode to adjust treadmill settings.");
      return;
    }

    if (!supportsSpeed) {
      Alert.alert("Not Supported", "Treadmill does not support speed control.");
      return;
    }

    // Safety check
    if (speedKmh > maxSpeed) {
      Alert.alert(
        "Safety Warning",
        `Speed exceeds maximum (${maxSpeed} km/h). Set speed to ${maxSpeed} km/h?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Max Speed",
            onPress: async () => {
              setSpeedKmh(maxSpeed);
              await service.applyManualTrainerSpeed(maxSpeed);
            },
          },
        ],
      );
      return;
    }

    const success = await service.applyManualTrainerSpeed(speedKmh);

    if (success) {
      console.log(`[TreadmillControl] Manual: Set speed to ${speedKmh.toFixed(1)} km/h`);
    } else {
      Alert.alert("Error", "Failed to set speed. Check treadmill connection.");
    }
  }, [speedKmh, maxSpeed, controlMode, supportsSpeed]);

  /**
   * Apply incline target
   */
  const applyIncline = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert("Auto Mode Active", "Switch to Manual mode to adjust treadmill settings.");
      return;
    }

    if (!supportsInclination) {
      Alert.alert("Not Supported", "Treadmill does not support incline control.");
      return;
    }

    // Safety check
    if (inclinePercent > maxIncline) {
      Alert.alert(
        "Safety Warning",
        `Incline exceeds maximum (${maxIncline}%). Set incline to ${maxIncline}%?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Max Incline",
            onPress: async () => {
              setInclinePercent(maxIncline);
              await service.applyManualTrainerIncline(maxIncline);
            },
          },
        ],
      );
      return;
    }

    const success = await service.applyManualTrainerIncline(inclinePercent);

    if (success) {
      console.log(`[TreadmillControl] Manual: Set incline to ${inclinePercent.toFixed(1)}%`);
    } else {
      Alert.alert("Error", "Failed to set incline. Check treadmill connection.");
    }
  }, [inclinePercent, maxIncline, controlMode, supportsInclination]);

  const isDisabled = controlMode === "auto";

  return (
    <View className="gap-6">
      {/* Speed Control */}
      {supportsSpeed && (
        <View>
          <Text className="text-sm font-medium mb-3">Speed</Text>
          <View className="flex-row items-center gap-3 mb-3">
            <Pressable
              onPress={() => setSpeedKmh(Math.max(0, speedKmh - 0.5))}
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
              <Text className="text-4xl font-bold">{speedKmh.toFixed(1)}</Text>
              <Text className="text-xs text-muted-foreground mt-1">km/h</Text>
            </View>

            <Pressable
              onPress={() => setSpeedKmh(Math.min(maxSpeed, speedKmh + 0.5))}
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
            onPress={applySpeed}
            disabled={isDisabled}
            className={`py-3 rounded ${isDisabled ? "bg-muted" : "bg-primary"}`}
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              {isDisabled ? "Auto Mode Active" : "Apply Speed"}
            </Text>
          </Pressable>

          {/* Speed Safety Limit */}
          <View className="bg-muted/30 p-2 rounded mt-2">
            <Text className="text-xs text-muted-foreground">Max speed: {maxSpeed} km/h</Text>
          </View>
        </View>
      )}

      {/* Incline Control */}
      {supportsInclination && (
        <View>
          <Text className="text-sm font-medium mb-3">Incline</Text>
          <View className="flex-row items-center gap-3 mb-3">
            <Pressable
              onPress={() => setInclinePercent(Math.max(-5, inclinePercent - 0.5))}
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
              <Text className="text-4xl font-bold">{inclinePercent.toFixed(1)}%</Text>
            </View>

            <Pressable
              onPress={() => setInclinePercent(Math.min(maxIncline, inclinePercent + 0.5))}
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
            onPress={applyIncline}
            disabled={isDisabled}
            className={`py-3 rounded ${isDisabled ? "bg-muted" : "bg-primary"}`}
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              {isDisabled ? "Auto Mode Active" : "Apply Incline"}
            </Text>
          </Pressable>

          {/* Incline Safety Limit */}
          <View className="bg-muted/30 p-2 rounded mt-2">
            <Text className="text-xs text-muted-foreground">Max incline: {maxIncline}%</Text>
          </View>
        </View>
      )}

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
              {"min" in plan.currentStep.targets[0] &&
                "max" in plan.currentStep.targets[0] &&
                `${plan.currentStep.targets[0].min}-${plan.currentStep.targets[0].max}`}
              {"value" in plan.currentStep.targets[0] && `${plan.currentStep.targets[0].value}`}
            </Text>
          )}
        </View>
      )}

      {/* Safety Info */}
      <View className="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
        <Text className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">
          Safety First
        </Text>
        <Text className="text-xs text-muted-foreground">
          Always ensure the safety key is attached and you&apos;re comfortable with the speed and
          incline before starting. Use emergency stop if needed.
        </Text>
      </View>
    </View>
  );
}
