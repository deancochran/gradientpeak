import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { DateInput } from "@repo/ui/components/date-input";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { Pressable, View } from "react-native";
import type { EventRecurrenceFrequency } from "../EventEditorCard";

const recurrenceOptions: Array<[EventRecurrenceFrequency, string]> = [
  ["none", "Never"],
  ["daily", "Every day"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
];

export function RepeatStep({
  errorMessage,
  onBack,
  onChangeEndDate,
  onChangeFrequency,
  recurrenceEndDate,
  recurrenceFrequency,
  testIDPrefix,
}: {
  errorMessage?: string | null;
  onBack: () => void;
  onChangeEndDate: (value: string | null) => void;
  onChangeFrequency: (value: EventRecurrenceFrequency) => void;
  recurrenceEndDate: string | null;
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
            <DateInput
              accessibilityHint="Choose when this series should end"
              id={`${testIDPrefix}-recurrence-end-date`}
              label="Repeat until"
              minimumDate={new Date()}
              onChange={(value) => onChangeEndDate(value ?? null)}
              pickerPresentation="modal"
              testId={`${testIDPrefix}-recurrence-end-date-button`}
              value={recurrenceEndDate ?? ""}
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
