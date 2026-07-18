import { type CreationBehaviorControlsV1, creationBehaviorControlsV1Schema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import {
  ConfigNumberSliderField,
  ConfigPercentSliderField,
} from "./fields/TrainingPlanConfigSliderFields";

interface BehaviorControlsConfigSectionProps {
  behaviorControls: CreationBehaviorControlsV1;
  onChange: (values: CreationBehaviorControlsV1) => void;
  onReset?: () => void;
}

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

type TuningPresetKey = "conservative" | "balanced" | "ambitious";

const tuningPresets: Record<
  TuningPresetKey,
  { label: string; description: string; values: CreationBehaviorControlsV1 }
> = {
  conservative: {
    label: "Conservative",
    description: "Steadier progress with more recovery protection.",
    values: {
      aggressiveness: 0.35,
      variability: 0.3,
      spike_frequency: 0.2,
      shape_target: -0.2,
      shape_strength: 0.3,
      recovery_priority: 0.75,
      starting_fitness_confidence: 0.5,
    },
  },
  balanced: {
    label: "Balanced",
    description: "A moderate progression and recovery mix.",
    values: {
      aggressiveness: 0.5,
      variability: 0.5,
      spike_frequency: 0.35,
      shape_target: 0,
      shape_strength: 0.35,
      recovery_priority: 0.6,
      starting_fitness_confidence: 0.6,
    },
  },
  ambitious: {
    label: "Ambitious",
    description: "Stronger progression with more load variation.",
    values: {
      aggressiveness: 0.7,
      variability: 0.6,
      spike_frequency: 0.55,
      shape_target: 0.2,
      shape_strength: 0.5,
      recovery_priority: 0.45,
      starting_fitness_confidence: 0.75,
    },
  },
};

const presetKeys = Object.keys(tuningPresets) as TuningPresetKey[];

function CustomTuningFields({
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
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-semibold">Custom values</Text>
          <Text className="text-xs text-muted-foreground">
            Changes update the projection immediately.
          </Text>
        </View>
        <Button variant="outline" size="sm" onPress={() => onReset?.()}>
          <Text>Reset</Text>
        </Button>
      </View>

      <ConfigPercentSliderField
        control={form.control}
        name="aggressiveness"
        id="behavior-aggressiveness"
        label="Aggressiveness"
        min={0}
        max={100}
        step={1}
        helperText="Higher values push progression harder."
      />
      <ConfigPercentSliderField
        control={form.control}
        name="variability"
        id="behavior-variability"
        label="Variability"
        min={0}
        max={100}
        step={1}
        helperText="Higher values allow more week-to-week variation."
      />
      <ConfigPercentSliderField
        control={form.control}
        name="spike_frequency"
        id="behavior-spike-frequency"
        label="Spike frequency"
        min={0}
        max={100}
        step={1}
        helperText="Higher values allow bigger peak weeks more often."
      />
      <ConfigNumberSliderField
        control={form.control}
        name="shape_target"
        id="behavior-shape-target"
        label="Load shape target"
        min={-1}
        max={1}
        decimals={2}
        step={0.05}
        helperText="Negative values bias early load, positive values bias later load."
        toFieldValue={(value) => Number(value.toFixed(2))}
      />
      <ConfigPercentSliderField
        control={form.control}
        name="shape_strength"
        id="behavior-shape-strength"
        label="Load shape strength"
        min={0}
        max={100}
        step={1}
        helperText="Higher values enforce the selected load shape more strongly."
      />
      <ConfigNumberSliderField
        control={form.control}
        name="recovery_priority"
        id="behavior-recovery-priority"
        label="Recovery priority"
        min={0}
        max={100}
        decimals={0}
        step={1}
        unitLabel="%"
        helperText="Higher values prioritize recovery over risk-taking."
        toSliderValue={(value) => value * 100}
        toFieldValue={(value) => Number((value / 100).toFixed(2))}
      />
      <ConfigNumberSliderField
        control={form.control}
        name="starting_fitness_confidence"
        id="behavior-starting-fitness-confidence"
        label="Starting fitness confidence"
        min={0}
        max={100}
        decimals={0}
        step={1}
        unitLabel="%"
        helperText="Lower values anchor early weeks more conservatively."
        toSliderValue={(value) => value * 100}
        toFieldValue={(value) => Number((value / 100).toFixed(2))}
      />
    </View>
  );
}

export function BehaviorControlsConfigSection({
  behaviorControls,
  onChange,
  onReset,
}: BehaviorControlsConfigSectionProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const selectedPreset = presetKeys.find((key) =>
    areValuesEqual(normalizeValues(behaviorControls), tuningPresets[key].values),
  );

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      <View className="gap-1">
        <Text className="font-semibold">Tuning approach</Text>
        <Text className="text-xs text-muted-foreground">
          Choose a simple approach, or keep precise control with Custom tuning.
        </Text>
      </View>

      <View className="gap-2">
        {presetKeys.map((key) => {
          const preset = tuningPresets[key];
          const isSelected = selectedPreset === key;
          return (
            <Button
              key={key}
              variant={isSelected ? "default" : "outline"}
              onPress={() => onChange(preset.values)}
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${preset.label} tuning preset`}
              className="h-auto min-h-14 justify-start px-3 py-2"
            >
              <View className="flex-1 items-start">
                <Text
                  className={isSelected ? "font-semibold text-primary-foreground" : "font-semibold"}
                >
                  {preset.label}
                </Text>
                <Text
                  className={
                    isSelected
                      ? "text-xs text-primary-foreground/80"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {preset.description}
                </Text>
              </View>
            </Button>
          );
        })}
      </View>

      <Button variant={selectedPreset ? "ghost" : "secondary"} onPress={() => setCustomOpen(true)}>
        <Text>{selectedPreset ? "Custom tuning" : "Custom tuning · Active"}</Text>
      </Button>

      {customOpen ? (
        <AppFormModal
          description="Adjust all seven tuning controls without changing their current values on open."
          onClose={() => setCustomOpen(false)}
          testID="custom-tuning-modal"
          title="Custom Tuning"
        >
          <CustomTuningFields
            behaviorControls={behaviorControls}
            onChange={onChange}
            {...(onReset ? { onReset } : {})}
          />
        </AppFormModal>
      ) : null}
    </View>
  );
}
