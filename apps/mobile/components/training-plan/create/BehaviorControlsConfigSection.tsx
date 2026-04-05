import { type CreationBehaviorControlsV1, creationBehaviorControlsV1Schema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { NumberSliderInput } from "@repo/ui/components/number-slider-input";
import { PercentSliderInput } from "@repo/ui/components/percent-slider-input";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import React, { useEffect, useMemo, useRef } from "react";
import { Controller, useWatch } from "react-hook-form";
import { View } from "react-native";

interface BehaviorControlsConfigSectionProps {
  behaviorControls: CreationBehaviorControlsV1;
  onChange: (values: CreationBehaviorControlsV1) => void;
  onReset?: () => void;
}

const sectionCardClass = "gap-2";

const normalizeValues = (values: CreationBehaviorControlsV1): CreationBehaviorControlsV1 => ({
  aggressiveness: Number(values.aggressiveness.toFixed(2)),
  variability: Number(values.variability.toFixed(2)),
  spike_frequency: Number(values.spike_frequency.toFixed(2)),
  shape_target: Number(values.shape_target.toFixed(2)),
  shape_strength: Number(values.shape_strength.toFixed(2)),
  recovery_priority: Number(values.recovery_priority.toFixed(2)),
  starting_fitness_confidence: Number(values.starting_fitness_confidence.toFixed(2)),
});

const areValuesEqual = (left: CreationBehaviorControlsV1, right: CreationBehaviorControlsV1) =>
  left.aggressiveness === right.aggressiveness &&
  left.variability === right.variability &&
  left.spike_frequency === right.spike_frequency &&
  left.shape_target === right.shape_target &&
  left.shape_strength === right.shape_strength &&
  left.recovery_priority === right.recovery_priority &&
  left.starting_fitness_confidence === right.starting_fitness_confidence;

export function BehaviorControlsConfigSection({
  behaviorControls,
  onChange,
  onReset,
}: BehaviorControlsConfigSectionProps) {
  const defaultValues = useMemo(() => normalizeValues(behaviorControls), [behaviorControls]);

  const form = useZodForm({
    schema: creationBehaviorControlsV1Schema,
    defaultValues,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const watchedValues = useWatch({ control: form.control });
  const syncingFromPropsRef = useRef(false);
  const resolvedValues = normalizeValues({
    aggressiveness: watchedValues?.aggressiveness ?? form.getValues("aggressiveness"),
    variability: watchedValues?.variability ?? form.getValues("variability"),
    spike_frequency: watchedValues?.spike_frequency ?? form.getValues("spike_frequency"),
    shape_target: watchedValues?.shape_target ?? form.getValues("shape_target"),
    shape_strength: watchedValues?.shape_strength ?? form.getValues("shape_strength"),
    recovery_priority: watchedValues?.recovery_priority ?? form.getValues("recovery_priority"),
    starting_fitness_confidence:
      watchedValues?.starting_fitness_confidence ?? form.getValues("starting_fitness_confidence"),
  });

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

    onChange(resolvedValues);
  }, [defaultValues, onChange, resolvedValues]);

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">Tuning</Text>
        <Button variant="outline" size="sm" onPress={() => onReset?.()}>
          <Text>Reset</Text>
        </Button>
      </View>

      <View className={sectionCardClass}>
        <Controller
          control={form.control}
          name="aggressiveness"
          render={({ field }) => (
            <PercentSliderInput
              id="behavior-aggressiveness"
              label="Aggressiveness"
              value={field.value * 100}
              min={0}
              max={100}
              step={1}
              helperText="Higher values push progression harder."
              onChange={(percent) => {
                field.onChange(Number((percent / 100).toFixed(2)));
              }}
              showNumericInput={false}
            />
          )}
        />
        <Controller
          control={form.control}
          name="variability"
          render={({ field }) => (
            <PercentSliderInput
              id="behavior-variability"
              label="Variability"
              value={field.value * 100}
              min={0}
              max={100}
              step={1}
              helperText="Higher values allow more week-to-week variation."
              onChange={(percent) => {
                field.onChange(Number((percent / 100).toFixed(2)));
              }}
              showNumericInput={false}
            />
          )}
        />
        <Controller
          control={form.control}
          name="spike_frequency"
          render={({ field }) => (
            <PercentSliderInput
              id="behavior-spike-frequency"
              label="Spike frequency"
              value={field.value * 100}
              min={0}
              max={100}
              step={1}
              helperText="Higher values allow bigger peak weeks more often."
              onChange={(percent) => {
                field.onChange(Number((percent / 100).toFixed(2)));
              }}
              showNumericInput={false}
            />
          )}
        />
        <Controller
          control={form.control}
          name="shape_target"
          render={({ field }) => (
            <NumberSliderInput
              id="behavior-shape-target"
              label="Load shape target"
              value={field.value}
              min={-1}
              max={1}
              decimals={2}
              step={0.05}
              helperText="Negative values bias early load, positive values bias later load."
              onChange={(value) => {
                field.onChange(Number(value.toFixed(2)));
              }}
            />
          )}
        />
        <Controller
          control={form.control}
          name="shape_strength"
          render={({ field }) => (
            <PercentSliderInput
              id="behavior-shape-strength"
              label="Load shape strength"
              value={field.value * 100}
              min={0}
              max={100}
              step={1}
              helperText="Higher values enforce the selected load shape more strongly."
              onChange={(percent) => {
                field.onChange(Number((percent / 100).toFixed(2)));
              }}
              showNumericInput={false}
            />
          )}
        />
        <Controller
          control={form.control}
          name="recovery_priority"
          render={({ field }) => (
            <NumberSliderInput
              id="behavior-recovery-priority"
              label="Recovery priority"
              value={field.value * 100}
              min={0}
              max={100}
              decimals={0}
              step={1}
              unitLabel="%"
              helperText="Higher values prioritize recovery over risk-taking."
              onChange={(value) => {
                field.onChange(Number((value / 100).toFixed(2)));
              }}
            />
          )}
        />
        <Controller
          control={form.control}
          name="starting_fitness_confidence"
          render={({ field }) => (
            <NumberSliderInput
              id="behavior-starting-fitness-confidence"
              label="Starting fitness confidence"
              value={field.value * 100}
              min={0}
              max={100}
              decimals={0}
              step={1}
              unitLabel="%"
              helperText="Lower values anchor early weeks more conservatively."
              onChange={(value) => {
                field.onChange(Number((value / 100).toFixed(2)));
              }}
            />
          )}
        />
      </View>
    </View>
  );
}
