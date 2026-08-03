import type { TrainingPreferenceField } from "@repo/core";
import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import {
  FormDateInputField,
  FormIntegerStepperField,
  FormSwitchField,
} from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control } from "react-hook-form";
import { View } from "react-native";
import { ReadOnlyTrainingPreferenceField } from "@/components/settings/training-preferences/TrainingPreferenceFieldRenderer";

type GlobalBaselineFitnessSectionProps = {
  mode?: "global-edit";
  baselineFitness: AthleteTrainingSettingsFormInput["baseline_fitness"];
  control: Control<AthleteTrainingSettingsFormInput>;
  manualBaselineCtlWarning: string | null;
  onToggleAdvancedControls: () => void;
  showAdvancedControls: boolean;
};

type PlanLocalBaselineFitnessSectionProps = {
  fields: TrainingPreferenceField[];
  mode: "plan-local-readonly";
};

type BaselineFitnessSectionProps =
  | GlobalBaselineFitnessSectionProps
  | PlanLocalBaselineFitnessSectionProps;

export function BaselineFitnessSection(props: BaselineFitnessSectionProps) {
  if (props.mode === "plan-local-readonly") {
    return (
      <View className="gap-3">
        {props.fields.map((field) => (
          <ReadOnlyTrainingPreferenceField
            key={field.id}
            field={field}
            disabledReason="Profile-level preference."
          />
        ))}
      </View>
    );
  }

  const {
    baselineFitness,
    control,
    manualBaselineCtlWarning,
    onToggleAdvancedControls,
    showAdvancedControls,
  } = props;

  return (
    <>
      <FormSwitchField
        control={control}
        label="Enable Manual Baseline"
        name="baseline_fitness.is_enabled"
        switchLabel="Enable manual baseline"
        testId="preferences-baseline-enabled"
      />
      {baselineFitness?.is_enabled ? (
        <>
          <FormIntegerStepperField
            control={control}
            label="Fitness"
            max={250}
            min={0}
            name="baseline_fitness.override_longTermLoad"
            testId="preferences-baseline-fitness"
          />
          {manualBaselineCtlWarning ? (
            <View
              className="rounded-2xl border border-border bg-muted/20 px-3 py-2"
              testID="preferences-baseline-fitness-warning"
            >
              <Text className="text-xs leading-5 text-muted-foreground">
                {manualBaselineCtlWarning}
              </Text>
            </View>
          ) : null}
          <FormIntegerStepperField
            control={control}
            label="Fatigue"
            max={250}
            min={0}
            name="baseline_fitness.override_recentLoad"
            testId="preferences-baseline-fatigue"
          />
          <FormDateInputField
            clearable
            control={control}
            label="Baseline date"
            name="baseline_fitness.override_date"
            pickerPresentation="modal"
            testId="preferences-baseline-date"
          />
          <View className="mt-1 rounded-md border border-border bg-muted/20 px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              onPress={onToggleAdvancedControls}
              testID="preferences-toggle-advanced-ramp"
            >
              <Text>{showAdvancedControls ? "Hide ramp controls" : "Fine tune ramps"}</Text>
            </Button>
          </View>
          {showAdvancedControls ? (
            <>
              <FormIntegerStepperField
                control={control}
                label="Max weekly Load ramp %"
                max={40}
                min={1}
                name="baseline_fitness.max_weekly_load_ramp_pct"
                testId="preferences-ramp-load-pct"
              />
              <FormIntegerStepperField
                control={control}
                label="Max Fitness ramp/week"
                max={12}
                min={1}
                name="baseline_fitness.max_longTermLoad_ramp_per_week"
                testId="preferences-ramp-fitness"
              />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
