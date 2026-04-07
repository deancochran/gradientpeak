import { Button } from "@repo/ui/components/button";
import { NumberSliderInput } from "@repo/ui/components/number-slider-input";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import React, { useEffect, useMemo, useRef } from "react";
import { Controller, useWatch } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";

const constraintsConfigSectionSchema = z.object({
  startingCtlAssumption: z.number().min(0).max(250),
  postGoalRecoveryDays: z.number().int().min(0).max(28),
});

export interface ConstraintsConfigSectionValues {
  startingCtlAssumption?: number;
  postGoalRecoveryDays: number;
}

interface ConstraintsConfigSectionProps {
  postGoalRecoveryDays: number;
  projectionStartingCtl?: number;
  startingCtlAssumption?: number;
  onChange: (values: ConstraintsConfigSectionValues) => void;
  onReset?: () => void;
}

const sectionCardClass = "gap-2";

const areValuesEqual = (
  left: ConstraintsConfigSectionValues,
  right: ConstraintsConfigSectionValues,
) =>
  left.startingCtlAssumption === right.startingCtlAssumption &&
  left.postGoalRecoveryDays === right.postGoalRecoveryDays;

const toDefaultValues = ({
  postGoalRecoveryDays,
  projectionStartingCtl,
  startingCtlAssumption,
}: Pick<
  ConstraintsConfigSectionProps,
  "postGoalRecoveryDays" | "projectionStartingCtl" | "startingCtlAssumption"
>): ConstraintsConfigSectionValues => ({
  startingCtlAssumption: Number((startingCtlAssumption ?? projectionStartingCtl ?? 0).toFixed(1)),
  postGoalRecoveryDays,
});

export function ConstraintsConfigSection({
  postGoalRecoveryDays,
  projectionStartingCtl,
  startingCtlAssumption,
  onChange,
  onReset,
}: ConstraintsConfigSectionProps) {
  const defaultValues = useMemo(
    () =>
      toDefaultValues({
        postGoalRecoveryDays,
        projectionStartingCtl,
        startingCtlAssumption,
      }),
    [postGoalRecoveryDays, projectionStartingCtl, startingCtlAssumption],
  );

  const form = useZodForm({
    schema: constraintsConfigSectionSchema,
    defaultValues,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const watchedValues = useWatch({ control: form.control });
  const syncingFromPropsRef = useRef(false);
  const startingCtlIsExplicitRef = useRef(startingCtlAssumption !== undefined);
  const resolvedValues = {
    startingCtlAssumption:
      watchedValues?.startingCtlAssumption ?? form.getValues("startingCtlAssumption"),
    postGoalRecoveryDays:
      watchedValues?.postGoalRecoveryDays ?? form.getValues("postGoalRecoveryDays"),
  } satisfies ConstraintsConfigSectionValues;

  useEffect(() => {
    if (areValuesEqual(form.getValues(), defaultValues)) {
      startingCtlIsExplicitRef.current = startingCtlAssumption !== undefined;
      syncingFromPropsRef.current = false;
      return;
    }

    startingCtlIsExplicitRef.current = startingCtlAssumption !== undefined;
    syncingFromPropsRef.current = true;
    form.reset(defaultValues);
  }, [defaultValues, form, startingCtlAssumption]);

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

    onChange({
      startingCtlAssumption: startingCtlIsExplicitRef.current
        ? Number(resolvedValues.startingCtlAssumption.toFixed(1))
        : undefined,
      postGoalRecoveryDays: resolvedValues.postGoalRecoveryDays,
    });
  }, [defaultValues, onChange, resolvedValues]);

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">Limits</Text>
        <Button variant="outline" size="sm" onPress={() => onReset?.()}>
          <Text>Reset</Text>
        </Button>
      </View>

      <View className={sectionCardClass}>
        <Controller
          control={form.control}
          name="startingCtlAssumption"
          render={({ field }) => (
            <NumberSliderInput
              id="starting-ctl-assumption"
              label="Initial CTL (fitness)"
              value={field.value}
              min={0}
              max={250}
              step={0.5}
              decimals={1}
              unitLabel="CTL"
              helperText="Higher values raise your starting fitness line before progression is projected."
              onChange={(value) => {
                startingCtlIsExplicitRef.current = true;
                field.onChange(Number(value.toFixed(1)));
              }}
              showCurrentValueInRange={false}
            />
          )}
        />
      </View>

      <View className={sectionCardClass}>
        <Text className="text-sm">Recovery days after goal</Text>
        <Controller
          control={form.control}
          name="postGoalRecoveryDays"
          render={({ field }) => (
            <NumberSliderInput
              id="post-goal-recovery-days"
              value={field.value}
              min={0}
              max={28}
              decimals={0}
              step={1}
              unitLabel="days"
              helperText="Adds easy days between goal peaks."
              onChange={(value) => {
                field.onChange(value);
              }}
            />
          )}
        />
      </View>

      <View className={sectionCardClass}>
        <Text className="text-xs text-muted-foreground">
          Safety caps are always enforced internally.
        </Text>
      </View>
    </View>
  );
}
