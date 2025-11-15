import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  calculateTotalDuration,
  flattenPlanSteps,
  type StepOrRepetition,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { Edit3, GripVertical, RefreshCw, Trash2 } from "lucide-react-native";
import { memo } from "react";
import { TouchableOpacity, View } from "react-native";

interface RepeatCardProps {
  repetition: StepOrRepetition;
  index: number;
  isActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isDraggable?: boolean;
}

const RepeatCard = memo(function RepeatCard({
  repetition,
  index,
  isActive = false,
  onPress,
  onLongPress,
  onDelete,
  onEdit,
  isDraggable = true,
}: RepeatCardProps) {
  if (repetition.type !== "repetition") {
    return null;
  }

  const stepCount = repetition.steps?.length || 0;
  const repeatCount = repetition.repeat || 1;

  // Calculate duration per repeat
  const stepDuration = repetition.steps
    ? calculateTotalDuration(flattenPlanSteps(repetition.steps))
    : 0;
  const totalDuration = stepDuration * repeatCount;

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
      <TouchableOpacity
        className="p-3"
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
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
        {repetition.steps && repetition.steps.length > 0 && (
          <View className="mt-3 pt-3 border-t border-border">
            <Text className="text-xs text-muted-foreground mb-2">Steps:</Text>
            <View className="flex-row flex-wrap gap-1">
              {repetition.steps.map((step, stepIndex) => (
                <View key={stepIndex} className="bg-muted px-2 py-1 rounded-md">
                  <Text className="text-xs text-muted-foreground">
                    {step.name || `Step ${stepIndex + 1}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
});

export { RepeatCard };
