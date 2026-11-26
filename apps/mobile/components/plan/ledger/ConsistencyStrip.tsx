import { Text } from "@repo/ui/components/text";
import { Pressable, View } from "react-native";
import { useTheme } from "@/lib/stores/theme-store";
import { getPlanChartTheme } from "../training-path/planChartTheme";
import type { LedgerDayPresentation } from "./planningLedgerPresentation";

export function ConsistencyStrip({
  days,
  onSelectDate,
  selectedDate,
}: {
  days: LedgerDayPresentation[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const colors = getPlanChartTheme(resolvedTheme);
  return (
    <View className="gap-1.5" testID="planning-ledger-consistency-strip">
      <Text className="text-xs font-medium text-muted-foreground">Seven-day consistency</Text>
      <View className="flex-row gap-1">
        {days.map((day) => {
          const selected = day.date === selectedDate;
          const hasCompletedLoad = day.completed !== null && day.completed > 0;
          const hasPlannedLoad = day.planned !== null && day.planned > 0;
          return (
            <Pressable
              accessibilityLabel={day.accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="min-h-11 flex-1 items-center justify-center gap-0.5 rounded-lg border"
              key={day.date}
              onPress={() => onSelectDate(day.date)}
              style={{
                backgroundColor: selected ? colors.selected : colors.muted,
                borderColor: hasPlannedLoad ? colors.planned : colors.border,
                borderWidth: selected ? 2 : 1,
              }}
              testID={`planning-ledger-day-${day.date}`}
            >
              {hasCompletedLoad ? (
                <View
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: colors.completed }}
                />
              ) : null}
              <Text className="text-xs font-semibold text-foreground">{day.shortDayLabel}</Text>
              <Text className="text-[10px] text-muted-foreground">{day.shortDateLabel}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
