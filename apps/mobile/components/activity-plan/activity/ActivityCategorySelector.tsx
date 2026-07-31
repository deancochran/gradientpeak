import { ACTIVITY_CATEGORY_CONFIG } from "@repo/core/constants/activity";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import * as Haptics from "expo-haptics";
import { memo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppSelectionModal } from "@/components/shared/AppSelectionModal";

interface ActivityCategorySelectorProps {
  value: string;
  onChange: (category: string) => void;
  compact?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const ActivityCategorySelector = memo<ActivityCategorySelectorProps>(
  function ActivityCategorySelector({
    value,
    onChange,
    compact = false,
    accessibilityLabel,
    accessibilityHint,
  }: ActivityCategorySelectorProps) {
    const [open, setOpen] = useState(false);

    const handleSelect = (key: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
        console.warn("Haptic feedback failed:", error);
      });
      onChange(key);
      setOpen(false);
    };

    const selectedConfig = value
      ? ACTIVITY_CATEGORY_CONFIG[value as keyof typeof ACTIVITY_CATEGORY_CONFIG]
      : undefined;

    // Compact icon-only dropdown
    if (compact) {
      return (
        <>
          <Pressable
            accessibilityHint={accessibilityHint}
            accessibilityLabel={accessibilityLabel ?? "Activity category"}
            accessibilityRole="button"
            onPress={() => setOpen(true)}
            className="w-[60px] h-[48px] border border-border rounded-lg items-center justify-center bg-card active:bg-muted"
          >
            <Text className="text-2xl">{selectedConfig?.icon || "⚡"}</Text>
          </Pressable>

          {open ? (
            <AppSelectionModal
              description="Choose the activity category for this activity."
              onClose={() => setOpen(false)}
              testID="activity-category-selector-modal"
              title="Select Activity Category"
            >
              <ScrollView className="max-h-[400px]" showsVerticalScrollIndicator={false}>
                <View className="gap-2 py-2">
                  {Object.entries(ACTIVITY_CATEGORY_CONFIG).map(([key, config]) => {
                    const isSelected = value === key;

                    return (
                      <Pressable
                        key={key}
                        onPress={() => handleSelect(key)}
                        className={`flex-row items-center gap-3 rounded-lg border p-3 ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card active:bg-muted"
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
                        {isSelected ? <Text className="ml-auto text-primary">✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </AppSelectionModal>
          ) : null}
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
                isSelected ? "bg-primary border-primary" : "bg-card border-border"
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
