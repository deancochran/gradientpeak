import {
  formatMinuteOfDaySummary,
  minuteOfDayToTimeInput,
  type TrainingPreferenceField,
  timeInputToMinuteOfDay,
} from "@repo/core";
import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import { FormField, FormIntegerStepperField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { TimeInput } from "@repo/ui/components/time-input";
import { useEffect, useState } from "react";
import type { Control, FieldPath } from "react-hook-form";
import { View } from "react-native";
import { ReadOnlyTrainingPreferenceField } from "@/components/settings/training-preferences/TrainingPreferenceFieldRenderer";

export const weekdayOptions = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

export type WeekdayKey = (typeof weekdayOptions)[number]["key"];

const maxWindowsPerDay = 4;

export function getAvailabilityWindowValidation(
  availability: AthleteTrainingSettingsFormInput["availability"],
) {
  const errors = new Map<string, string>();

  for (const dayConfig of availability.weekly_windows ?? []) {
    const chronologicalWindows = (dayConfig.windows ?? [])
      .map((window, index) => ({ index, window }))
      .sort(
        (left, right) =>
          left.window.start_minute_of_day - right.window.start_minute_of_day ||
          left.window.end_minute_of_day - right.window.end_minute_of_day,
      );
    let latestPriorEnd = 0;
    for (const [chronologicalIndex, { index, window }] of chronologicalWindows.entries()) {
      const key = `${dayConfig.day}:${index}`;
      if (window.end_minute_of_day <= window.start_minute_of_day) {
        errors.set(key, "End time must be after start time. Overnight windows aren't supported.");
      } else if (chronologicalIndex > 0 && window.start_minute_of_day < latestPriorEnd) {
        errors.set(
          key,
          "Start this window at or after the previous window ends. Adjacent windows are allowed.",
        );
      }
      latestPriorEnd = Math.max(latestPriorEnd, window.end_minute_of_day);
    }
  }

  return errors;
}

function MinuteOfDayTimeField({
  context,
  control,
  error,
  label,
  name,
  testId,
}: {
  context: "start" | "end";
  control: Control<AthleteTrainingSettingsFormInput>;
  error?: string;
  label: string;
  name: FieldPath<AthleteTrainingSettingsFormInput>;
  testId: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TimeInput
          clearable={false}
          error={error ?? fieldState.error?.message}
          helperText={context === "end" ? "Choosing midnight means end of day (24:00)." : undefined}
          is24Hour
          label={label}
          onChange={(nextValue) => {
            if (typeof nextValue !== "string") return;
            field.onChange(timeInputToMinuteOfDay(nextValue, context));
          }}
          pickerPresentation="modal"
          required
          testId={testId}
          value={minuteOfDayToTimeInput(field.value as number, context)}
        />
      )}
    />
  );
}

type GlobalAvailabilitySectionProps = {
  mode?: "global-edit";
  availability: AthleteTrainingSettingsFormInput["availability"];
  control: Control<AthleteTrainingSettingsFormInput>;
  onAddAvailabilityWindow: (day: WeekdayKey) => string | null;
  onRemoveAvailabilityWindow: (day: WeekdayKey, windowIndex: number) => void;
  onToggleAvailabilityDay: (day: WeekdayKey) => void;
  onToggleHardRestDay: (day: WeekdayKey) => void;
};

type PlanLocalAvailabilitySectionProps = {
  fields: TrainingPreferenceField[];
  mode: "plan-local-readonly";
};

type AvailabilitySectionProps = GlobalAvailabilitySectionProps | PlanLocalAvailabilitySectionProps;

