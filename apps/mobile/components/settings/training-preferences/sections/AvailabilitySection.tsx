import type { TrainingPreferenceField } from "@repo/core";
import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import { FormIntegerStepperField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control } from "react-hook-form";
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

function formatMinuteOfDay(minuteOfDay: number | null | undefined) {
  if (typeof minuteOfDay !== "number" || !Number.isFinite(minuteOfDay)) return "--:--";
  const boundedMinute = Math.max(0, Math.min(1440, Math.round(minuteOfDay)));
  const hours = Math.floor(boundedMinute / 60);
  const minutes = boundedMinute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type GlobalAvailabilitySectionProps = {
  mode?: "global-edit";
  availability: AthleteTrainingSettingsFormInput["availability"];
  control: Control<AthleteTrainingSettingsFormInput>;
  onToggleAvailabilityDay: (day: WeekdayKey) => void;
  onToggleHardRestDay: (day: WeekdayKey) => void;
};

type PlanLocalAvailabilitySectionProps = {
  fields: TrainingPreferenceField[];
  mode: "plan-local-readonly";
};

type AvailabilitySectionProps = GlobalAvailabilitySectionProps | PlanLocalAvailabilitySectionProps;

export function AvailabilitySection(props: AvailabilitySectionProps) {
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

  const { availability, control, onToggleAvailabilityDay, onToggleHardRestDay } = props;

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
            const firstWindow = windowConfig?.windows?.[0];
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
                      {formatMinuteOfDay(firstWindow?.start_minute_of_day)}–
                      {formatMinuteOfDay(firstWindow?.end_minute_of_day)} · max{" "}
                      {windowConfig?.max_sessions ?? 0} session
                      {(windowConfig?.max_sessions ?? 0) === 1 ? "" : "s"}
                    </Text>
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <FormIntegerStepperField
                          control={control}
                          label="Start minute"
                          max={1439}
                          min={0}
                          name={`availability.weekly_windows.${windowIndex}.windows.0.start_minute_of_day`}
                          testId={`preferences-availability-window-${day.key}-start`}
                        />
                      </View>
                      <View className="flex-1">
                        <FormIntegerStepperField
                          control={control}
                          label="End minute"
                          max={1440}
                          min={1}
                          name={`availability.weekly_windows.${windowIndex}.windows.0.end_minute_of_day`}
                          testId={`preferences-availability-window-${day.key}-end`}
                        />
                      </View>
                    </View>
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
