import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { FormDateInputField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control, FieldPath } from "react-hook-form";
import { Pressable, View } from "react-native";
import type { EventRecurrenceFrequency } from "../EventEditorCard";

const recurrenceOptions: Array<[EventRecurrenceFrequency, string]> = [
  ["none", "Never"],
  ["daily", "Every day"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
];

type RecurrenceEndDateFormValues = {
  recurrenceEndDate: string | null;
};

export function RepeatStep<TFormValues extends RecurrenceEndDateFormValues>({
  control,
  errorMessage,
  onBack,
  onChangeFrequency,
  recurrenceFrequency,
  testIDPrefix,
}: {
  control: Control<TFormValues>;
  errorMessage?: string | null;
  onBack: () => void;
  onChangeFrequency: (value: EventRecurrenceFrequency) => void;
  recurrenceFrequency: EventRecurrenceFrequency;
  testIDPrefix: string;
}) {
  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Repeat
          </Text>
          <Text className="text-2xl font-semibold text-foreground">Choose recurrence</Text>
          <Text className="text-sm text-muted-foreground">
            Repeating custom events need an end date before they can be created.
          </Text>
        </View>

        <View className="gap-2">
          {recurrenceOptions.map(([value, label]) => {
            const isSelected = recurrenceFrequency === value;
            return (
              <Pressable
                key={value}
                onPress={() => onChangeFrequency(value)}
                className={`rounded-2xl border px-3 py-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                testID={`${testIDPrefix}-recurrence-${value}`}
              >
                <Text
                  className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {recurrenceFrequency !== "none" ? (
          <View className="gap-2">
            <FormDateInputField
              accessibilityHint="Choose when this series should end"
              clearable
              control={control}
              label="Repeat until"
              minimumDate={new Date()}
              name={"recurrenceEndDate" as FieldPath<TFormValues>}
              pickerPresentation="modal"
              testId={`${testIDPrefix}-recurrence-end-date-button`}
            />
            {errorMessage ? <Text className="text-xs text-destructive">{errorMessage}</Text> : null}
          </View>
        ) : null}

        <Button onPress={onBack} testID={`${testIDPrefix}-repeat-done-button`}>
          <Text className="text-primary-foreground">Done</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
