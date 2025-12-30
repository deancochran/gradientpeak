// ================================
// Activity Preview Mode
// ================================

import { memo } from "react";
import { ScrollView, View } from "react-native";
import { type ActivityPlanStructureV2 } from "@repo/core";
import { ActivityGraph } from "./ActivityGraph";
import { ActivityMetricsGrid } from "./ActivityMetricsGrid";
import { Text } from "../ui/text";
import StepPreviewCard from "./StepPreviewCard";

const ActivityPreviewMode = memo<{ structure: ActivityPlanStructureV2 }>(
  function ActivityPreviewMode({ structure }) {
    // Flatten first 6 steps from intervals for preview
    const previewSteps = [];
    let count = 0;

    for (const interval of structure.intervals) {
      if (count >= 6) break;
      for (const step of interval.steps) {
        if (count >= 6) break;
        // Convert IntervalStepV2 to PlanStepV2 format for display
        previewSteps.push({
          ...step,
          segmentName: interval.name,
          segmentIndex: 0,
          originalRepetitionCount: interval.repetitions,
        });
        count++;
      }
    }

    return (
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Activity Graph */}
        <View className="mb-6">
          <ActivityGraph structure={structure} />
        </View>

        {/* Key Activity Metrics */}
        <ActivityMetricsGrid structure={structure} />

        {/* Step Breakdown Preview */}
        <View className="mb-6">
          <Text className="text-sm font-medium mb-3">Activity Steps</Text>
          <View className="gap-3">
            {previewSteps.map((step, index) => (
              <StepPreviewCard key={index} step={step} showDuration={true} />
            ))}
          </View>
        </View>
      </ScrollView>
    );
  },
);

ActivityPreviewMode.displayName = "ActivityPreviewMode";

export default ActivityPreviewMode;
