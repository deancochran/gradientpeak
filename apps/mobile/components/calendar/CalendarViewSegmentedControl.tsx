import { Text } from "@repo/ui/components/text";
import React from "react";
import { TouchableOpacity, View } from "react-native";

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
      {VIEW_OPTIONS.map((view) => {
        const isActive = view === value;
        return (
          <TouchableOpacity
            key={view}
            onPress={() => onChange(view)}
            className={`flex-1 py-2 rounded-md items-center ${
              isActive ? "bg-background border border-border" : ""
            }`}
            activeOpacity={0.8}
          >
            <Text
              className={`text-sm font-medium ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
