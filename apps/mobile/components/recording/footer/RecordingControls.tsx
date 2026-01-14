/**
 * Recording Controls
 *
 * Displays recording control buttons based on current state.
 * Reusable component for both collapsed and expanded footer states.
 *
 * Button Layouts:
 * - not_started: Full-width "Start" button (green, 56px)
 * - recording: Pause | Lap (2-column, 48px)
 * - paused: Resume | Finish (2-column, 48px)
 *
 * Note: Discard is only available on the submit page, not during recording
 */

import React from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import type { RecordingState } from "@repo/core";

export interface RecordingControlsProps {
  recordingState: RecordingState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
  onDiscard?: () => void; // Optional - not used in recording controls
}

export function RecordingControls({
  recordingState,
  onStart,
  onPause,
  onResume,
  onLap,
  onFinish,
  onDiscard,
}: RecordingControlsProps) {
  // Not started: Show full-width Start button
  if (recordingState === "not_started") {
    return (
      <Pressable
        onPress={onStart}
        className="h-14 bg-green-600 rounded-lg items-center justify-center active:opacity-80"
      >
        <Text className="text-white text-lg font-semibold">Start</Text>
      </Pressable>
    );
  }

  // Recording: Show Pause | Lap (no Finish while recording)
  if (recordingState === "recording") {
    return (
      <View className="flex-row gap-3">
        <Pressable
          onPress={onPause}
          className="flex-1 h-12 bg-yellow-600 rounded-lg items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-base font-semibold">Pause</Text>
        </Pressable>

        <Pressable
          onPress={onLap}
          className="flex-1 h-12 bg-blue-600 rounded-lg items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-base font-semibold">Lap</Text>
        </Pressable>
      </View>
    );
  }

  // Paused: Show Resume | Finish (Discard is on submit page)
  if (recordingState === "paused") {
    return (
      <View className="flex-row gap-3">
        <Pressable
          onPress={onResume}
          className="flex-1 h-12 bg-green-600 rounded-lg items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-base font-semibold">Resume</Text>
        </Pressable>

        <Pressable
          onPress={onFinish}
          className="flex-1 h-12 bg-red-600 rounded-lg items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-base font-semibold">Finish</Text>
        </Pressable>
      </View>
    );
  }

  // Finished: Should not be shown (user navigates to submit screen)
  return null;
}
