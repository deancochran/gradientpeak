/**
 * Rower Control UI
 *
 * Provides controls for smart rowing machines.
 * Controls:
 * - Damper setting (1-10)
 * - Resistance level
 * - Target stroke rate (strokes per minute)
 * - Drag factor display (read-only)
 *
 * Features:
 * - Auto/Manual mode (auto applies plan targets, manual allows user override)
 * - Grayed out controls in Auto mode
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Pressable, Alert } from "react-native";
import { Text } from "@/components/ui/text";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { usePlan } from "@/lib/hooks/useActivityRecorder";

export interface RowerControlUIProps {
  service: ActivityRecorderService;
  controlMode: "auto" | "manual";
  hasPlan: boolean;
}

export function RowerControlUI({
  service,
  controlMode,
  hasPlan,
}: RowerControlUIProps) {
  const plan = usePlan(service);

  // Rower control state
  const [damper, setDamper] = useState<number>(5); // 1-10
  const [resistanceLevel, setResistanceLevel] = useState<number>(5); // Variable
  const [targetStrokeRate, setTargetStrokeRate] = useState<number>(20); // strokes per minute
  const [dragFactor, setDragFactor] = useState<number>(120); // Read-only, example value

  // Get trainer features
  const trainer = service.sensorsManager.getControllableTrainer();
  const features = trainer?.ftmsFeatures;

  const supportsResistance = features?.resistanceTargetSettingSupported ?? false;

  // Auto-apply plan targets in Auto mode
  useEffect(() => {
    if (controlMode === "auto" && plan.hasPlan && plan.currentStep) {
      applyPlanTargets();
    }
  }, [controlMode, plan.currentStep, plan.hasPlan]);

  /**
   * Apply plan targets to rower automatically
   * Converts plan step targets to FTMS commands
   */
  const applyPlanTargets = useCallback(async () => {
    if (!plan.currentStep || !plan.currentStep.targets) return;

    const targets = plan.currentStep.targets;

    // Find cadence target (stroke rate for rower)
    const cadenceTarget = targets.find((t) => t.type === "cadence");

    if (cadenceTarget && "min" in cadenceTarget && "max" in cadenceTarget) {
      // Use midpoint of range
      const strokeRate = Math.round(((cadenceTarget.min as number) + (cadenceTarget.max as number)) / 2);
      setTargetStrokeRate(strokeRate);
      console.log(`[RowerControl] Auto mode: Set target stroke rate to ${strokeRate} spm`);
    }

    // Apply resistance if supported
    if (supportsResistance && resistanceLevel > 0) {
      await service.sensorsManager.setResistanceTarget(resistanceLevel);
    }
  }, [plan.currentStep, resistanceLevel, supportsResistance]);

  /**
   * Apply resistance target
   */
  const applyResistance = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert(
        "Auto Mode Active",
        "Switch to Manual mode to adjust rower settings."
      );
      return;
    }

    if (!supportsResistance) {
      Alert.alert("Not Supported", "Rower does not support resistance control.");
      return;
    }

    const success = await service.sensorsManager.setResistanceTarget(
      resistanceLevel
    );

    if (success) {
      console.log(`[RowerControl] Manual: Set resistance level to ${resistanceLevel}`);
    } else {
      Alert.alert("Error", "Failed to set resistance. Check rower connection.");
    }
  }, [resistanceLevel, controlMode, supportsResistance]);

  const isDisabled = controlMode === "auto";

  return (
    <View className="gap-6">
      {/* Damper Control */}
      <View>
        <Text className="text-sm font-medium mb-3">Damper Setting</Text>
        <View className="flex-row items-center gap-3 mb-3">
          <Pressable
            onPress={() => setDamper(Math.max(1, damper - 1))}
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
            <Text className="text-4xl font-bold">{damper}</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              1-10 range
            </Text>
          </View>

          <Pressable
            onPress={() => setDamper(Math.min(10, damper + 1))}
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
      </View>

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
            </View>

            <Pressable
              onPress={() => setResistanceLevel(resistanceLevel + 1)}
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

      {/* Stroke Rate Target */}
      <View>
        <Text className="text-sm font-medium mb-3">Target Stroke Rate</Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => setTargetStrokeRate(Math.max(10, targetStrokeRate - 1))}
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
            <Text className="text-4xl font-bold">{targetStrokeRate}</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              strokes/min
            </Text>
          </View>

          <Pressable
            onPress={() => setTargetStrokeRate(Math.min(40, targetStrokeRate + 1))}
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
      </View>

      {/* Drag Factor Display (Read-only) */}
      <View className="bg-card p-4 rounded-lg border border-border">
        <Text className="text-xs text-muted-foreground mb-1">Drag Factor</Text>
        <Text className="text-2xl font-bold">{dragFactor}</Text>
        <Text className="text-xs text-muted-foreground mt-1">
          Read-only (set by damper position)
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
          <Text className="font-medium">Tip:</Text> Adjust damper and resistance to control
          rowing difficulty. Target stroke rate helps maintain consistent pace.
        </Text>
      </View>
    </View>
  );
}
