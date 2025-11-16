import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { ACTIVITY_TYPE_CONFIG } from "@repo/core";
import * as Haptics from "expo-haptics";
import { memo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

interface ActivityTypeSelectorProps {
  value: string;
  onChange: (activityType: string) => void;
  compact?: boolean;
}

export const ActivityTypeSelector = memo<ActivityTypeSelectorProps>(
  function ActivityTypeSelector({
    value,
    onChange,
    compact = false,
  }: ActivityTypeSelectorProps) {
    const [open, setOpen] = useState(false);

    const handleSelect = (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(key);
      setOpen(false);
    };

    const selectedConfig =
      ACTIVITY_TYPE_CONFIG[value as keyof typeof ACTIVITY_TYPE_CONFIG];

    // Compact icon-only dropdown
    if (compact) {
      return (
        <>
          <Pressable
            onPress={() => setOpen(true)}
            className="w-[60px] h-[48px] border border-border rounded-lg items-center justify-center bg-card active:bg-muted"
          >
            <Text className="text-2xl">{selectedConfig?.icon || "🏃"}</Text>
          </Pressable>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[90%] max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Select Activity Type</DialogTitle>
              </DialogHeader>
              <ScrollView
                className="max-h-[400px]"
                showsVerticalScrollIndicator={false}
              >
                <View className="gap-2 py-2">
                  {Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, config]) => {
                    const isSelected = value === key;
                    const activityConfig = config as any;

                    return (
                      <Pressable
                        key={key}
                        onPress={() => handleSelect(key)}
                        className={`flex-row items-center gap-3 p-3 rounded-lg border ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-border active:bg-muted"
                        }`}
                      >
                        <Text className="text-2xl">{activityConfig.icon}</Text>
                        <Text
                          className={`text-base font-medium ${
                            isSelected ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {activityConfig.shortName || activityConfig.name}
                        </Text>
                        {isSelected && (
                          <Text className="ml-auto text-primary">✓</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    // Original horizontal scrollable selector
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
