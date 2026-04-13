import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Plus } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

type CalendarHeaderProps = {
  contextLabel: string;
  onTodayPress: () => void;
  onQuickCreatePress: () => void;
};

export function CalendarHeader({ contextLabel, onTodayPress, onQuickCreatePress }: CalendarHeaderProps) {
  return (
    <View className="border-b border-border bg-background px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{contextLabel}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">Month view with a selected-day agenda</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={onTodayPress}
            className="rounded-full border border-border bg-card px-4 py-2"
            activeOpacity={0.85}
            testID="calendar-today-button"
          >
            <Text className="text-sm font-medium text-foreground">Today</Text>
          </TouchableOpacity>
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
