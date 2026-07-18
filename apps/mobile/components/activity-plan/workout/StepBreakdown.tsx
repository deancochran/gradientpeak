import type { ActivityPlanIntervalStep } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { memo } from "react";
import { View } from "react-native";
import StepPreviewCard from "./StepPreviewCard";

interface StepBreakdownProps {
  steps: ActivityPlanIntervalStep[];
  maxSteps?: number;
  showAll?: boolean;
  title?: string;
}

export const StepBreakdown = memo<StepBreakdownProps>(function StepBreakdown({
  steps,
  maxSteps = 5,
  showAll = false,
  title = "Step Breakdown",
}: StepBreakdownProps) {
  const displaySteps = showAll ? steps : steps.slice(0, maxSteps);
  const remainingCount = steps.length - displaySteps.length;

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium mb-3">{title}</Text>
      <View className="gap-3">
        {displaySteps.map((step) => (
          <StepPreviewCard key={JSON.stringify(step)} step={step} showDuration={true} />
        ))}
      </View>

      {remainingCount > 0 && (
        <View className="mt-3 p-3 bg-muted/20 rounded-lg">
          <Text className="text-center text-sm text-muted-foreground">
            ... and {remainingCount} more steps
          </Text>
        </View>
      )}
    </View>
  );
});

StepBreakdown.displayName = "StepBreakdown";
