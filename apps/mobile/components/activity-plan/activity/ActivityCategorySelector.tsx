import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import * as Haptics from "expo-haptics";
import { memo, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, View } from "react-native";
import { ACTIVITY_CATEGORY_CONFIGS, getActivityCategoryConfig } from "@/lib/constants/activities";

interface ActivityCategorySelectorProps {
  value: string;
  onChange: (category: string) => void;
  compact?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
}

export const ActivityCategorySelector = memo<ActivityCategorySelectorProps>(
  function ActivityCategorySelector({
    value,
    onChange,
    compact = false,
    accessibilityLabel,
    accessibilityHint,
    disabled = false,
  }: ActivityCategorySelectorProps) {
    const [open, setOpen] = useState(false);

    const handleSelect = (key: string) => {
      if (disabled) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
        console.warn("Haptic feedback failed:", error);
      });
      onChange(key);
      setOpen(false);
    };

    const selectedConfig = getActivityCategoryConfig(value);

    useEffect(() => {
      if (!open || !compact) return;
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        setOpen(false);
        return true;
      });
      return () => listener?.remove();
    }, [compact, open]);

    // Plan metadata needs a fast local choice, not another fullscreen flow.
    if (compact) {
      return (
        <View className="relative self-end">
          <Pressable
            disabled={disabled}
            accessibilityHint={accessibilityHint}
            accessibilityLabel={accessibilityLabel ?? "Activity category"}
            accessibilityRole="button"
            accessibilityState={{ expanded: open, disabled }}
            accessibilityValue={{ text: selectedConfig?.name ?? "Not set" }}
            onPress={() => {
              if (!disabled) setOpen((current) => !current);
            }}
            className="min-h-12 flex-row items-center gap-2 rounded-full bg-muted px-3 active:bg-muted/70"
          >
            <Icon as={selectedConfig.icon} size={22} className={selectedConfig.color} />
            <Text className="text-sm font-medium">{selectedConfig.name}</Text>
          </Pressable>
          {open ? (
            <View
              accessibilityViewIsModal
              className="absolute right-0 top-14 z-50 w-44 rounded-md border border-border bg-popover p-1 shadow-lg shadow-black/5"
              onAccessibilityEscape={() => setOpen(false)}
              testID="activity-category-selector-menu"
            >
              <Pressable
                accessibilityLabel="Close category menu"
                accessibilityRole="button"
                className="min-h-11 items-end justify-center rounded-sm px-2 py-2 active:bg-accent"
                onPress={() => setOpen(false)}
                testID="activity-category-selector-close"
              >
                <Text className="font-medium">Close</Text>
              </Pressable>
              {Object.entries(ACTIVITY_CATEGORY_CONFIGS).map(([key, config]) => {
                const isSelected = value === key;

                return (
                  <Pressable
                    disabled={disabled}
                    key={key}
                    accessibilityLabel={`Select ${config.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled, selected: isSelected }}
                    onPress={() => handleSelect(key)}
                    testID={`activity-category-option-${key}`}
                    className={`min-h-11 flex-row items-center gap-2 rounded-sm px-2 py-2 active:bg-accent ${
                      isSelected ? "bg-primary/10" : ""
                    }`}
                  >
                    <Icon as={config.icon} size={20} className={config.color} />
                    <Text className={isSelected ? "font-medium text-primary" : "font-medium"}>
                      {config.name}
                    </Text>
                    {isSelected ? <Text className="ml-auto text-primary">✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
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
        {Object.entries(ACTIVITY_CATEGORY_CONFIGS).map(([key, config]) => {
          const isSelected = value === key;

          return (
            <Button
              disabled={disabled}
              key={key}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onPress={() => handleSelect(key)}
              className={`flex-row items-center gap-2 px-4 py-2 rounded-full min-h-0 h-auto ${
                isSelected ? "bg-primary border-primary" : "bg-card border-border"
              }`}
            >
              <Icon
                as={config.icon}
                size={20}
                className={isSelected ? "text-primary-foreground" : config.color}
              />
              <Text
                className={`text-sm font-medium ${
                  isSelected ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {config.name}
              </Text>
            </Button>
          );
        })}
      </ScrollView>
    );
  },
);

ActivityCategorySelector.displayName = "ActivityCategorySelector";
