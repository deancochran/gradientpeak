// ================================
// Active Activity Mode
// ================================

import { memo } from "react";
import { ScrollView, View } from "react-native";
import { Activity } from "lucide-react-native";
import {
  type ActivityPlanStructureV2,
  extractActivityProfileV2,
} from "@repo/core";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";

type CurrentMetrics = {
  power?: number;
  heartRate?: number;
  cadence?: number;
  speed?: number;
};

const ActiveActivityMode = memo<{
  planProgress?: any;
  activityPlan?: any;
  currentMetrics: CurrentMetrics;
  onNextStep?: () => void;
  isAdvancing: boolean;
  structure: ActivityPlanStructureV2;
}>(function ActiveActivityMode({
  planProgress,
  activityPlan,
  currentMetrics,
  onNextStep,
  isAdvancing,
  structure,
}) {
  if (!planProgress) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="items-center">
          <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center mb-4">
            <Icon as={Activity} size={32} className="text-muted-foreground" />
          </View>
          <Text className="text-lg font-medium text-center mb-2">
            Start recording to begin
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Press Start Activity to activate your plan
          </Text>
        </View>
      </View>
    );
  }

  const profileData = extractActivityProfileV2(structure);
  const upcomingSteps = profileData.slice(
    planProgress.currentStepIndex + 1,
    planProgress.currentStepIndex + 4,
  );

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
    ></ScrollView>
  );
});

ActiveActivityMode.displayName = "ActiveActivityMode";

export default ActiveActivityMode;
