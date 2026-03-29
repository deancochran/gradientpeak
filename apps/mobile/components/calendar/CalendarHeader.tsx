import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CalendarRange, Ellipsis, Plus } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import type { CalendarMode } from "@/lib/calendar/dateMath";
import { CalendarModeSwitcher } from "./CalendarModeSwitcher";

type CalendarHeaderProps = {
  mode: CalendarMode;
  title: string;
  subtitle: string | null;
  onModeChange: (mode: CalendarMode) => void;
  onTodayPress: () => void;
  onActionsPress: () => void;
  onQuickCreatePress: () => void;
};

export function CalendarHeader({
  mode,
  title,
  subtitle,
  onModeChange,
  onTodayPress,
  onActionsPress,
  onQuickCreatePress,
}: CalendarHeaderProps) {
  return (
    <View className="border-b border-border bg-background px-4 pb-4 pt-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-xl font-semibold text-foreground">{title}</Text>
          {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={onTodayPress}
            className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            activeOpacity={0.85}
            testID="calendar-today-button"
          >
            <Icon as={CalendarRange} size={18} className="text-foreground" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onQuickCreatePress}
            className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            activeOpacity={0.85}
            testID="create-event-entry"
          >
            <Icon as={Plus} size={18} className="text-foreground" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onActionsPress}
            className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            activeOpacity={0.85}
            testID="calendar-actions-entry"
          >
            <Icon as={Ellipsis} size={18} className="text-foreground" />
          </TouchableOpacity>
        </View>
      </View>

      <View className="mt-4 flex-row items-center justify-between gap-3">
        <CalendarModeSwitcher value={mode} onChange={onModeChange} />
        <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {mode === "day" ? "Day view" : "Month view"}
        </Text>
      </View>
    </View>
  );
}
