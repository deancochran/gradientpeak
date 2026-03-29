import { Text } from "@repo/ui/components/text";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import type { CalendarMode } from "@/lib/calendar/dateMath";

const MODE_OPTIONS: CalendarMode[] = ["day", "month"];

type CalendarModeSwitcherProps = {
  value: CalendarMode;
  onChange: (mode: CalendarMode) => void;
};

export function CalendarModeSwitcher({ value, onChange }: CalendarModeSwitcherProps) {
  return (
    <View
      className="flex-row rounded-full border border-border bg-card p-1"
      testID="calendar-mode-switcher"
    >
      {MODE_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <TouchableOpacity
            key={option}
            onPress={() => onChange(option)}
            className={`rounded-full px-4 py-2 ${active ? "bg-background" : "bg-transparent"}`}
            activeOpacity={0.85}
            testID={`calendar-mode-${option}`}
          >
            <Text
              className={`text-xs font-semibold uppercase tracking-wide ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
