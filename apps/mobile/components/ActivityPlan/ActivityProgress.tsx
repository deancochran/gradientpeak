// ================================
// Activity Progress Graph (Mini version)
// ================================

import { memo } from "react";
import { View } from "react-native";
import {
  type ActivityPlanStructureV2,
  extractActivityProfileV2,
} from "@repo/core";

interface ActivityProgressGraphProps {
  structure: ActivityPlanStructureV2;
  currentStep: number;
  className?: string;
}

export const ActivityProgressGraph = memo<ActivityProgressGraphProps>(
  function ActivityProgressGraph({
    structure,
    currentStep,
    className = "h-12",
  }: ActivityProgressGraphProps) {
    const profileData = extractActivityProfileV2(structure);

    return (
      <View className={`bg-muted/20 rounded-md p-1 ${className}`}>
        <View className="flex-1 flex-row items-end">
          {profileData.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            let opacity = 0.3;
            if (isCompleted) opacity = 0.8;
            if (isCurrent) opacity = 1;

            return (
              <View
                key={index}
                className="flex-1 mx-0.5 rounded-sm"
                style={{
                  backgroundColor: step.color,
                  opacity,
                  height: isCurrent ? "100%" : "70%",
                }}
              />
            );
          })}
        </View>
      </View>
    );
  },
);

ActivityProgressGraph.displayName = "ActivityProgressGraph";
