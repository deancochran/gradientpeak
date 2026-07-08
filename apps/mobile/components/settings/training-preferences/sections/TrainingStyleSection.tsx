import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { FormPercentSliderField } from "@repo/ui/components/form";
import type { Control } from "react-hook-form";

type TrainingStyleSectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function TrainingStyleSection({ control }: TrainingStyleSectionProps) {
  return (
    <>
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Progression pace"
        max={100}
        min={0}
        name="training_style.progression_pace"
        showNumericInput={false}
        step={1}
        testId="preferences-progression-pace"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Week pattern"
        max={100}
        min={0}
        name="training_style.week_pattern_preference"
        showNumericInput={false}
        step={1}
        testId="preferences-week-pattern"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Key session density"
        max={100}
        min={0}
        name="training_style.key_session_density_preference"
        showNumericInput={false}
        step={1}
        testId="preferences-key-session-density"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Strength integration priority"
        max={100}
        min={0}
        name="training_style.strength_integration_priority"
        showNumericInput={false}
        step={1}
        testId="preferences-strength-integration"
        valueMode="fraction"
      />
    </>
  );
}
