import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  type PlanStepV2,
  formatDuration,
  formatIntensityTarget,
  getStepIntensityColor,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { Edit3, GripVertical, Trash2 } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";

interface StepCardProps {
  step: PlanStepV2;
  index: number;
  isActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isDraggable?: boolean;
}

/**
 * Format all targets for display
 */
function formatAllTargets(targets?: PlanStepV2["targets"]): string {
  if (!targets || targets.length === 0) return "";
  return targets.map(formatIntensityTarget).join(" + ");
}

export const StepCard = memo<StepCardProps>(function StepCard({
  step,
  index,
  isActive = false,
  onPress,
  onLongPress,
  onDelete,
  onEdit,
  isDraggable = true,
}: StepCardProps) {
  const color = getStepIntensityColor(step);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  const handleLongPress = () => {
    if (isDraggable) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress?.();
    }
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete?.();
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEdit?.();
  };

  return (
    <Button
      variant="ghost"
      onPress={handlePress}
      onLongPress={handleLongPress}
      className={`flex-row items-center justify-start p-4 bg-card border border-border rounded-lg mb-2 h-auto min-h-0 ${
        isActive ? "border-primary border-2" : ""
      }`}
    >
      <View className="flex-row items-center w-full">
        {/* Drag Handle */}
        {isDraggable && (
          <View className="mr-3">
            <Icon
              as={GripVertical}
              size={20}
              className="text-muted-foreground"
            />
          </View>
        )}

        {/* Color Indicator */}
        <View
          className="w-1 h-12 rounded-full mr-3"
          style={{ backgroundColor: color }}
        />

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-semibold text-base">{step.name}</Text>
            <Text className="text-sm text-muted-foreground">
              {formatDuration(step.duration)}
            </Text>
          </View>

          {step.targets && step.targets.length > 0 && (
            <Text className="text-sm text-muted-foreground">
              {formatAllTargets(step.targets)}
            </Text>
          )}

          {step.notes && (
            <Text
              className="text-xs text-muted-foreground mt-1"
              numberOfLines={1}
            >
              {step.notes}
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View className="flex-row items-center ml-3">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onPress={handleEdit}
              className="p-2 min-h-0 h-auto w-auto"
            >
              <Icon as={Edit3} size={16} className="text-muted-foreground" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onPress={handleDelete}
              className="p-2 min-h-0 h-auto w-auto"
            >
              <Icon as={Trash2} size={16} className="text-destructive" />
            </Button>
          )}
        </View>
      </View>
    </Button>
  );
});

StepCard.displayName = "StepCard";
