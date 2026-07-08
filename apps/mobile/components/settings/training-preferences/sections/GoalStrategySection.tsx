import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { FormPercentSliderField } from "@repo/ui/components/form";
import type { Control } from "react-hook-form";

type GoalStrategySectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function GoalStrategySection({ control }: GoalStrategySectionProps) {
  return (
    <>
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Target surplus preference"
        max={100}
        min={0}
        name="goal_strategy_preferences.target_surplus_preference"
        showNumericInput={false}
        step={1}
        testId="preferences-target-surplus"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Priority tradeoff"
        max={100}
        min={0}
        name="goal_strategy_preferences.priority_tradeoff_preference"
        showNumericInput={false}
        step={1}
        testId="preferences-priority-tradeoff"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Taper style"
        max={100}
        min={0}
        name="goal_strategy_preferences.taper_style_preference"
        showNumericInput={false}
        step={1}
        testId="preferences-taper-style"
        valueMode="fraction"
      />
    </>
  );
}
