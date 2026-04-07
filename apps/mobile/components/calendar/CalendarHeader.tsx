import { Icon } from "@repo/ui/components/icon";
import { Plus, RotateCcw } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import type { CalendarMode } from "@/lib/calendar/dateMath";
import { CalendarModeSwitcher } from "./CalendarModeSwitcher";

type CalendarHeaderProps = {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  onResetToDayPress: () => void;
  onQuickCreatePress: () => void;
};

export function CalendarHeader({
  mode,
  onModeChange,
  onResetToDayPress,
  onQuickCreatePress,
}: CalendarHeaderProps) {
  return (
    <View className="border-b border-border bg-background px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <CalendarModeSwitcher value={mode} onChange={onModeChange} />
        <View className="flex-row items-center gap-2">
          {mode === "month" ? (
            <TouchableOpacity
              onPress={onResetToDayPress}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
              activeOpacity={0.85}
              testID="calendar-reset-day-button"
            >
              <Icon as={RotateCcw} size={18} className="text-foreground" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onQuickCreatePress}
            className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            activeOpacity={0.85}
            testID="create-event-entry"
          >
            <Icon as={Plus} size={18} className="text-foreground" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
