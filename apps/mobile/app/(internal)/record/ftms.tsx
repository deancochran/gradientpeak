import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { BikeControlUI } from "@/components/recording/ftms/BikeControlUI";
import { EllipticalControlUI } from "@/components/recording/ftms/EllipticalControlUI";
import { RowerControlUI } from "@/components/recording/ftms/RowerControlUI";
import { TreadmillControlUI } from "@/components/recording/ftms/TreadmillControlUI";
import { useBleState, usePlan, useSensors, useSessionView } from "@/lib/hooks/useActivityRecorder";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

export default function FTMSControlPage() {
  const service = useSharedActivityRecorder();
  const navigateTo = useAppNavigate();
  const plan = usePlan(service);
  const { sensors } = useSensors(service);
  const sessionView = useSessionView(service);
  const bleState = useBleState(service);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const controlMode = sessionView?.overrideState.trainerMode ?? "auto";
  const trainerSensor = useMemo(
    () => sensors.find((sensor) => sensor.isControllable || Boolean(sensor.ftmsFeatures)) ?? null,
    [sensors],
  );
  const controlReadyTrainer = trainerSensor?.isControllable ? trainerSensor : null;
  const machineType =
    sessionView?.trainer.machineType === "generic"
      ? "bike"
      : (sessionView?.trainer.machineType ?? null);

  const handleToggleControlMode = () => {
    if (!service) return;

    if (controlMode === "auto") {
      service.setManualControlMode(true);
      setShowAdvancedControls(false);
      return;
    }

    service.setManualControlMode(false);
    setShowAdvancedControls(false);
  };

  if (!service) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">No recording service active</Text>
      </View>
    );
  }

  if (!controlReadyTrainer || !machineType) {
    return (
      <View className="flex-1 justify-center bg-background px-6">
        <View className="rounded-3xl border border-border bg-card p-6">
          <Text className="text-xl font-semibold text-foreground">Trainer controls are blocked</Text>
          <Text className="mt-2 text-sm text-muted-foreground">
            {getBlockedDescription({
              bleState,
              hasTrainer: Boolean(trainerSensor),
              recoveryState: sessionView?.trainer.recoveryState ?? "idle",
              commandFailed: sessionView?.trainer.lastCommandStatus?.success === false,
            })}
          </Text>
          <Button onPress={() => navigateTo("/record/sensors")} className="mt-4">
            <Text className="text-primary-foreground">{getBlockedActionLabel(Boolean(trainerSensor))}</Text>
          </Button>
          <Text className="mt-3 text-xs text-muted-foreground">
            If another app already owns trainer control, close it first and reconnect here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" bounces={false}>
      <View className="px-4 pt-4 pb-6">
        <View className="mb-4 rounded-2xl border border-border bg-card p-4">
          <Text className="text-2xl font-bold capitalize text-foreground">{machineType} control</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {controlReadyTrainer.name} is connected and ready for FTMS control.
          </Text>

          <View className="mt-4 rounded-xl border border-border bg-background p-4">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {controlMode === "auto" ? "Auto mode" : "Manual mode"}
                </Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  {controlMode === "auto"
                    ? plan.hasPlan
                      ? "Plan targets control the trainer until you switch to manual."
                      : "Trainer stays in automatic control until you switch to manual."
                    : "Manual mode is ready. Open advanced controls only when you need them."}
                </Text>
              </View>
              <Button onPress={handleToggleControlMode} size="sm">
                <Text className="text-xs text-primary-foreground font-medium">
                  Switch to {controlMode === "auto" ? "Manual" : "Auto"}
                </Text>
              </Button>
            </View>
          </View>

          {controlMode === "manual" ? (
            <Button
              variant="outline"
              onPress={() => setShowAdvancedControls((current) => !current)}
              className="mt-4"
            >
              <Text className="text-foreground">
                {showAdvancedControls ? "Hide advanced controls" : "Open advanced controls"}
              </Text>
            </Button>
          ) : (
            <View className="mt-4 rounded-xl border border-border bg-background p-4">
              <Text className="text-sm font-medium text-foreground">Advanced controls hidden</Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                Stay in auto mode for the simplest experience. Switch to manual only when you need to override the trainer.
              </Text>
            </View>
          )}
        </View>

        {controlMode === "manual" && showAdvancedControls && (
          <View className="rounded-2xl border border-border bg-card p-4">
            <Text className="mb-4 text-sm font-semibold text-foreground">Advanced controls</Text>
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
        )}
      </View>
    </ScrollView>
  );
}

function getBlockedDescription({
  bleState,
  hasTrainer,
  recoveryState,
  commandFailed,
}: {
  bleState: string;
  hasTrainer: boolean;
  recoveryState: "idle" | "applying_reconnect_recovery" | "recovered" | "failed";
  commandFailed: boolean;
}) {
  if (bleState === "PoweredOff") {
    return "Bluetooth is off. Turn it back on, then reconnect the trainer from the sensors screen.";
  }

  if (bleState === "Unauthorized") {
    return "Bluetooth permission is blocked. Allow access in system settings before trying again.";
  }

  if (recoveryState === "applying_reconnect_recovery") {
    return "The app is still recovering the trainer session. Wait a moment, then try controls again.";
  }

  if (recoveryState === "failed") {
    return "Trainer recovery failed. Reconnect the trainer from the sensors screen before opening controls again.";
  }

  if (commandFailed) {
    return "The trainer is connected, but control is not available. Another app may already own trainer control.";
  }

  if (!hasTrainer) {
    return "Connect a supported FTMS trainer on the sensors screen before trying to change resistance, power, speed, or incline.";
  }

  return "This trainer is connected for data, but control is not ready yet. Wait for control to finish setting up or reconnect it.";
}

function getBlockedActionLabel(hasTrainer: boolean) {
  return hasTrainer ? "Reconnect trainer" : "Open sensors";
}
