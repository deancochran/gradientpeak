import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { FormPercentSliderField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control } from "react-hook-form";
import { Pressable, View } from "react-native";

export type PreferencePresetKey = "custom" | "conservative" | "balanced" | "performance";

export type PreferencePreset = {
  key: Exclude<PreferencePresetKey, "custom">;
  label: string;
};

type PreferencesOverviewSectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
  onApplyPreset: (presetKey: Exclude<PreferencePresetKey, "custom">) => void;
  preferenceDirectionSummary: string;
  presets: PreferencePreset[];
  selectedPreferencePreset: PreferencePresetKey;
};

export function PreferencesOverviewSection({
  control,
  onApplyPreset,
  preferenceDirectionSummary,
  presets,
  selectedPreferencePreset,
}: PreferencesOverviewSectionProps) {
  return (
    <>
      <Text className="text-sm font-semibold text-foreground">{preferenceDirectionSummary}</Text>
      <View className="flex-row flex-wrap gap-2">
        <View
          className={`rounded-md border px-2 py-1.5 ${
            selectedPreferencePreset === "custom"
              ? "border-primary bg-primary"
              : "border-border bg-muted/20"
          }`}
          testID="training-preferences-preset-custom"
        >
          <Text
            className={`text-center text-xs font-semibold ${
              selectedPreferencePreset === "custom" ? "text-primary-foreground" : "text-foreground"
            }`}
          >
            Custom
          </Text>
        </View>
        {presets.map((preset) => {
          const isSelected = selectedPreferencePreset === preset.key;
          return (
            <Pressable
              key={preset.key}
              onPress={() => onApplyPreset(preset.key)}
              className={`rounded-md border px-2 py-1.5 ${
                isSelected ? "border-primary bg-primary" : "border-border bg-muted/20"
              }`}
              accessibilityRole="button"
              accessibilityLabel={`Apply ${preset.label} training preference preset`}
              testID={`training-preferences-preset-${preset.key}`}
            >
              <Text
                className={`text-center text-xs font-semibold ${
                  isSelected ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="gap-3 rounded-2xl border border-border bg-muted/10 p-3">
        <Text className="text-sm font-semibold text-foreground">Adaptation behavior</Text>
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
    </>
  );
}
