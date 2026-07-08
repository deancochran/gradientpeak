import { Text } from "@repo/ui/components/text";
import { Pressable, View } from "react-native";

export type PreferencePresetKey = "custom" | "conservative" | "balanced" | "performance";

export type PreferencePreset = {
  key: Exclude<PreferencePresetKey, "custom">;
  label: string;
};

type PreferencesOverviewSectionProps = {
  activeTemplateLabel: string | null;
  modifiedTemplateFieldCount: number;
  onApplyPreset: (presetKey: Exclude<PreferencePresetKey, "custom">) => void;
  preferenceDirectionSummary: string;
  presets: PreferencePreset[];
  selectedPreferencePreset: PreferencePresetKey;
};

export function PreferencesOverviewSection({
  activeTemplateLabel,
  modifiedTemplateFieldCount,
  onApplyPreset,
  preferenceDirectionSummary,
  presets,
  selectedPreferencePreset,
}: PreferencesOverviewSectionProps) {
  return (
    <>
      <View className="gap-1">
        <Text className="text-sm font-semibold text-foreground">Training templates</Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          Templates are starting points. Fine-tune any value afterward; modified groups are marked
          with a dot.
        </Text>
      </View>
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
      <View className="rounded-xl border border-border bg-muted/20 px-3 py-2">
        <Text className="text-xs leading-4 text-muted-foreground">
          {selectedPreferencePreset !== "custom"
            ? `${activeTemplateLabel ?? "Template"} template applied.`
            : activeTemplateLabel
              ? `Custom setup · started from ${activeTemplateLabel}. ${modifiedTemplateFieldCount} setting${modifiedTemplateFieldCount === 1 ? "" : "s"} changed.`
              : "Custom setup. Choose a template anytime to reset these planning behavior values."}
        </Text>
      </View>
    </>
  );
}
