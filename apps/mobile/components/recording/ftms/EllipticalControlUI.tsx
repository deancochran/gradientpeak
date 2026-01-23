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

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Pressable, Alert } from "react-native";
import { Text } from "@/components/ui/text";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  usePlan,
  useCurrentReadings,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { PredictiveResistanceCalculator } from "@/lib/services/ActivityRecorder/PredictiveResistanceCalculator";

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

  // Initialize predictive resistance calculator
  const predictiveCalculator = useMemo(
    () => new PredictiveResistanceCalculator(),
    [],
  );

  // Elliptical control state
  const [resistanceLevel, setResistanceLevel] = useState<number>(5); // 1-20
  const [targetCadence, setTargetCadence] = useState<number>(60); // steps per minute
  const [targetPower, setTargetPower] = useState<number>(150); // Target power in watts

  // Get trainer features
  const trainer = service.sensorsManager.getControllableTrainer();
  const features = trainer?.ftmsFeatures;

  const supportsResistance =
    features?.resistanceTargetSettingSupported ?? false;
  const supportsCadence = features?.targetedCadenceSupported ?? false;

  // Apply predictive resistance based on current state
  const applyPredictiveResistance = useCallback(async () => {
    if (targetPower <= 0 || !supportsResistance) return;

    // Use predictive resistance control based on stride rate
    const currentStrideRate = currentReadings.cadence ?? 60; // Fallback to 60 strides/min
    const resistance = predictiveCalculator.calculateResistance(
      targetPower,
      currentStrideRate,
      "elliptical",
      features,
    );

    await service.sensorsManager.setResistanceTarget(resistance);
    console.log(
      `[EllipticalControl] Predictive: Set resistance to ${resistance.toFixed(1)} (target: ${targetPower}W, stride rate: ${currentStrideRate.toFixed(0)} spm)`,
    );
  }, [
    targetPower,
    currentReadings.cadence,
    features,
    predictiveCalculator,
    supportsResistance,
    service,
  ]);

  /**
   * Apply plan targets to elliptical automatically using predictive resistance
   * Converts plan step targets to resistance commands based on stride rate
   */
  const applyPlanTargets = useCallback(async () => {
    if (!plan.currentStep || !plan.currentStep.targets) return;

    const targets = plan.currentStep.targets;

    // Find power target
    const powerTarget = targets.find(
      (t) => t.type === "watts" || t.type === "%FTP",
    );

    // Find cadence target
    const cadenceTarget = targets.find((t) => t.type === "cadence");

    if (
      cadenceTarget &&
      "min" in cadenceTarget &&
      "max" in cadenceTarget &&
      supportsCadence
    ) {
      // Use midpoint of range
      const cadenceSpm = Math.round(
        ((cadenceTarget.min as number) + (cadenceTarget.max as number)) / 2,
      );
      setTargetCadence(cadenceSpm);
      await service.sensorsManager.setTargetCadence(cadenceSpm);
      console.log(
        `[EllipticalControl] Auto mode: Set target cadence to ${cadenceSpm} spm`,
      );
    }

    // Apply predictive resistance if power target exists
    if (powerTarget && supportsResistance) {
      let powerWatts = 0;

      if (powerTarget.type === "watts" && "value" in powerTarget) {
        powerWatts = powerTarget.value as number;
      }

      if (powerWatts > 0) {
        setTargetPower(powerWatts);

        // Use predictive resistance control based on stride rate
        const currentStrideRate = currentReadings.cadence ?? 60; // Fallback to 60 strides/min
        const resistance = predictiveCalculator.calculateResistance(
          powerWatts,
          currentStrideRate,
          "elliptical",
          features,
        );

        await service.sensorsManager.setResistanceTarget(resistance);
        console.log(
          `[EllipticalControl] Predictive: Set resistance to ${resistance.toFixed(1)} (target: ${powerWatts}W, stride rate: ${currentStrideRate.toFixed(0)} spm)`,
        );
      }
    }
  }, [
    plan.currentStep,
    supportsResistance,
    supportsCadence,
    currentReadings.cadence,
    features,
    predictiveCalculator,
    service,
  ]);

  // Reset calculator when interval changes to allow quick adaptation to new targets
  useEffect(() => {
    if (plan.hasPlan && plan.currentStep) {
      console.log(
        "[EllipticalControl] Interval changed, resetting predictive calculator",
      );
      predictiveCalculator.reset();
    }
  }, [plan.currentStep, plan.hasPlan, predictiveCalculator]);

  // Auto-apply plan targets in Auto mode
  useEffect(() => {
    if (controlMode === "auto" && plan.hasPlan && plan.currentStep) {
      console.log(
        "[EllipticalControl] Auto mode - applying plan targets immediately",
      );
      applyPlanTargets();
    }
  }, [controlMode, plan.currentStep, plan.hasPlan, applyPlanTargets]);

  // Auto-start: Initialize ERG when recording starts with a plan
  const recordingState = useRecordingState(service);
  useEffect(() => {
    if (
      recordingState === "recording" &&
      controlMode === "auto" &&
      plan.hasPlan &&
      plan.currentStep
    ) {
      console.log(
        "[EllipticalControl] Recording started with plan - auto-initializing ERG",
      );
      applyPlanTargets();
    }
  }, [
    recordingState,
    controlMode,
    plan.hasPlan,
    plan.currentStep,
    applyPlanTargets,
  ]);

  // Periodically update resistance as stride rate changes (every 1.5 seconds)
  // Works even without a plan if targetPower is set
  useEffect(() => {
    if (
      recordingState === "recording" &&
      controlMode === "auto" &&
      targetPower > 0
    ) {
      // Periodic updates
      const interval = setInterval(() => {
        if (plan.hasPlan && plan.currentStep) {
          applyPlanTargets();
        } else {
          applyPredictiveResistance();
        }
      }, 1500);

      return () => clearInterval(interval);
    }
  }, [
    recordingState,
    controlMode,
    targetPower,
    applyPlanTargets,
    applyPredictiveResistance,
    plan.hasPlan,
    plan.currentStep,
  ]);

  /**
   * Apply resistance target
   */
  const applyResistance = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert(
        "Auto Mode Active",
        "Switch to Manual mode to adjust elliptical settings.",
      );
      return;
    }

    if (!supportsResistance) {
      Alert.alert(
        "Not Supported",
        "Elliptical does not support resistance control.",
      );
      return;
    }

    const success =
      await service.sensorsManager.setResistanceTarget(resistanceLevel);

    if (success) {
      console.log(
        `[EllipticalControl] Manual: Set resistance level to ${resistanceLevel}`,
      );
    } else {
      Alert.alert(
        "Error",
        "Failed to set resistance. Check elliptical connection.",
      );
    }
  }, [resistanceLevel, controlMode, supportsResistance]);

  /**
   * Apply cadence target
   */
  const applyCadence = useCallback(async () => {
    if (controlMode === "auto") {
      Alert.alert(
        "Auto Mode Active",
        "Switch to Manual mode to adjust elliptical settings.",
      );
      return;
    }

    if (!supportsCadence) {
      Alert.alert(
        "Not Supported",
        "Elliptical does not support cadence target.",
      );
      return;
    }

    const success =
      await service.sensorsManager.setTargetCadence(targetCadence);

    if (success) {
      console.log(
        `[EllipticalControl] Manual: Set target cadence to ${targetCadence} spm`,
      );
    } else {
      Alert.alert(
        "Error",
        "Failed to set cadence. Check elliptical connection.",
      );
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
              onPress={() =>
                setResistanceLevel(Math.max(1, resistanceLevel - 1))
              }
              disabled={isDisabled}
              className={`w-12 h-12 items-center justify-center rounded ${
                isDisabled ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text
                className={
                  isDisabled
                    ? "text-muted-foreground"
                    : "text-primary-foreground"
                }
              >
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
              onPress={() =>
                setResistanceLevel(Math.min(20, resistanceLevel + 1))
              }
              disabled={isDisabled}
              className={`w-12 h-12 items-center justify-center rounded ${
                isDisabled ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text
                className={
                  isDisabled
                    ? "text-muted-foreground"
                    : "text-primary-foreground"
                }
              >
                +
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={applyResistance}
            disabled={isDisabled}
            className={`py-3 rounded ${isDisabled ? "bg-muted" : "bg-primary"}`}
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
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
              <Text
                className={
                  isDisabled
                    ? "text-muted-foreground"
                    : "text-primary-foreground"
                }
              >
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
              <Text
                className={
                  isDisabled
                    ? "text-muted-foreground"
                    : "text-primary-foreground"
                }
              >
                +
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={applyCadence}
            disabled={isDisabled}
            className={`py-3 rounded ${isDisabled ? "bg-muted" : "bg-primary"}`}
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              {isDisabled ? "Auto Mode Active" : "Apply Cadence Target"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Power Display (Read-only) */}
      <View className="bg-card p-4 rounded-lg border border-border">
        <Text className="text-xs text-muted-foreground mb-1">
          Current Power
        </Text>
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
              {"min" in plan.currentStep.targets[0] &&
                "max" in plan.currentStep.targets[0] &&
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
          <Text className="font-medium">Tip:</Text> Higher resistance increases
          power output at the same cadence. Target cadence helps maintain
          consistent stride rate.
        </Text>
      </View>
    </View>
  );
}
