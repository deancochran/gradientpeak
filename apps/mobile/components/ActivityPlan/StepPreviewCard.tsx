// ================================
// Step Preview Components
// ================================

import {
  PlanStepV2,
  formatDurationCompact,
  calculateTotalDurationSecondsV2,
  getStepIntensityColor,
  getTargetDisplayName,
  formatTargetValue,
} from "@repo/core";
import { memo } from "react";
import { View } from "react-native";
import { Text } from "../ui/text";

interface StepPreviewCardProps {
  step: PlanStepV2;
  isUpcoming?: boolean;
  showDuration?: boolean;
}

const StepPreviewCard = memo<StepPreviewCardProps>(function StepPreviewCard({
  step,
  isUpcoming = false,
  showDuration = true,
}: StepPreviewCardProps) {
  return (
    <View
      className={`p-3 rounded-lg border ${
        isUpcoming ? "border-blue-200 bg-blue-50" : "border-muted bg-background"
      }`}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text
            className={`text-sm font-medium ${
              isUpcoming ? "text-blue-800" : "text-foreground"
            }`}
          >
            {step.name}
          </Text>
          {step.description && (
            <Text className="text-xs text-muted-foreground mt-1">
              {step.description}
            </Text>
          )}
        </View>

        {showDuration && (
          <View className="ml-2">
            <Text className="text-xs text-muted-foreground">
              {formatDurationCompact(calculateTotalDurationSecondsV2([step]))}
            </Text>
          </View>
        )}
      </View>

      {/* Intensity indicator */}
      {step.targets && step.targets.length > 0 && (
        <View className="flex-row items-center gap-2 mb-2">
          <View
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: getStepIntensityColor(step) }}
          />
          <Text className="text-xs text-muted-foreground">
            {step.targets.map((t) => formatTargetValue(t)).join(", ")}
          </Text>
        </View>
      )}

      {/* Targets preview */}
      {step.targets && step.targets.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {step.targets.map((target, index) => (
            <View key={index} className="px-2 py-1 bg-muted/50 rounded-md">
              <Text className="text-xs text-muted-foreground">
                {getTargetDisplayName(target.type)}: {formatTargetValue(target)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

StepPreviewCard.displayName = "StepPreviewCard";

export default StepPreviewCard;
