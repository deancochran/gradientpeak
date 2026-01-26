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

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Pressable, Alert } from "react-native";
import { Text } from "@/components/ui/text";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  useCurrentReadings,
  usePlan,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { PredictiveResistanceCalculator } from "@/lib/services/ActivityRecorder/PredictiveResistanceCalculator";

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
  const current = useCurrentReadings(service);

  // Initialize predictive resistance calculator
  const predictiveCalculator = useMemo(
    () => new PredictiveResistanceCalculator(),
    [],
  );

  // Rower control state
  const [damper, setDamper] = useState<number>(5); // 1-10
  const [resistanceLevel, setResistanceLevel] = useState<number>(5); // Variable
  const [targetStrokeRate, setTargetStrokeRate] = useState<number>(20); // strokes per minute
  const [targetPower, setTargetPower] = useState<number>(150); // Target power in watts
  const [dragFactor, setDragFactor] = useState<number>(120); // Read-only, example value

  // Get trainer features
  const trainer = service.sensorsManager.getControllableTrainer();
  const features = trainer?.ftmsFeatures;

  const supportsResistance =
    features?.resistanceTargetSettingSupported ?? false;

  // Apply predictive resistance based on current state
  const applyPredictiveResistance = useCallback(async () => {
    if (targetPower <= 0 || !supportsResistance) return;

    // Use predictive resistance control based on stroke rate
    const currentStrokeRate = current.cadence ?? 22; // Fallback to 22 spm
    const resistance = predictiveCalculator.calculateResistance(
      targetPower,
      currentStrokeRate,
      "rower",
      features,
    );

    await service.sensorsManager.setResistanceTarget(resistance);
    console.log(
      `[RowerControl] Predictive: Set resistance to ${resistance.toFixed(1)} (target: ${targetPower}W, stroke rate: ${currentStrokeRate.toFixed(0)} spm)`,
    );
  }, [
    targetPower,
    current.cadence,
    features,
    predictiveCalculator,
    supportsResistance,
    service,
  ]);

  /**
   * Apply plan targets to rower automatically using predictive resistance
   * Converts plan step targets to resistance commands based on stroke rate
   */
  const applyPlanTargets = useCallback(async () => {
    if (!plan.currentStep || !plan.currentStep.targets) return;

    const targets = plan.currentStep.targets;

    // Find power target
    const powerTarget = targets.find(
      (t) => t.type === "watts" || t.type === "%FTP",
    );

    // Find cadence target (stroke rate for rower)
    const cadenceTarget = targets.find((t) => t.type === "cadence");

    if (cadenceTarget && "min" in cadenceTarget && "max" in cadenceTarget) {
      // Use midpoint of range
      const strokeRate = Math.round(
        ((cadenceTarget.min as number) + (cadenceTarget.max as number)) / 2,
      );
      setTargetStrokeRate(strokeRate);
      console.log(
        `[RowerControl] Auto mode: Set target stroke rate to ${strokeRate} spm`,
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

        // Use predictive resistance control based on stroke rate
        const currentStrokeRate = current.cadence ?? 22; // Fallback to 22 spm
        const resistance = predictiveCalculator.calculateResistance(
          powerWatts,
          currentStrokeRate,
          "rower",
          features,
        );

        await service.sensorsManager.setResistanceTarget(resistance);
        console.log(
          `[RowerControl] Predictive: Set resistance to ${resistance.toFixed(1)} (target: ${powerWatts}W, stroke rate: ${currentStrokeRate.toFixed(0)} spm)`,
        );
      }
    }
  }, [
    plan.currentStep,
    supportsResistance,
    current.cadence,
    features,
    predictiveCalculator,
    service,
  ]);

  // Reset calculator when interval changes to allow quick adaptation to new targets
  useEffect(() => {
    if (plan.hasPlan && plan.currentStep) {
      console.log(
        "[RowerControl] Interval changed, resetting predictive calculator",
      );
      predictiveCalculator.reset();
    }
  }, [plan.currentStep, plan.hasPlan, predictiveCalculator]);

  // Auto-apply plan targets in Auto mode
  useEffect(() => {
    if (controlMode === "auto" && plan.hasPlan && plan.currentStep) {
      console.log(
        "[RowerControl] Auto mode - applying plan targets immediately",
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
        "[RowerControl] Recording started with plan - auto-initializing ERG",
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

  // Periodically update resistance as stroke rate changes (every 1.5 seconds)
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
        "Switch to Manual mode to adjust rower settings.",
      );
      return;
    }

    if (!supportsResistance) {
      Alert.alert(
        "Not Supported",
        "Rower does not support resistance control.",
      );
      return;
    }

    const success =
      await service.sensorsManager.setResistanceTarget(resistanceLevel);

    if (success) {
      console.log(
        `[RowerControl] Manual: Set resistance level to ${resistanceLevel}`,
      );
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
            <Text
              className={
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }
            >
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
            <Text
              className={
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }
            >
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
            </View>

            <Pressable
              onPress={() => setResistanceLevel(resistanceLevel + 1)}
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

      {/* Stroke Rate Target */}
      <View>
        <Text className="text-sm font-medium mb-3">Target Stroke Rate</Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() =>
              setTargetStrokeRate(Math.max(10, targetStrokeRate - 1))
            }
            disabled={isDisabled}
            className={`w-12 h-12 items-center justify-center rounded ${
              isDisabled ? "bg-muted" : "bg-primary"
            }`}
          >
            <Text
              className={
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }
            >
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
            onPress={() =>
              setTargetStrokeRate(Math.min(40, targetStrokeRate + 1))
            }
            disabled={isDisabled}
            className={`w-12 h-12 items-center justify-center rounded ${
              isDisabled ? "bg-muted" : "bg-primary"
            }`}
          >
            <Text
              className={
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }
            >
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
          <Text className="font-medium">Tip:</Text> Adjust damper and resistance
          to control rowing difficulty. Target stroke rate helps maintain
          consistent pace.
        </Text>
      </View>
    </View>
  );
}
