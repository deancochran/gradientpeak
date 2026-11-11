import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";

export function PlanInsightControls<Range extends string>({
  anchorLabel,
  canGoNext = true,
  canGoPrevious = true,
  onAnalyze,
  onGoNext,
  onGoPrevious,
  onRangeChange,
  onToday,
  ranges,
  selectedRange,
  testID,
}: {
  anchorLabel: string;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  onAnalyze?: () => void;
  onGoNext: () => void;
  onGoPrevious: () => void;
  onRangeChange: (range: Range) => void;
  onToday: () => void;
  ranges: ReadonlyArray<{ label: string; value: Range }>;
  selectedRange: Range;
  testID: string;
}) {
  return (
    <View className="gap-2" testID={testID}>
      <View className="flex-row rounded-xl bg-muted/30 p-1">
        {ranges.map((range) => {
          const selected = range.value === selectedRange;
          return (
            <TouchableOpacity
              accessibilityLabel={`Show ${range.label} range`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`min-h-11 flex-1 items-center justify-center rounded-lg px-2 ${
                selected ? "bg-card" : ""
              }`}
              key={range.value}
              onPress={() => onRangeChange(range.value)}
              testID={`${testID}-range-${range.value}`}
            >
              <Text
                className={`text-xs font-semibold ${
                  selected ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {range.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <TouchableOpacity
          accessibilityLabel="Show previous period"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoPrevious }}
          className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border px-3"
          disabled={!canGoPrevious}
          onPress={onGoPrevious}
          testID={`${testID}-previous`}
        >
          <Text className="font-semibold text-foreground">Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Show next period"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoNext }}
          className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border px-3"
          disabled={!canGoNext}
          onPress={onGoNext}
          testID={`${testID}-next`}
        >
          <Text className="font-semibold text-foreground">Next</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Return analysis to today"
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
          onPress={onToday}
          testID={`${testID}-today`}
        >
          <Text className="font-semibold text-foreground">Today</Text>
        </TouchableOpacity>
        {onAnalyze ? (
          <TouchableOpacity
            accessibilityLabel="Open configurable plan analysis"
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl bg-primary px-4"
            onPress={onAnalyze}
            testID={`${testID}-analyze`}
          >
            <Text className="font-semibold text-primary-foreground">Analyze</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text className="text-xs text-muted-foreground" testID={`${testID}-anchor`}>
        {anchorLabel}
      </Text>
    </View>
  );
}
