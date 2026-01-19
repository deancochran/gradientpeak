/**
 * Footer Collapsed State
 *
 * Displays recording controls based on current recording state.
 * Clean, minimal design - controls only.
 *
 * States:
 * - not_started: "Start" button (full-width green)
 * - recording: Pause | Lap | Finish buttons (3-column)
 * - paused: Resume | Discard | Finish buttons (3-column)
 */

import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PublicActivityCategory, RecordingState } from "@repo/core";

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
}: FooterCollapsedProps) {
  const insets = useSafeAreaInsets();

  // Debug logging
  React.useEffect(() => {
    console.log("[FooterCollapsed] Rendered with state:", recordingState);
    console.log("[FooterCollapsed] Category:", category);
  }, [recordingState, category]);

  return (
    <View
      className="px-4 pt-6 bg-background border-t border-border"
      style={{ paddingBottom: Math.max(24, insets.bottom + 16) }}
    >
      {/* Recording Controls - Centered and clean */}
      <RecordingControls
        recordingState={recordingState}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onLap={onLap}
        onFinish={onFinish}
      />
    </View>
  );
}
