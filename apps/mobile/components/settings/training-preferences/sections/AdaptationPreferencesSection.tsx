import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { FormPercentSliderField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control } from "react-hook-form";
import { View } from "react-native";

type AdaptationPreferencesSectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function AdaptationPreferencesSection({ control }: AdaptationPreferencesSectionProps) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-sm font-semibold text-foreground">Adaptation behavior</Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          These advanced settings control how quickly plans react to recent training and how much
          churn is acceptable when plans update.
        </Text>
      </View>
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Recency adaptation"
        max={100}
        min={0}
        name="adaptation_preferences.recency_adaptation_preference"
        showNumericInput={false}
        step={1}
        testId="preferences-recency-adaptation"
        valueMode="fraction"
      />
      <FormPercentSliderField
        control={control}
        decimals={0}
        label="Plan churn tolerance"
        max={100}
        min={0}
        name="adaptation_preferences.plan_churn_tolerance"
        showNumericInput={false}
        step={1}
        testId="preferences-plan-churn"
        valueMode="fraction"
      />
    </View>
  );
}
