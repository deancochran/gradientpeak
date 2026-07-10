import type { RecordingPrimarySurface, RecordingSessionContract, RecordingState } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RecordingControls } from "@/components/recording/footer";

export interface RecordControlDockProps {
  activeSurface: RecordingPrimarySurface | null;
  onChangeSurface: (surface: RecordingPrimarySurface) => void;
  onGpsPress: () => void;
  onOpenActivity: () => void;
  onOpenFtms: () => void;
  onOpenPlan: () => void;
  onOpenRoute: () => void;
  onOpenSensors: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
  recordingState: RecordingState;
  sessionContract: RecordingSessionContract | null;
}

export function RecordControlDock({
  activeSurface,
  onChangeSurface,
  onGpsPress,
  onOpenActivity,
  onOpenFtms,
  onOpenPlan,
  onOpenRoute,
  onOpenSensors,
  onStart,
  onPause,
  onResume,
  onLap,
  onFinish,
  recordingState,
  sessionContract,
}: RecordControlDockProps) {
  const insets = useSafeAreaInsets();

  const chips = React.useMemo(() => {
    if (!sessionContract) {
      return [];
    }

    return sessionContract.surfaces.quickActions.map((action) => {
      switch (action) {
        case "activity":
          return {
            action,
            label: sessionContract.editing.canEditActivity ? "Activity" : "Activity locked",
            accessibilityLabel: sessionContract.editing.canEditActivity
              ? "Open activity settings"
              : "View locked activity settings",
            onPress: onOpenActivity,
          };
        case "gps":
          return {
            action,
            label: sessionContract.guidance.routeMode === "live_navigation" ? "GPS on" : "GPS",
            accessibilityLabel:
              sessionContract.guidance.routeMode === "live_navigation"
                ? "Open GPS settings, GPS is on"
                : "Open GPS settings",
            onPress: onGpsPress,
          };
        case "plan":
          return {
            action,
            label: sessionContract.guidance.hasPlan ? "Plan attached" : "Add plan",
            accessibilityLabel: sessionContract.guidance.hasPlan
              ? "Open plan settings, plan attached"
              : "Open plan settings",
            onPress: onOpenPlan,
          };
        case "route":
          return {
            action,
            label: sessionContract.guidance.hasRoute ? "Route attached" : "Add route",
            accessibilityLabel: sessionContract.guidance.hasRoute
              ? "Open route settings, route attached"
              : "Open route settings",
            onPress: onOpenRoute,
          };
        case "trainer":
          return {
            action,
            label: sessionContract.devices.hasTrainer ? "Trainer" : "No trainer",
            accessibilityLabel: sessionContract.devices.hasTrainer
              ? "Open trainer controls, trainer connected"
              : "Open trainer controls, no trainer connected",
            onPress: onOpenFtms,
          };
        default:
          return {
            action,
            label: "Sensors",
            accessibilityLabel: "Open sensor controls",
            onPress: onOpenSensors,
          };
      }
    });
  }, [
    onGpsPress,
    onOpenActivity,
    onOpenFtms,
    onOpenPlan,
    onOpenRoute,
    onOpenSensors,
    sessionContract,
  ]);

  return (
    <View
      className="absolute bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 pt-3"
      style={{ paddingBottom: Math.max(16, insets.bottom + 8) }}
      testID="record-control-dock"
    >
      <View className="mb-3">
        <RecordingControls
          recordingState={recordingState}
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          onLap={onLap}
          onFinish={onFinish}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pr-6"
      >
        {chips.map((chip) => (
          <QuickActionChip
            key={chip.action}
            label={chip.label}
            accessibilityLabel={chip.accessibilityLabel}
            onPress={chip.onPress}
            testID={`record-dock-quick-action-${chip.action}`}
          />
        ))}
      </ScrollView>

      {sessionContract?.surfaces.availablePrimarySurfaces.length ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {sessionContract.surfaces.availablePrimarySurfaces.map((surface) => {
            const isActive = surface === activeSurface;

            return (
              <Pressable
                key={surface}
                onPress={() => onChangeSurface(surface)}
                accessibilityLabel={`Show ${surface} recording surface`}
                accessibilityHint={isActive ? "Currently selected" : "Switches the recording view"}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                className={`min-h-11 min-w-11 rounded-full border px-3 py-2 active:opacity-80 ${
                  isActive ? "border-foreground bg-foreground" : "border-border bg-card"
                }`}
                testID={`record-dock-surface-${surface}`}
              >
                <Text
                  className={
                    isActive
                      ? "text-xs font-medium uppercase tracking-wide text-background"
                      : "text-xs font-medium uppercase tracking-wide text-foreground"
                  }
                >
                  {surface}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function QuickActionChip({
  label,
  accessibilityLabel,
  onPress,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-11 min-w-11 rounded-full active:opacity-80"
      testID={testID}
    >
      <Text>{label}</Text>
    </Button>
  );
}
