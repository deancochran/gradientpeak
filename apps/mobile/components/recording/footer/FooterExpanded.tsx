/**
 * Footer Expanded State
 *
 * Displays recording controls at top + configuration grid below.
 * Height: 60% of screen
 *
 * Configuration Tiles (2-column grid):
 * - Activity: Category + Location selection
 *   • Category locked if Activity Plan attached (follows plan's category)
 *   • Location can always be changed before recording starts
 *   • Both locked during recording
 * - Activity Plan: Attach/detach planned activity
 *   • Shows only activities matching selected category (if category chosen first)
 * - Route: Attach/detach route mid-workout
 * - Sensors: Navigate to /record/sensors
 * - Adjust: FTMS control (navigate to /record/ftms)
 */

import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type {
  PublicActivityCategory,
  PublicActivityLocation,
  RecordingState,
} from "@repo/core";

import { RecordingControls } from "./RecordingControls";

export interface FooterExpandedProps {
  service: ActivityRecorderService | null;
  recordingState: RecordingState;
  category: PublicActivityCategory;
  location: PublicActivityLocation;
  hasPlan: boolean;
  hasRoute: boolean;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
}

export function FooterExpanded({
  service,
  recordingState,
  category,
  location,
  hasPlan,
  hasRoute,
  onPause,
  onResume,
  onLap,
  onFinish,
}: FooterExpandedProps) {
  const handleActivityPress = () => {
    // Navigate to activity selection if not recording
    // (Category locked if plan attached, but location can still change)
    if (recordingState === "not_started") {
      console.log("[FooterExpanded] Navigating to activity selection");
      router.push("/record/activity");
    } else {
      console.log("[FooterExpanded] Activity tile locked during recording");
    }
  };

  const handlePlanPress = () => {
    console.log("[FooterExpanded] Navigating to plan picker");
    router.push("/record/plan");
  };

  const handleRoutePress = () => {
    console.log("[FooterExpanded] Navigating to route picker");
    router.push("/record/route");
  };

  const handleSensorsPress = () => {
    console.log("[FooterExpanded] Navigating to sensors");
    router.push("/record/sensors");
  };

  const handleAdjustPress = () => {
    console.log("[FooterExpanded] Navigating to FTMS control");
    router.push("/record/ftms");
  };

  return (
    <ScrollView className="flex-1 bg-background" bounces={false}>
      <View className="px-4 pt-4 pb-6">
        {/* Recording Controls (Pinned) */}
        <View className="mb-6">
          <RecordingControls
            recordingState={recordingState}
            onStart={() => {}}
            onPause={onPause}
            onResume={onResume}
            onLap={onLap}
            onFinish={onFinish}
            onDiscard={() => {}}
          />
        </View>

        {/* Configuration Grid (2 columns) */}
        <Text className="text-sm font-medium text-muted-foreground mb-3">
          Configuration
        </Text>

        <View className="flex-row flex-wrap gap-3">
          {/* Activity Tile (Locked only during recording) */}
          <ConfigTile
            label="Activity"
            value={`${category.replace("_", " ")} · ${location}`}
            onPress={handleActivityPress}
            disabled={recordingState !== "not_started"}
          />

          {/* Activity Plan Tile */}
          <ConfigTile
            label="Activity Plan"
            value={hasPlan ? "Change Plan" : "Add Plan"}
            onPress={handlePlanPress}
          />

          {/* Route Tile */}
          <ConfigTile
            label="Route"
            value={hasRoute ? "Edit Route" : "Add Route"}
            onPress={handleRoutePress}
          />

          {/* Sensors Tile */}
          <ConfigTile
            label="Sensors"
            value="0/5 Connected"
            onPress={handleSensorsPress}
          />

          {/* Adjust Tile (FTMS) */}
          <ConfigTile
            label="Adjust"
            value="Trainer Control"
            onPress={handleAdjustPress}
          />
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * Configuration Tile Component
 * Reusable tile for footer configuration grid
 */
interface ConfigTileProps {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}

function ConfigTile({ label, value, onPress, disabled }: ConfigTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-1 min-w-[45%] bg-card p-4 rounded-lg border border-border"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-xs text-muted-foreground mb-1">{label}</Text>
      <Text className="text-sm font-medium capitalize">{value}</Text>
    </Pressable>
  );
}
