import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { ACTIVITY_CATEGORY_CONFIG } from "@repo/core";
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
      ACTIVITY_CATEGORY_CONFIG[value as keyof typeof ACTIVITY_CATEGORY_CONFIG];

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
                  {Object.entries(ACTIVITY_CATEGORY_CONFIG).map(
                    ([key, config]) => {
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
                          <Text className="text-2xl">
                            {activityConfig.icon}
                          </Text>
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
                    },
                  )}
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
        {Object.entries(ACTIVITY_CATEGORY_CONFIG).map(([key, config]) => {
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

// ============================================================================
// NEW COMPONENTS FOR SEPARATED LOCATION AND CATEGORY
// ============================================================================

interface ActivityCategorySelectorProps {
  value: string;
  onChange: (category: string) => void;
  compact?: boolean;
}

export const ActivityCategorySelector = memo<ActivityCategorySelectorProps>(
  function ActivityCategorySelector({
    value,
    onChange,
    compact = false,
  }: ActivityCategorySelectorProps) {
    const [open, setOpen] = useState(false);

    const handleSelect = (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(key);
      setOpen(false);
    };

    const selectedConfig =
      ACTIVITY_CATEGORY_CONFIG[value as keyof typeof ACTIVITY_CATEGORY_CONFIG];

    // Compact icon-only dropdown
    if (compact) {
      return (
        <>
          <Pressable
            onPress={() => setOpen(true)}
            className="w-[60px] h-[48px] border border-border rounded-lg items-center justify-center bg-card active:bg-muted"
          >
            <Text className="text-2xl">{selectedConfig?.icon || "⚡"}</Text>
          </Pressable>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[90%] max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Select Activity Category</DialogTitle>
              </DialogHeader>
              <ScrollView
                className="max-h-[400px]"
                showsVerticalScrollIndicator={false}
              >
                <View className="gap-2 py-2">
                  {Object.entries(ACTIVITY_CATEGORY_CONFIG).map(
                    ([key, config]) => {
                      const isSelected = value === key;

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
                          <Text className="text-2xl">{config.icon}</Text>
                          <Text
                            className={`text-base font-medium ${
                              isSelected ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {config.name}
                          </Text>
                          {isSelected && (
                            <Text className="ml-auto text-primary">✓</Text>
                          )}
                        </Pressable>
                      );
                    },
                  )}
                </View>
              </ScrollView>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    // Horizontal scrollable selector
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-row"
        contentContainerClassName="gap-2 px-4"
      >
        {Object.entries(ACTIVITY_CATEGORY_CONFIG).map(([key, config]) => {
          const isSelected = value === key;

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
                {config.icon} {config.name}
              </Text>
            </Button>
          );
        })}
      </ScrollView>
    );
  },
);

ActivityCategorySelector.displayName = "ActivityCategorySelector";

interface ActivityLocationSelectorProps {
  value: string;
  onChange: (location: string) => void;
}

export const ActivityLocationSelector = memo<ActivityLocationSelectorProps>(
  function ActivityLocationSelector({
    value,
    onChange,
  }: ActivityLocationSelectorProps) {
    const handleSelect = (location: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(location);
    };

    return (
      <View className="flex-row gap-2">
        {Object.entries(ACTIVITY_LOCATIONS).map(([key, config]) => {
          const isSelected = value === key;

          return (
            <Pressable
              key={key}
              onPress={() => handleSelect(key)}
              className={`flex-1 flex-row items-center justify-center gap-2 p-3 rounded-lg border ${
                isSelected
                  ? "bg-primary/10 border-primary"
                  : "bg-card border-border active:bg-muted"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  isSelected ? "text-primary" : "text-foreground"
                }`}
              >
                {key === "outdoor" ? "🌳" : "🏠"} {config.name}
              </Text>
              {isSelected && <Text className="text-primary text-xs">✓</Text>}
            </Pressable>
          );
        })}
      </View>
    );
  },
);

ActivityLocationSelector.displayName = "ActivityLocationSelector";
