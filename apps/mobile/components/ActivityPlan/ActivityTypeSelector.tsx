import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ACTIVITY_TYPE_CONFIG } from "@repo/core";
import * as Haptics from "expo-haptics";
import { memo } from "react";
import { ScrollView } from "react-native";

interface ActivityTypeSelectorProps {
  value: string;
  onChange: (activityType: string) => void;
}

export const ActivityTypeSelector = memo<ActivityTypeSelectorProps>(
  function ActivityTypeSelector({
    value,
    onChange,
  }: ActivityTypeSelectorProps) {
    const handleSelect = (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(key);
    };

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-row"
        contentContainerClassName="gap-2 px-4"
      >
        {Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, config]) => {
          const isSelected = value === key;
          const activityConfig = config as any;

          return (
            <Button
              key={key}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onPress={() => handleSelect(key)}
              className={`flex-row items-center gap-2 px-4 py-2 rounded-full min-h-0 h-auto ${
                isSelected
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  isSelected ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {activityConfig.icon}{" "}
                {activityConfig.shortName || activityConfig.name}
              </Text>
            </Button>
          );
        })}
      </ScrollView>
    );
  },
);

ActivityTypeSelector.displayName = "ActivityTypeSelector";
