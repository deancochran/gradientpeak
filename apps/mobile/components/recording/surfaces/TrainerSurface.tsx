import type { RecordingSessionContract } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";

export function TrainerSurface({
  navigateTo,
  sensorCount,
  sessionContract,
}: {
  navigateTo: (...args: any[]) => unknown;
  sensorCount: number;
  sessionContract: RecordingSessionContract | null;
}) {
  const hasTrainer = sessionContract?.devices.hasTrainer ?? false;
  const canControlTrainer = sessionContract?.devices.trainerControllable ?? false;
  const consequence = sessionContract?.validation.consequences.find((entry) =>
    entry.includes("Trainer"),
  );

  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">Trainer</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {hasTrainer
              ? canControlTrainer
                ? "Trainer controls are available for this session."
                : "A trainer is connected, but direct control is not currently available."
              : "Connect a trainer from Sensors if you want machine-specific controls."}
          </Text>
        </View>
        <View className="rounded-full bg-muted px-3 py-1">
          <Text className="text-xs font-medium text-foreground">{sensorCount} sensors</Text>
        </View>
      </View>

      {consequence ? (
        <View className="mt-4 rounded-xl border border-border bg-background p-3">
          <Text className="text-sm text-muted-foreground">{consequence}</Text>
        </View>
      ) : null}

      <View className="mt-auto gap-3 pt-6">
        <Button onPress={() => navigateTo("/record/ftms")} disabled={!canControlTrainer}>
          <Text className="text-primary-foreground">Open Trainer Controls</Text>
        </Button>
        <Button variant="outline" onPress={() => navigateTo("/record/sensors")}>
          <Text>Open Sensors</Text>
        </Button>
      </View>
    </View>
  );
}
