/**
 * Bike/Trainer Control UI
 *
 * Provides controls for smart bike trainers and indoor bikes.
 * Supports three control modes:
 * - ERG Mode (Mode 5): Target power control
 * - SIM Mode (Mode 1): Terrain simulation (grade + wind)
 * - Resistance Mode (Mode 4): Manual resistance level
 *
 * Features:
 * - Auto/Manual mode (auto applies plan targets, manual allows user override)
 * - FTP zones display for power reference
 * - Target power slider with +/- buttons (ERG mode)
 * - Grade/wind simulation controls (SIM mode)
 * - Resistance level control 1-20 (Resistance mode)
 * - Grayed out controls in Auto mode
 */

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  usePlan,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { PredictiveResistanceCalculator } from "@/lib/services/ActivityRecorder/PredictiveResistanceCalculator";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";

export interface BikeControlUIProps {
  service: ActivityRecorderService;
  controlMode: "auto" | "manual";
  hasPlan: boolean;
}

type BikeMode = "erg" | "sim" | "resistance";

export function BikeControlUI({
  service,
  controlMode,
  hasPlan,
}: BikeControlUIProps) {
  const plan = usePlan(service);
  const current = useCurrentReadings(service);

  // Initialize predictive resistance calculator
  const predictiveCalculator = useMemo(
    () => new PredictiveResistanceCalculator(),
    [],
  );

  // Current bike control mode (ERG, SIM, Resistance)
  const [bikeMode, setBikeMode] = useState<BikeMode>("erg");

  // ERG mode state
  const [targetPower, setTargetPower] = useState<number>(150);

  // SIM mode state
  const [grade, setGrade] = useState<number>(0);
  const [windSpeed, setWindSpeed] = useState<number>(0);
  const [weight, setWeight] = useState<number>(75); // User weight for grade calculations

  // Resistance mode state
  const [resistanceLevel, setResistanceLevel] = useState<number>(5);

  // FTP for zone display
  const [ftp, setFtp] = useState<number>(200);

  // Get trainer features
  const trainer = service.sensorsManager.getControllableTrainer();
  const features = trainer?.ftmsFeatures;

  // Detect supported modes
  const supportsERG = features?.powerTargetSettingSupported ?? false;
  const supportsSIM = features?.indoorBikeSimulationSupported ?? false;
  const supportsResistance =
    features?.resistanceTargetSettingSupported ?? false;

  // Apply predictive resistance based on current state
  const applyPredictiveResistance = useCallback(async () => {
    if (bikeMode !== "erg" || targetPower <= 0) return;
    if (!supportsERG && !supportsResistance) return;

    // Use predictive resistance control
    const currentCadence = current.cadence ?? 85; // Fallback to 85 rpm
    const resistance = predictiveCalculator.calculateResistance(
      targetPower,
      currentCadence,
      "bike",
      features,
    );

    await service.sensorsManager.setResistanceTarget(resistance);
    console.log(
      `[BikeControl] Predictive: Set resistance to ${resistance.toFixed(1)} (target: ${targetPower}W, cadence: ${currentCadence.toFixed(0)} rpm)`,
    );
  }, [
    bikeMode,
    targetPower,
    current.cadence,
    features,
    predictiveCalculator,
    supportsERG,
    supportsResistance,
    service,
  ]);

  /**
   * Apply plan targets to trainer automatically using predictive resistance
   * Converts plan step targets to resistance commands based on cadence
   */
  const applyPlanTargets = useCallback(async () => {
    if (!plan.currentStep || !plan.currentStep.targets) return;

    const targets = plan.currentStep.targets;

    // Find power target
    const powerTarget = targets.find(
      (t) => t.type === "watts" || t.type === "%FTP",
    );

    if (powerTarget && (supportsERG || supportsResistance)) {
      let powerWatts = 0;

      if (powerTarget.type === "watts" && "value" in powerTarget) {
        powerWatts = powerTarget.value as number;
      } else if (
        powerTarget.type === "%FTP" &&
        "min" in powerTarget &&
        "max" in powerTarget
      ) {
        // Use midpoint of range
        const percentFTP =
          ((powerTarget.min as number) + (powerTarget.max as number)) / 2;
        powerWatts = Math.round((percentFTP / 100) * ftp);
      }

      if (powerWatts > 0) {
        setTargetPower(powerWatts);

        // Use predictive resistance control
        const currentCadence = current.cadence ?? 85; // Fallback to 85 rpm
        const resistance = predictiveCalculator.calculateResistance(
          powerWatts,
          currentCadence,
          "bike",
          features,
        );

        await service.sensorsManager.setResistanceTarget(resistance);
        console.log(
          `[BikeControl] Predictive: Set resistance to ${resistance.toFixed(1)} (target: ${powerWatts}W, cadence: ${currentCadence.toFixed(0)} rpm)`,
        );
      }
    }
  }, [
    plan.currentStep,
    ftp,
    supportsERG,
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
        "[BikeControl] Interval changed, resetting predictive calculator",
      );
      predictiveCalculator.reset();
    }
  }, [plan.currentStep, plan.hasPlan, predictiveCalculator]);

  // Auto-apply plan targets in Auto mode
  useEffect(() => {
    if (controlMode === "auto" && plan.hasPlan && plan.currentStep) {
      console.log(
        "[BikeControl] Auto mode - applying plan targets immediately",
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
      plan.currentStep &&
      bikeMode === "erg"
    ) {
      console.log(
        "[BikeControl] Recording started with plan - auto-initializing ERG",
      );
      applyPlanTargets();
    }
  }, [
    recordingState,
    controlMode,
    plan.hasPlan,
    plan.currentStep,
    bikeMode,
    applyPlanTargets,
  ]);

  // Periodically update resistance as cadence changes (every 1.5 seconds)
  // Works even without a plan if targetPower is set
  useEffect(() => {
    if (
      recordingState === "recording" &&
      controlMode === "auto" &&
      targetPower > 0 &&
      bikeMode === "erg"
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
    bikeMode,
    applyPlanTargets,
    applyPredictiveResistance,
    plan.hasPlan,
    plan.currentStep,
  ]);

  /**
   * Apply power target in ERG mode
   */
  const applyPowerTarget = useCallback(async () => {
    console.log(
      `[BikeControl] Attempting to set power target: ${targetPower}W (controlMode: ${controlMode})`,
    );

    const success = await service.sensorsManager.setPowerTarget(targetPower);
    if (success) {
      console.log(`[BikeControl] Manual: Set power target to ${targetPower}W`);
      Alert.alert("Success", `Power target set to ${targetPower}W`);
    } else {
      console.error("[BikeControl] Failed to set power target");
      Alert.alert(
        "Error",
        "Failed to set power target. Check trainer connection.",
      );
    }
  }, [targetPower, controlMode, service]);

  /**
   * Apply simulation parameters in SIM mode
   */
  const applySimulation = useCallback(async () => {
    console.log(
      `[BikeControl] Attempting to set simulation: grade=${grade}%, wind=${windSpeed}m/s (controlMode: ${controlMode})`,
    );

    const success = await service.sensorsManager.setSimulation({
      grade,
      windSpeed,
      crr: 0.005, // Default coefficient of rolling resistance
      windResistance: 0.51, // Default wind resistance coefficient
    });

    if (success) {
      console.log(
        `[BikeControl] Manual: Set simulation (grade: ${grade}%, wind: ${windSpeed} m/s)`,
      );
      Alert.alert("Success", `Simulation set: ${grade}% grade`);
    } else {
      console.error("[BikeControl] Failed to set simulation");
      Alert.alert(
        "Error",
        "Failed to set simulation. Check trainer connection.",
      );
    }
  }, [grade, windSpeed, controlMode, service]);

  /**
   * Apply resistance level in Resistance mode
   */
  const applyResistance = useCallback(async () => {
    console.log(
      `[BikeControl] Attempting to set resistance: ${resistanceLevel} (controlMode: ${controlMode})`,
    );

    const success =
      await service.sensorsManager.setResistanceTarget(resistanceLevel);

    if (success) {
      console.log(
        `[BikeControl] Manual: Set resistance level to ${resistanceLevel}`,
      );
      Alert.alert("Success", `Resistance set to level ${resistanceLevel}`);
    } else {
      console.error("[BikeControl] Failed to set resistance");
      Alert.alert(
        "Error",
        "Failed to set resistance. Check trainer connection.",
      );
    }
  }, [resistanceLevel, controlMode, service]);

  /**
   * Calculate FTP zones for reference
   */
  const getFTPZones = () => {
    return [
      { name: "Recovery", min: 0, max: 0.55 * ftp, color: "bg-gray-500" },
      {
        name: "Endurance",
        min: 0.55 * ftp,
        max: 0.75 * ftp,
        color: "bg-blue-500",
      },
      { name: "Tempo", min: 0.75 * ftp, max: 0.9 * ftp, color: "bg-green-500" },
      {
        name: "Threshold",
        min: 0.9 * ftp,
        max: 1.05 * ftp,
        color: "bg-yellow-500",
      },
      {
        name: "VO2 Max",
        min: 1.05 * ftp,
        max: 1.2 * ftp,
        color: "bg-orange-500",
      },
      { name: "Anaerobic", min: 1.2 * ftp, max: ftp * 2, color: "bg-red-500" },
    ];
  };

  // Determine which controls to show based on available features
  const availableModes: BikeMode[] = [];
  if (supportsERG) availableModes.push("erg");
  if (supportsSIM) availableModes.push("sim");
  if (supportsResistance) availableModes.push("resistance");

  // Default to first available mode
  useEffect(() => {
    if (availableModes.length > 0 && !availableModes.includes(bikeMode)) {
      setBikeMode(availableModes[0]);
    }
  }, []);

  // Controls are disabled in Auto mode, but mode buttons are always enabled
  const isDisabled = controlMode === "auto";

  return (
    <View className="gap-6">
      {/* Mode Selection */}
      {availableModes.length > 1 && (
        <View>
          <Text className="text-sm font-medium text-muted-foreground mb-2">
            Control Mode
          </Text>
          <View className="flex-row gap-2">
            {supportsERG && (
              <ModeButton
                label="ERG (Power)"
                active={bikeMode === "erg"}
                onPress={() => setBikeMode("erg")}
                disabled={false}
              />
            )}
            {supportsSIM && (
              <ModeButton
                label="SIM (Grade)"
                active={bikeMode === "sim"}
                onPress={() => setBikeMode("sim")}
                disabled={false}
              />
            )}
            {supportsResistance && (
              <ModeButton
                label="Resistance"
                active={bikeMode === "resistance"}
                onPress={() => setBikeMode("resistance")}
                disabled={false}
              />
            )}
          </View>
        </View>
      )}

      {/* ERG Mode Controls */}
      {bikeMode === "erg" && supportsERG && (
        <View>
          <Text className="text-sm font-medium mb-3">Target Power</Text>

          {/* Auto mode info banner */}
          {isDisabled && (
            <View className="bg-primary/10 p-3 rounded-lg mb-3 border border-primary/20">
              <Text className="text-xs text-muted-foreground">
                Controls are disabled in Auto mode. Toggle to Manual mode above
                to adjust trainer settings.
              </Text>
            </View>
          )}

          <View className="flex-row items-center gap-3 mb-3">
            <Button
              onPress={() => {
                const newPower = Math.max(0, targetPower - 10);
                console.log(
                  `[BikeControl] Decreasing power: ${targetPower}W -> ${newPower}W`,
                );
                setTargetPower(newPower);
              }}
              disabled={isDisabled}
              variant={isDisabled ? "ghost" : "default"}
              size="icon"
              className="w-12 h-12"
            >
              <Text
                className={
                  isDisabled
                    ? "text-muted-foreground"
                    : "text-primary-foreground"
                }
              >
                -10
              </Text>
            </Button>

            <View className="flex-1 items-center">
              <Text className="text-4xl font-bold">{targetPower}W</Text>
              <Text className="text-xs text-muted-foreground mt-1">
                {((targetPower / ftp) * 100).toFixed(0)}% FTP
              </Text>
            </View>

            <Button
              onPress={() => {
                const newPower = targetPower + 10;
                console.log(
                  `[BikeControl] Increasing power: ${targetPower}W -> ${newPower}W`,
                );
                setTargetPower(newPower);
              }}
              disabled={isDisabled}
              variant={isDisabled ? "ghost" : "default"}
              size="icon"
              className="w-12 h-12"
            >
              <Text
                className={
                  isDisabled
                    ? "text-muted-foreground"
                    : "text-primary-foreground"
                }
              >
                +10
              </Text>
            </Button>
          </View>

          <Button
            onPress={() => {
              console.log(`[BikeControl] Apply Power button pressed`);
              applyPowerTarget();
            }}
            disabled={isDisabled}
            variant={isDisabled ? "ghost" : "default"}
            className="w-full"
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              {isDisabled
                ? "Auto Mode Active - Switch to Manual"
                : "Apply Power Target"}
            </Text>
          </Button>

          {/* FTP Zones Reference */}
          <View className="mt-6">
            <Text className="text-sm font-medium mb-2">FTP Zones</Text>
            {getFTPZones().map((zone, index) => (
              <View key={index} className="flex-row items-center gap-2 mb-1">
                <View className={`w-3 h-3 rounded ${zone.color}`} />
                <Text className="text-xs flex-1">{zone.name}</Text>
                <Text className="text-xs text-muted-foreground">
                  {Math.round(zone.min)}-{Math.round(zone.max)}W
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* SIM Mode Controls */}
      {bikeMode === "sim" && supportsSIM && (
        <View>
          <Text className="text-sm font-medium mb-3">Terrain Simulation</Text>

          {/* Auto mode info banner */}
          {isDisabled && (
            <View className="bg-primary/10 p-3 rounded-lg mb-3 border border-primary/20">
              <Text className="text-xs text-muted-foreground">
                Controls are disabled in Auto mode. Toggle to Manual mode above
                to adjust trainer settings.
              </Text>
            </View>
          )}

          {/* Grade Control */}
          <View className="mb-4">
            <Text className="text-xs text-muted-foreground mb-2">Grade</Text>
            <View className="flex-row items-center gap-3">
              <Button
                onPress={() => {
                  const newGrade = Math.max(-10, grade - 0.5);
                  console.log(
                    `[BikeControl] Decreasing grade: ${grade}% -> ${newGrade}%`,
                  );
                  setGrade(newGrade);
                }}
                disabled={isDisabled}
                variant={isDisabled ? "ghost" : "default"}
                size="icon"
                className="w-12 h-12"
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
              </Button>

              <View className="flex-1 items-center">
                <Text className="text-3xl font-bold">{grade.toFixed(1)}%</Text>
              </View>

              <Button
                onPress={() => {
                  const newGrade = Math.min(20, grade + 0.5);
                  console.log(
                    `[BikeControl] Increasing grade: ${grade}% -> ${newGrade}%`,
                  );
                  setGrade(newGrade);
                }}
                disabled={isDisabled}
                variant={isDisabled ? "ghost" : "default"}
                size="icon"
                className="w-12 h-12"
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
              </Button>
            </View>
          </View>

          {/* Wind Speed Control */}
          <View className="mb-4">
            <Text className="text-xs text-muted-foreground mb-2">
              Wind Speed
            </Text>
            <View className="flex-row items-center gap-3">
              <Button
                onPress={() => {
                  const newWind = Math.max(-10, windSpeed - 1);
                  console.log(
                    `[BikeControl] Decreasing wind: ${windSpeed}m/s -> ${newWind}m/s`,
                  );
                  setWindSpeed(newWind);
                }}
                disabled={isDisabled}
                variant={isDisabled ? "ghost" : "default"}
                size="icon"
                className="w-12 h-12"
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
              </Button>

              <View className="flex-1 items-center">
                <Text className="text-3xl font-bold">{windSpeed} m/s</Text>
              </View>

              <Button
                onPress={() => {
                  const newWind = Math.min(20, windSpeed + 1);
                  console.log(
                    `[BikeControl] Increasing wind: ${windSpeed}m/s -> ${newWind}m/s`,
                  );
                  setWindSpeed(newWind);
                }}
                disabled={isDisabled}
                variant={isDisabled ? "ghost" : "default"}
                size="icon"
                className="w-12 h-12"
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
              </Button>
            </View>
          </View>

          <Button
            onPress={() => {
              console.log(`[BikeControl] Apply Simulation button pressed`);
              applySimulation();
            }}
            disabled={isDisabled}
            variant={isDisabled ? "ghost" : "default"}
            className="w-full"
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              {isDisabled
                ? "Auto Mode Active - Switch to Manual"
                : "Apply Simulation"}
            </Text>
          </Button>
        </View>
      )}

      {/* Resistance Mode Controls */}
      {bikeMode === "resistance" && supportsResistance && (
        <View>
          <Text className="text-sm font-medium mb-3">Resistance Level</Text>

          {/* Auto mode info banner */}
          {isDisabled && (
            <View className="bg-primary/10 p-3 rounded-lg mb-3 border border-primary/20">
              <Text className="text-xs text-muted-foreground">
                Controls are disabled in Auto mode. Toggle to Manual mode above
                to adjust trainer settings.
              </Text>
            </View>
          )}

          <View className="flex-row items-center gap-3 mb-3">
            <Button
              onPress={() => {
                const newLevel = Math.max(1, resistanceLevel - 1);
                console.log(
                  `[BikeControl] Decreasing resistance: ${resistanceLevel} -> ${newLevel}`,
                );
                setResistanceLevel(newLevel);
              }}
              disabled={isDisabled}
              variant={isDisabled ? "ghost" : "default"}
              size="icon"
              className="w-12 h-12"
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
            </Button>

            <View className="flex-1 items-center">
              <Text className="text-4xl font-bold">{resistanceLevel}</Text>
              <Text className="text-xs text-muted-foreground mt-1">
                1-20 range
              </Text>
            </View>

            <Button
              onPress={() => {
                const newLevel = Math.min(20, resistanceLevel + 1);
                console.log(
                  `[BikeControl] Increasing resistance: ${resistanceLevel} -> ${newLevel}`,
                );
                setResistanceLevel(newLevel);
              }}
              disabled={isDisabled}
              variant={isDisabled ? "ghost" : "default"}
              size="icon"
              className="w-12 h-12"
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
            </Button>
          </View>

          <Button
            onPress={() => {
              console.log(`[BikeControl] Apply Resistance button pressed`);
              applyResistance();
            }}
            disabled={isDisabled}
            variant={isDisabled ? "ghost" : "default"}
            className="w-full"
          >
            <Text
              className={`text-center font-medium ${
                isDisabled ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              {isDisabled
                ? "Auto Mode Active - Switch to Manual"
                : "Apply Resistance"}
            </Text>
          </Button>
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
              {"value" in plan.currentStep.targets[0] &&
                `${plan.currentStep.targets[0].value}`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Mode selection button
 */
interface ModeButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}

function ModeButton({ label, active, onPress, disabled }: ModeButtonProps) {
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      variant={active ? "default" : "outline"}
      className="flex-1"
    >
      <Text
        className={`text-center text-xs font-medium ${
          active ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Button>
  );
}
