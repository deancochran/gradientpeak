/**
 * Footer Collapsed State
 *
 * Displays recording controls based on current recording state.
 * Height: 120px
 *
 * States:
 * - not_started: "Start" button (full-width green)
 * - recording: Pause | Lap | Finish buttons (3-column)
 * - paused: Resume | Discard | Finish buttons (3-column)
 */

import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Bluetooth } from "lucide-react-native";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PublicActivityCategory, RecordingState } from "@repo/core";
import { useSensors } from "@/lib/hooks/useActivityRecorder";

import { RecordingControls } from "./RecordingControls";

export interface FooterCollapsedProps {
  service: ActivityRecorderService | null;
  recordingState: RecordingState;
  category: PublicActivityCategory;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}

export function FooterCollapsed({
  service,
  recordingState,
  category,
  onStart,
  onPause,
  onResume,
  onLap,
  onFinish,
  onDiscard,
}: FooterCollapsedProps) {
  const { sensors, count } = useSensors(service);

  // Calculate total sensor count (hardcoded max for now)
  // TODO: Make this dynamic based on available sensor types
  const totalSensors = 5;

  const handleSensorBadgePress = () => {
    router.push("/record/sensors");
  };

  return (
    <View className="h-[120px] px-4 pt-4 pb-6 bg-background border-t border-border">
      {/* Activity Type Label with Sensor Badge */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xs text-muted-foreground capitalize">
          {category.replace("_", " ")} Activity
        </Text>

        {/* Sensor Badge */}
        <Pressable
          onPress={handleSensorBadgePress}
          className="flex-row items-center gap-1.5 px-2 py-1 rounded bg-card border border-border"
        >
          <Icon as={Bluetooth} size={12} className="text-muted-foreground" />
          <Text className="text-xs font-medium">
            {count}/{totalSensors}
          </Text>
        </Pressable>
      </View>

      {/* Recording Controls */}
      <RecordingControls
        recordingState={recordingState}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onLap={onLap}
        onFinish={onFinish}
        onDiscard={onDiscard}
      />
    </View>
  );
}
