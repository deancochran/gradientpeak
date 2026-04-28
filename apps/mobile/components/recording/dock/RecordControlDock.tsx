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
            onPress: onOpenActivity,
          };
        case "gps":
          return {
            action,
            label: sessionContract.guidance.routeMode === "live_navigation" ? "GPS on" : "GPS",
            onPress: onGpsPress,
          };
        case "plan":
          return {
            action,
            label: sessionContract.guidance.hasPlan ? "Plan attached" : "Add plan",
            onPress: onOpenPlan,
          };
        case "route":
          return {
            action,
            label: sessionContract.guidance.hasRoute ? "Route attached" : "Add route",
            onPress: onOpenRoute,
          };
        case "trainer":
          return {
            action,
            label: sessionContract.devices.hasTrainer ? "Trainer" : "No trainer",
            onPress: onOpenFtms,
          };
        case "sensors":
        default:
          return {
            action,
            label: "Sensors",
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
          <QuickActionChip key={chip.action} label={chip.label} onPress={chip.onPress} />
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
                className={`rounded-full border px-3 py-2 ${
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

function QuickActionChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button variant="outline" size="sm" onPress={onPress} className="rounded-full">
      <Text>{label}</Text>
    </Button>
  );
}
