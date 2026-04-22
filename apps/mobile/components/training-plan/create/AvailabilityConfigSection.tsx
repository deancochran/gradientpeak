import type { CreationAvailabilityConfig, CreationProvenance } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import React, { useEffect, useMemo, useRef } from "react";
import { Controller, useWatch } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";

const availabilityConfigSectionSchema = z.object({
  planStartDate: z.string().optional(),
  monday: z.boolean(),
  tuesday: z.boolean(),
  wednesday: z.boolean(),
  thursday: z.boolean(),
  friday: z.boolean(),
  saturday: z.boolean(),
  sunday: z.boolean(),
});

const weekDays: CreationAvailabilityConfig["days"][number]["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const defaultWindow = {
  start_minute_of_day: 360,
  end_minute_of_day: 450,
};

const getWeekDayLabel = (day: string) => day.slice(0, 1).toUpperCase() + day.slice(1, 3);

const normalizePlanStartDate = (value?: string) => (value && value.length > 0 ? value : undefined);

export interface AvailabilityConfigSectionValues {
  planStartDate?: string;
  availabilityConfig: CreationAvailabilityConfig;
  availabilityProvenance: CreationProvenance;
}

interface AvailabilityConfigSectionFormValues {
  planStartDate?: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

interface AvailabilityConfigSectionProps {
  planStartDate?: string;
  availabilityConfig: CreationAvailabilityConfig;
  availabilityProvenance: CreationProvenance;
  onChange: (values: AvailabilityConfigSectionValues) => void;
  onReset?: () => void;
  planStartDateError?: string;
}

const areValuesEqual = (
  left: AvailabilityConfigSectionFormValues,
  right: AvailabilityConfigSectionFormValues,
) =>
  normalizePlanStartDate(left.planStartDate) === normalizePlanStartDate(right.planStartDate) &&
  left.monday === right.monday &&
  left.tuesday === right.tuesday &&
  left.wednesday === right.wednesday &&
  left.thursday === right.thursday &&
  left.friday === right.friday &&
  left.saturday === right.saturday &&
  left.sunday === right.sunday;

const toDefaultValues = ({
  planStartDate,
  availabilityConfig,
}: Pick<
  AvailabilityConfigSectionProps,
  "planStartDate" | "availabilityConfig"
>): AvailabilityConfigSectionFormValues => {
  const isAvailable = (day: CreationAvailabilityConfig["days"][number]["day"]) =>
    (availabilityConfig.days.find((item) => item.day === day)?.windows.length ?? 0) > 0;

  return {
    planStartDate: normalizePlanStartDate(planStartDate),
    monday: isAvailable("monday"),
    tuesday: isAvailable("tuesday"),
    wednesday: isAvailable("wednesday"),
    thursday: isAvailable("thursday"),
    friday: isAvailable("friday"),
    saturday: isAvailable("saturday"),
    sunday: isAvailable("sunday"),
  };
};

export function AvailabilityConfigSection({
  planStartDate,
  availabilityConfig,
  availabilityProvenance,
  onChange,
  onReset,
  planStartDateError,
}: AvailabilityConfigSectionProps) {
  const defaultValues = useMemo(
    () => toDefaultValues({ planStartDate, availabilityConfig }),
    [availabilityConfig, planStartDate],
  );

  const form = useZodForm({
    schema: availabilityConfigSectionSchema,
    defaultValues,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const watchedValues = useWatch({ control: form.control });
  const syncingFromPropsRef = useRef(false);
  const resolvedValues: AvailabilityConfigSectionFormValues = {
    planStartDate: watchedValues?.planStartDate ?? form.getValues("planStartDate"),
    monday: watchedValues?.monday ?? form.getValues("monday"),
    tuesday: watchedValues?.tuesday ?? form.getValues("tuesday"),
    wednesday: watchedValues?.wednesday ?? form.getValues("wednesday"),
    thursday: watchedValues?.thursday ?? form.getValues("thursday"),
    friday: watchedValues?.friday ?? form.getValues("friday"),
    saturday: watchedValues?.saturday ?? form.getValues("saturday"),
    sunday: watchedValues?.sunday ?? form.getValues("sunday"),
  };

  useEffect(() => {
    if (areValuesEqual(form.getValues(), defaultValues)) {
      syncingFromPropsRef.current = false;
      return;
    }

    syncingFromPropsRef.current = true;
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useEffect(() => {
    if (syncingFromPropsRef.current) {
      if (areValuesEqual(resolvedValues, defaultValues)) {
        syncingFromPropsRef.current = false;
      }
      return;
    }

    if (areValuesEqual(resolvedValues, defaultValues)) {
      return;
    }

    const availabilityDaysChanged = weekDays.some(
      (day) => resolvedValues[day] !== defaultValues[day],
    );

    onChange({
      planStartDate: normalizePlanStartDate(resolvedValues.planStartDate),
      availabilityConfig: {
        ...availabilityConfig,
        template: availabilityDaysChanged ? "custom" : availabilityConfig.template,
        days: weekDays.map((day) => {
          const currentDay = availabilityConfig.days.find((item) => item.day === day) ?? {
            day,
            windows: [],
            max_sessions: 0,
          };
          const nextIsAvailable = resolvedValues[day];

          return {
            ...currentDay,
            windows: nextIsAvailable
              ? currentDay.windows.length > 0
                ? currentDay.windows
                : [defaultWindow]
              : [],
            max_sessions: nextIsAvailable ? Math.max(currentDay.max_sessions ?? 0, 1) : 0,
          };
        }),
      },
      availabilityProvenance: availabilityDaysChanged
        ? {
            ...availabilityProvenance,
            source: "user",
            updated_at: new Date().toISOString(),
          }
        : availabilityProvenance,
    });
  }, [availabilityConfig, availabilityProvenance, defaultValues, onChange, resolvedValues]);

  const selectedAvailabilityDays = weekDays.filter((day) => resolvedValues[day]).length;

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">Availability</Text>
        <Button variant="outline" size="sm" onPress={() => onReset?.()}>
          <Text>Reset</Text>
        </Button>
      </View>
      <Text className="text-xs text-muted-foreground">
        Set your plan start date and weekly availability.
      </Text>

      <Controller
        control={form.control}
        name="planStartDate"
        render={({ field }) => (
          <DateField
            id="plan-start-date"
            label="Plan start date"
            value={field.value}
            onChange={(nextDate) => {
              field.onChange(normalizePlanStartDate(nextDate));
            }}
            placeholder="Use today (default)"
            clearable
            error={planStartDateError}
            accessibilityHint="Sets your training plan start date. Format yyyy-mm-dd"
          />
        )}
      />

      <Text className="text-xs text-muted-foreground">
        Training days ({selectedAvailabilityDays}/7)
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {weekDays.map((day) => {
          const isAvailable = resolvedValues[day];

          return (
            <Button
              key={`availability-${day}`}
              variant={isAvailable ? "default" : "outline"}
              size="sm"
              onPress={() => {
                form.setValue(day, !isAvailable, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true,
                });
              }}
            >
              <Text>{getWeekDayLabel(day)}</Text>
            </Button>
          );
        })}
      </View>
    </View>
  );
}
