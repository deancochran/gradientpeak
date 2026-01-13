/**
 * Recording Controls
 *
 * Displays recording control buttons based on current state.
 * Reusable component for both collapsed and expanded footer states.
 *
 * Button Layouts:
 * - not_started: Full-width "Start" button (green, 56px)
 * - recording: Pause | Lap | Finish (3-column, 48px)
 * - paused: Resume | Discard | Finish (3-column, 48px)
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
  onDiscard: () => void;
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

  // Recording: Show Pause | Lap | Finish
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
          className="h-12 w-12 bg-blue-600 rounded-full items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-base font-semibold">Lap</Text>
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

  // Paused: Show Resume | Discard | Finish
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
          onPress={onDiscard}
          className="flex-1 h-12 bg-gray-600 rounded-lg items-center justify-center active:opacity-80"
        >
          <Text className="text-white text-base font-semibold">Discard</Text>
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