export function AvailabilitySection(props: AvailabilitySectionProps) {
  const [windowFeedback, setWindowFeedback] = useState<Partial<Record<WeekdayKey, string>>>({});
  const editableAvailability = props.mode === "plan-local-readonly" ? null : props.availability;

  useEffect(() => {
    if (editableAvailability) setWindowFeedback({});
  }, [editableAvailability]);

  if (props.mode === "plan-local-readonly") {
    return (
      <View className="gap-3 rounded-2xl border border-border bg-card p-3">
        {props.fields.map((field) => (
          <ReadOnlyTrainingPreferenceField
            key={field.id}
            field={field}
            disabledReason={
              field.planLocalSupport === "derived"
                ? "Derived from plan-specific preferences."
                : "Profile-level preference."
            }
          />
        ))}
      </View>
    );
  }

  const {
    availability,
    control,
    onAddAvailabilityWindow,
    onRemoveAvailabilityWindow,
    onToggleAvailabilityDay,
    onToggleHardRestDay,
  } = props;
  const windowValidation = getAvailabilityWindowValidation(availability);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-3">
      <View className="gap-1">
        <Text className="text-sm font-semibold text-foreground">Hard rest days</Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          Pick days the planner should protect from training when possible.
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2" testID="preferences-hard-rest-days">
        {weekdayOptions.map((day) => {
          const selected = (availability.hard_rest_days ?? []).includes(day.key);
          return (
            <Button
              key={day.key}
              accessibilityLabel={`${selected ? "Remove" : "Add"} ${day.label} hard rest day`}
              onPress={() => onToggleHardRestDay(day.key)}
              size="sm"
              testID={`preferences-hard-rest-day-${day.key}`}
              variant={selected ? "default" : "outline"}
            >
              <Text>{day.label}</Text>
            </Button>
          );
        })}
      </View>
      <View className="mt-2 gap-3 border-t border-border pt-3">
        <View className="gap-1">
          <Text className="text-sm font-semibold text-foreground">Weekly availability windows</Text>
          <Text className="text-xs leading-4 text-muted-foreground">
            Enable the days and time range the planner can use for training.
          </Text>
        </View>
        <View className="gap-3" testID="preferences-weekly-windows">
          {weekdayOptions.map((day) => {
            const weeklyWindows = availability.weekly_windows ?? [];
            const windowIndex = weeklyWindows.findIndex((item) => item.day === day.key);
            const enabled = windowIndex >= 0;
            const windowConfig = enabled ? weeklyWindows[windowIndex] : null;
            const windows = windowConfig?.windows ?? [];
            return (
              <View
                key={day.key}
                className="gap-2 rounded-xl border border-border bg-background px-3 py-2"
                testID={`preferences-availability-day-${day.key}`}
              >
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm font-medium text-foreground">{day.label}</Text>
                  <Button
                    accessibilityLabel={`${enabled ? "Disable" : "Enable"} ${day.label} availability`}
                    onPress={() => onToggleAvailabilityDay(day.key)}
                    size="sm"
                    testID={`preferences-availability-toggle-${day.key}`}
                    variant={enabled ? "default" : "outline"}
                  >
                    <Text>{enabled ? "Available" : "Unavailable"}</Text>
                  </Button>
                </View>
                {enabled ? (
                  <View className="gap-2">
                    <Text className="text-xs leading-4 text-muted-foreground">
                      {windows.length} availability {windows.length === 1 ? "window" : "windows"} ·
                      max {windowConfig?.max_sessions ?? 0} session
                      {(windowConfig?.max_sessions ?? 0) === 1 ? "" : "s"}
                    </Text>
                    {windows.map((window, timeWindowIndex) => {
                      const windowError = windowValidation.get(`${day.key}:${timeWindowIndex}`);
                      const pathPrefix =
                        `availability.weekly_windows.${windowIndex}.windows.${timeWindowIndex}` as const;
                      return (
                        <View
                          className="gap-2 rounded-lg border border-border p-2"
                          // biome-ignore lint/suspicious/noArrayIndexKey: persisted windows have no stable identifier.
                          key={`${day.key}-${timeWindowIndex}`}
                          testID={`preferences-availability-window-${day.key}-${timeWindowIndex}`}
                        >
                          <View className="flex-row items-center justify-between gap-2">
                            <Text className="text-xs font-medium text-foreground">
                              Window {timeWindowIndex + 1}:{" "}
                              {formatMinuteOfDaySummary(window.start_minute_of_day, "start")}–
                              {formatMinuteOfDaySummary(window.end_minute_of_day, "end")}
                              {window.end_minute_of_day === 1440 ? " (end of day)" : ""}
                            </Text>
                            <Button
                              accessibilityLabel={`Remove ${day.label} window ${timeWindowIndex + 1}`}
                              onPress={() => onRemoveAvailabilityWindow(day.key, timeWindowIndex)}
                              size="sm"
                              testID={`preferences-availability-window-${day.key}-${timeWindowIndex}-remove`}
                              variant="ghost"
                            >
                              <Text>Remove</Text>
                            </Button>
                          </View>
                          <View className="flex-row gap-2">
                            <View className="flex-1">
                              <MinuteOfDayTimeField
                                context="start"
                                control={control}
                                error={windowError}
                                label="Start time"
                                name={`${pathPrefix}.start_minute_of_day`}
                                testId={`preferences-availability-window-${day.key}-${timeWindowIndex}-start`}
                              />
                            </View>
                            <View className="flex-1">
                              <MinuteOfDayTimeField
                                context="end"
                                control={control}
                                error={windowError}
                                label="End time"
                                name={`${pathPrefix}.end_minute_of_day`}
                                testId={`preferences-availability-window-${day.key}-${timeWindowIndex}-end`}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <Button
                      disabled={windows.length >= maxWindowsPerDay}
                      onPress={() => {
                        const feedback = onAddAvailabilityWindow(day.key);
                        setWindowFeedback((current) => ({
                          ...current,
                          [day.key]: feedback ?? undefined,
                        }));
                      }}
                      size="sm"
                      testID={`preferences-availability-window-${day.key}-add`}
                      variant="outline"
                    >
                      <Text>Add window</Text>
                    </Button>
                    {windows.length >= maxWindowsPerDay ? (
                      <Text className="text-xs text-muted-foreground">
                        Maximum 4 windows per day.
                      </Text>
                    ) : null}
                    {windowFeedback[day.key] ? (
                      <Text className="text-xs font-medium text-destructive">
                        {windowFeedback[day.key]}
                      </Text>
                    ) : null}
                    <FormIntegerStepperField
                      control={control}
                      label="Max sessions"
                      max={3}
                      min={0}
                      name={`availability.weekly_windows.${windowIndex}.max_sessions`}
                      testId={`preferences-availability-max-sessions-${day.key}`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
