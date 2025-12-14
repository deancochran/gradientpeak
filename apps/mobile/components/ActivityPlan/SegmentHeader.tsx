import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { PlanStepV2 } from "@repo/core/schemas/activity_plan_v2";
import * as Haptics from "expo-haptics";
import {
    ChevronDown,
    ChevronRight,
    Edit2,
    MoreVertical,
    Trash2,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";

interface SegmentHeaderProps {
  segmentName: string;
  steps: PlanStepV2[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function SegmentHeader({
  segmentName,
  steps,
  isCollapsed,
  onToggleCollapse,
  onRename,
  onDelete,
}: SegmentHeaderProps) {
  const [showActions, setShowActions] = useState(false);

  // Calculate total duration for the segment
  const totalDurationMs = steps.reduce((total, step) => {
    const duration = step.duration;
    if (duration.type === "time") {
      return total + duration.seconds * 1000;
    } else if (duration.type === "distance") {
      // Estimate 5 min/km
      return total + (duration.meters / 1000) * 5 * 60 * 1000;
    } else if (duration.type === "repetitions") {
      // Estimate 30s per rep
      return total + duration.count * 30 * 1000;
    }
    return total;
  }, 0);

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      const mins = minutes.toString().padStart(2, "0");
      return `${hours}:${mins}h`;
    }
    return `${minutes}m`;
  };

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleCollapse();
  };

  const handleRename = () => {
    setShowActions(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRename?.();
  };

  const handleDelete = () => {
    setShowActions(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Delete Segment",
      `Are you sure you want to delete the "${segmentName}" segment and all ${steps.length} step(s) in it?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onDelete?.();
          },
        },
      ],
    );
  };

  return (
    <View className="bg-muted/50 border-b border-border">
      <View className="flex-row items-center px-4 py-3">
        {/* Collapse/Expand Button */}
        <Pressable
          onPress={handleToggle}
          className="mr-3 active:opacity-50"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isCollapsed ? (
            <ChevronRight size={20} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={20} className="text-muted-foreground" />
          )}
        </Pressable>

        {/* Segment Info */}
        <Pressable
          onPress={handleToggle}
          className="flex-1 active:opacity-70"
        >
          <View className="flex-row items-baseline gap-2">
            <Text className="text-base font-semibold">{segmentName}</Text>
            <Text className="text-sm text-muted-foreground">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </Text>
            <Text className="text-sm text-muted-foreground">•</Text>
            <Text className="text-sm text-muted-foreground">
              {formatDuration(totalDurationMs)}
            </Text>
          </View>
        </Pressable>

        {/* Actions Menu */}
        {(onRename || onDelete) && (
          <View>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowActions(!showActions);
              }}
              className="h-8 w-8 p-0"
            >
              <MoreVertical size={18} className="text-muted-foreground" />
            </Button>

            {/* Actions Dropdown */}
            {showActions && (
              <View className="absolute right-0 top-10 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[160px]">
                {onRename && (
                  <Pressable
                    onPress={handleRename}
                    className="flex-row items-center px-4 py-3 active:bg-muted"
                  >
                    <Edit2 size={16} className="text-foreground mr-3" />
                    <Text className="text-sm">Rename Segment</Text>
                  </Pressable>
                )}

                {onDelete && (
                  <>
                    {onRename && (
                      <View className="h-px bg-border mx-2" />
                    )}
                    <Pressable
                      onPress={handleDelete}
                      className="flex-row items-center px-4 py-3 active:bg-muted"
                    >
                      <Trash2 size={16} className="text-destructive mr-3" />
                      <Text className="text-sm text-destructive">
                        Delete Segment
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Tap outside to close actions */}
      {showActions && (
        <Pressable
          onPress={() => setShowActions(false)}
          className="absolute inset-0 -z-10"
          style={{ top: -1000, bottom: -1000, left: -1000, right: -1000 }}
        />
      )}
    </View>
  );
}
