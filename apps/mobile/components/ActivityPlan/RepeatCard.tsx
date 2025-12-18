import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { type PlanStepV2 } from "@repo/core";
import * as Haptics from "expo-haptics";
import { Edit3, GripVertical, RefreshCw, Trash2 } from "lucide-react-native";
import { memo } from "react";
import { TouchableOpacity, View } from "react-native";

interface RepeatSegment {
  segmentName: string;
  steps: PlanStepV2[];
  segmentIndex: number;
}

interface RepeatCardProps {
  segment: RepeatSegment;
  index: number;
  isActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isDraggable?: boolean;
}

/**
 * Calculate duration for a V2 step in milliseconds
 */
function getStepDurationMs(step: PlanStepV2): number {
  switch (step.duration.type) {
    case "time":
      return step.duration.seconds * 1000;
    case "distance":
      // Estimate: 5 min/km pace
      return (step.duration.meters / 1000) * 5 * 60 * 1000;
    case "repetitions":
      // Estimate: 30 seconds per rep
      return step.duration.count * 30 * 1000;
    case "untilFinished":
      return 300000; // 5 minutes default
    default:
      return 0;
  }
}

const RepeatCard = memo(function RepeatCard({
  segment,
  index,
  isActive = false,
  onPress,
  onLongPress,
  onDelete,
  onEdit,
  isDraggable = true,
}: RepeatCardProps) {
  const stepCount = segment.steps.length;
  const repeatCount = segment.steps[0]?.originalRepetitionCount || 1;

  // Calculate duration from V2 steps
  const totalDuration = segment.steps.reduce(
    (sum, step) => sum + getStepDurationMs(step),
    0,
  );
  const stepDuration = repeatCount > 0 ? totalDuration / repeatCount : 0;

  const formatDuration = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.selectionAsync();
      onPress();
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress();
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      Haptics.selectionAsync();
      onEdit();
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDelete();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View
        className={`border rounded-lg mb-3 bg-card ${
          isActive
            ? "border-primary shadow-md scale-105"
            : "border-border shadow-sm"
        }`}
      >
        {/* Header */}
        <View className="flex-row items-center p-3 border-b border-border">
          {isDraggable && (
            <View className="mr-3">
              <GripVertical size={16} className="text-muted-foreground" />
            </View>
          )}

          <View className="flex-1 flex-row items-center">
            <RefreshCw size={16} className="text-primary mr-2" />
            <Text className="font-medium text-foreground">
              Repeat {repeatCount}x
            </Text>
          </View>

          <View className="flex-row gap-2">
            <Button
              variant="ghost"
              size="sm"
              onPress={handleEdit}
              className="h-8 w-8 p-0"
            >
              <Edit3 size={14} className="text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={handleDelete}
              className="h-8 w-8 p-0"
            >
              <Trash2 size={14} className="text-destructive" />
            </Button>
          </View>
        </View>

        {/* Content */}
        <View className="p-3">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm text-muted-foreground">
              {stepCount} step{stepCount !== 1 ? "s" : ""} per repeat
            </Text>
            <Text className="text-sm font-medium text-foreground">
              {formatDuration(totalDuration)} total
            </Text>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-xs text-muted-foreground">
              {formatDuration(stepDuration)} per repeat
            </Text>
            <Text className="text-xs text-muted-foreground">
              Position {index + 1}
            </Text>
          </View>

          {/* Steps Preview */}
          {segment.steps.length > 0 && (
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-xs text-muted-foreground mb-2">Steps:</Text>
              <View className="flex-row flex-wrap gap-1">
                {segment.steps.slice(0, repeatCount).map((step, stepIndex) => (
                  <View
                    key={stepIndex}
                    className="bg-muted px-2 py-1 rounded-md"
                  >
                    <Text className="text-xs text-muted-foreground">
                      {step.name || `Step ${stepIndex + 1}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export { RepeatCard };
