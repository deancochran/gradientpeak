import {
  WEEKLY_RECURRENCE_MAX_OCCURRENCES,
  WEEKLY_RECURRENCE_MIN_OCCURRENCES,
} from "@repo/core/recurrence";
import { View } from "react-native";
import { Button } from "../button/index.native";
import { Switch } from "../switch/index.native";
import { Text } from "../text/index.native";
import { getRecurrenceFieldTestIds, type RecurrenceFieldsProps } from "./shared";

function RecurrenceFields({
  disabled = false,
  error,
  onChange,
  testIdPrefix,
  value,
}: RecurrenceFieldsProps) {
  const testIds = getRecurrenceFieldTestIds(testIdPrefix);
  const explanation = "Repeats weekly on the selected day.";

  const changeCount = (nextCount: number) => {
    onChange({
      ...value,
      occurrenceCount: Math.min(
        WEEKLY_RECURRENCE_MAX_OCCURRENCES,
        Math.max(WEEKLY_RECURRENCE_MIN_OCCURRENCES, nextCount),
      ),
    });
  };

  return (
    <View className="gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-sm font-medium text-foreground">Repeat weekly</Text>
          <Text className="text-xs text-muted-foreground">{explanation}</Text>
        </View>
        <Switch
          accessibilityLabel="Repeat weekly"
          accessibilityHint={error ? `${explanation} Error: ${error}` : explanation}
          accessibilityState={{ disabled }}
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          testId={testIds.toggle}
        />
      </View>

      {value.enabled ? (
        <View className="gap-2 border-t border-border pt-3">
          <Text
            accessibilityLabel={`Ends after ${value.occurrenceCount} occurrences`}
            className="text-xs font-medium text-muted-foreground"
            testID={testIds.count}
          >
            Ends after {value.occurrenceCount} occurrences
          </Text>
          <View className="flex-row gap-2">
            <Button
              accessibilityLabel="Decrease occurrence count"
              disabled={disabled || value.occurrenceCount <= WEEKLY_RECURRENCE_MIN_OCCURRENCES}
              onPress={() => changeCount(value.occurrenceCount - 1)}
              size="sm"
              testId={testIds.decrement}
              variant="outline"
            >
              <Text>-</Text>
            </Button>
            <Button
              accessibilityLabel="Increase occurrence count"
              disabled={disabled || value.occurrenceCount >= WEEKLY_RECURRENCE_MAX_OCCURRENCES}
              onPress={() => changeCount(value.occurrenceCount + 1)}
              size="sm"
              testId={testIds.increment}
              variant="outline"
            >
              <Text>+</Text>
            </Button>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive" testID={testIds.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export type { RecurrenceFieldsProps } from "./shared";
export { RecurrenceFields };
