// ================================
// Activity Preview Mode
// ================================

import { memo } from "react";
import { ScrollView, View } from "react-native";
import {
  type ActivityPlanStructureV2,
  extractActivityProfileV2,
} from "@repo/core";
import { ActivityGraph } from "./ActivityGraph";
import { ActivityMetricsGrid } from "./ActivityMetricsGrid";
import { StepBreakdown } from "./StepBreakdown";

const ActivityPreviewMode = memo<{ structure: ActivityPlanStructureV2 }>(
  function ActivityPreviewMode({ structure }) {
    const profileData = extractActivityProfileV2(structure);

    return (
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Activity Graph */}
        <View className="mb-6">
          <ActivityGraph structure={structure} />
        </View>

        {/* Key Activity Metrics */}
        <ActivityMetricsGrid structure={structure} />

        {/* Step Breakdown Preview */}
        <StepBreakdown
          steps={profileData.slice(0, 6)}
          maxSteps={6}
          showAll={false}
          title="Activity Steps"
        />
      </ScrollView>
    );
  },
);

ActivityPreviewMode.displayName = "ActivityPreviewMode";

export default ActivityPreviewMode;
