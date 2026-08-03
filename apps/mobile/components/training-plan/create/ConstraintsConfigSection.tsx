import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useEffect, useMemo, useRef } from "react";
import { useWatch } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { ConfigNumberSliderField } from "./fields/TrainingPlanConfigSliderFields";

const constraintsConfigSectionSchema = z.object({
  startingLongTermLoadAssumption: z.number().min(0).max(250),
  postGoalRecoveryDays: z.number().int().min(0).max(28),
});

export interface ConstraintsConfigSectionValues {
  startingLongTermLoadAssumption?: number;
  postGoalRecoveryDays: number;
}

interface ConstraintsConfigSectionProps {
  postGoalRecoveryDays: number;
  projectionStartingCtl?: number;
  startingLongTermLoadAssumption?: number;
  onChange: (values: ConstraintsConfigSectionValues) => void;
  onReset?: () => void;
}

const areValuesEqual = (
  left: ConstraintsConfigSectionValues,
  right: ConstraintsConfigSectionValues,
) =>
  left.startingLongTermLoadAssumption === right.startingLongTermLoadAssumption &&
  left.postGoalRecoveryDays === right.postGoalRecoveryDays;

const toDefaultValues = ({
  postGoalRecoveryDays,
  projectionStartingCtl,
  startingLongTermLoadAssumption,
}: Pick<
  ConstraintsConfigSectionProps,
  "postGoalRecoveryDays" | "projectionStartingCtl" | "startingLongTermLoadAssumption"
>): ConstraintsConfigSectionValues => ({
  startingLongTermLoadAssumption: Number(
    (startingLongTermLoadAssumption ?? projectionStartingCtl ?? 0).toFixed(1),
  ),
  postGoalRecoveryDays,
});

export function ConstraintsConfigSection({
  postGoalRecoveryDays,
  projectionStartingCtl,
  startingLongTermLoadAssumption,
  onChange,
  onReset,
}: ConstraintsConfigSectionProps) {
  const defaultValues = useMemo(
    () =>
      toDefaultValues({
        postGoalRecoveryDays,
        projectionStartingCtl,
        startingLongTermLoadAssumption,
      }),
    [postGoalRecoveryDays, projectionStartingCtl, startingLongTermLoadAssumption],
  );

  const form = useZodForm({
    schema: constraintsConfigSectionSchema,
    defaultValues,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const watchedValues = useWatch({ control: form.control });
  const syncingFromPropsRef = useRef(false);
  const startingLongTermLoadIsExplicitRef = useRef(startingLongTermLoadAssumption !== undefined);
  const resolvedValues = {
    startingLongTermLoadAssumption:
      watchedValues?.startingLongTermLoadAssumption ??
      form.getValues("startingLongTermLoadAssumption"),
    postGoalRecoveryDays:
      watchedValues?.postGoalRecoveryDays ?? form.getValues("postGoalRecoveryDays"),
  } satisfies ConstraintsConfigSectionValues;

  useEffect(() => {
    if (areValuesEqual(form.getValues(), defaultValues)) {
      startingLongTermLoadIsExplicitRef.current = startingLongTermLoadAssumption !== undefined;
      syncingFromPropsRef.current = false;
      return;
    }

    startingLongTermLoadIsExplicitRef.current = startingLongTermLoadAssumption !== undefined;
    syncingFromPropsRef.current = true;
    form.reset(defaultValues);
  }, [defaultValues, form, startingLongTermLoadAssumption]);

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
      startingLongTermLoadAssumption: startingLongTermLoadIsExplicitRef.current
        ? Number(resolvedValues.startingLongTermLoadAssumption.toFixed(1))
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

      <ConfigNumberSliderField
        control={form.control}
        name="startingLongTermLoadAssumption"
        id="starting-ctl-assumption"
        label="Initial Fitness"
        min={0}
        max={250}
        step={0.5}
        decimals={1}
        unitLabel="Common Load"
        helperText="Higher values raise your starting fitness line before progression is projected."
        showCurrentValueInRange={false}
        onSliderChange={() => {
          startingLongTermLoadIsExplicitRef.current = true;
        }}
        toFieldValue={(value) => Number(value.toFixed(1))}
      />

      <Text className="text-sm">Recovery days after goal</Text>
      <ConfigNumberSliderField
        control={form.control}
        name="postGoalRecoveryDays"
        id="post-goal-recovery-days"
        min={0}
        max={28}
        decimals={0}
        step={1}
        unitLabel="days"
        helperText="Adds easy days between goal peaks."
      />

      <Text className="text-xs text-muted-foreground">
        Safety caps are always enforced internally.
      </Text>
    </View>
  );
}
