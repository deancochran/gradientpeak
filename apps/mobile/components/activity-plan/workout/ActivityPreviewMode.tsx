// ================================
// Activity Preview Mode
// ================================

import type { ActivityPlanStructureV3 } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { memo } from "react";
import { ScrollView, View } from "react-native";
import { ActivityGraph } from "./ActivityGraph";
import { ActivityMetricsGrid } from "./ActivityMetricsGrid";
import StepPreviewCard from "./StepPreviewCard";

const ActivityPreviewMode = memo<{ structure: ActivityPlanStructureV3 }>(
  function ActivityPreviewMode({ structure }) {
    // Flatten first 6 steps from intervals for preview
    const previewSteps = [];
    let count = 0;

    for (const segment of structure.segments) {
      if (segment.role !== "activity" || count >= 6) continue;
      for (const interval of segment.intervals) {
        for (const step of interval.steps) {
          if (count >= 6) break;
          previewSteps.push({
            ...step,
            segmentName: segment.name,
            segmentIndex: count,
            originalRepetitionCount: interval.repetitions,
          });
          count++;
        }
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
            {previewSteps.map((step) => (
              <StepPreviewCard key={step.id} step={step} showDuration={true} />
            ))}
          </View>
        </View>
      </ScrollView>
    );
  },
);

ActivityPreviewMode.displayName = "ActivityPreviewMode";

export default ActivityPreviewMode;
