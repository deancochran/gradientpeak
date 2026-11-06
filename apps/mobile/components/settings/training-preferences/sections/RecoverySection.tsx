import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { FormIntegerStepperField, FormPercentSliderField } from "@repo/ui/components/form";
import type { Control } from "react-hook-form";

type RecoverySectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function RecoverySection({ control }: RecoverySectionProps) {
  return (
    <>
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Recovery priority"
        max={100}
        min={0}
        name="recovery_preferences.recovery_priority"
        showNumericInput={false}
        step={1}
        testId="preferences-recovery-priority"
        valueMode="fraction"
      />
      <FormIntegerStepperField
        control={control}
        label="Recovery days after a goal"
        max={21}
        min={0}
        name="recovery_preferences.post_goal_recovery_days"
        testId="preferences-recovery-days"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Systemic fatigue tolerance"
        max={100}
        min={0}
        name="recovery_preferences.systemic_fatigue_tolerance"
        showNumericInput={false}
        step={1}
        testId="preferences-systemic-fatigue"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Double-day tolerance"
        max={100}
        min={0}
        name="recovery_preferences.double_day_tolerance"
        showNumericInput={false}
        step={1}
        testId="preferences-double-day-tolerance"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Long-session fatigue tolerance"
        max={100}
        min={0}
        name="recovery_preferences.long_session_fatigue_tolerance"
        showNumericInput={false}
        step={1}
        testId="preferences-long-session-fatigue"
        valueMode="fraction"
      />
    </>
  );
}
