import { Text } from "@repo/ui/components/text";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import React from "react";
import { View } from "react-native";

export type CalendarViewMode = "month" | "week" | "day";

interface CalendarViewSegmentedControlProps {
  value: CalendarViewMode;
  onChange: (nextValue: CalendarViewMode) => void;
}

const VIEW_OPTIONS: CalendarViewMode[] = ["month", "week", "day"];

export function CalendarViewSegmentedControl({
  value,
  onChange,
}: CalendarViewSegmentedControlProps) {
  return (
    <View className="bg-muted/40 rounded-lg p-1 flex-row mb-3">
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onChange(nextValue as CalendarViewMode);
          }
        }}
        className="w-full"
      >
        {VIEW_OPTIONS.map((view, index) => {
          const isActive = view === value;
          return (
            <ToggleGroupItem
              key={view}
              value={view}
              isFirst={index === 0}
              isLast={index === VIEW_OPTIONS.length - 1}
              className={`flex-1 ${isActive ? "border border-border bg-background" : ""}`}
            >
              <Text
                className={`text-sm font-medium ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </Text>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </View>
  );
}
