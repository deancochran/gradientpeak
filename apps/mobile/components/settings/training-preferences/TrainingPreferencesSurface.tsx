import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Text } from "@repo/ui/components/text";
import type { ComponentProps } from "react";
import type { Control } from "react-hook-form";
import { View } from "react-native";
import type {
  CompactTrainingPreferencesChange,
  CompactTrainingPreferencesValue,
  TrainingPreferencePreset,
} from "./compactTrainingPreferences";
import { GlobalTrainingPreferenceCatalogSection } from "./GlobalTrainingPreferenceCatalogSection";
import { TrainingPreferencesContent } from "./TrainingPreferencesContent";
import { TrainingPreferencesPanel } from "./TrainingPreferencesPanel";
import { type PreferencesTabKey, TrainingPreferencesTabs } from "./TrainingPreferencesTabs";

const presetOptions: Array<{
  key: TrainingPreferencePreset;
  label: string;
  summary: string;
}> = [
  { key: "safer", label: "Safer", summary: "Build more cautiously" },
  { key: "balanced", label: "Balanced", summary: "Steady, adaptable progress" },
  { key: "push_harder", label: "Push harder", summary: "Progress more aggressively" },
];

type CatalogProps = ComponentProps<typeof GlobalTrainingPreferenceCatalogSection>;

export type FullTrainingPreferencesSurfaceProps = Omit<CatalogProps, "activeTab"> & {
  presentation: "full";
  activeTab: PreferencesTabKey;
  control: Control<AthleteTrainingSettingsFormInput>;
  onSelectTab: (tab: PreferencesTabKey) => void;
  visibleTabs?: PreferencesTabKey[];
};

export type CompactTrainingPreferencesSurfaceProps = {
  presentation: "compact";
  value: CompactTrainingPreferencesValue;
  onChange: (change: CompactTrainingPreferencesChange) => void;
};

export type TrainingPreferencesSurfaceProps =
  | FullTrainingPreferencesSurfaceProps
  | CompactTrainingPreferencesSurfaceProps;

function CompactTrainingPreferencesSurface({
  onChange,
  value,
}: CompactTrainingPreferencesSurfaceProps) {
  const update = <Key extends keyof CompactTrainingPreferencesValue>(
    key: Key,
    nextValue: CompactTrainingPreferencesValue[Key],
  ) => onChange({ [key]: nextValue });
  const selectedPreset = presetOptions.find((option) => option.key === value.preset);

  return (
    <View className="gap-4" testID="training-preferences-compact">
      <View className="gap-1">
        <Text className="text-base font-semibold text-foreground">Training approach</Text>
        <Text className="text-sm text-muted-foreground">
          {selectedPreset?.summary} · {value.minSessionsPerWeek}–{value.maxSessionsPerWeek} sessions
          · up to {value.maxWeeklyMinutes} min/week
        </Text>
      </View>

      <View
        className="flex-row gap-2"
        accessibilityLabel="Training approach options"
        accessibilityRole="radiogroup"
        testID="training-preferences-preset-group"
      >
        {presetOptions.map((option) => {
          const selected = option.key === value.preset;
          return (
            <View className="flex-1" key={option.key}>
              <Button
                accessibilityLabel={`${option.label} training approach`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => update("preset", option.key)}
                testID={`training-preferences-preset-${option.key}`}
                variant={selected ? "default" : "outline"}
              >
                <Text>{option.label}</Text>
              </Button>
            </View>
          );
        })}
      </View>

      <View className="gap-3">
        <IntegerStepper
          label="Minimum sessions per week"
          max={21}
          min={0}
          onChange={(nextValue) => update("minSessionsPerWeek", nextValue)}
          testId="training-preferences-compact-min-sessions"
          value={value.minSessionsPerWeek}
        />
        <IntegerStepper
          label="Maximum sessions per week"
          max={21}
          min={0}
          onChange={(nextValue) => update("maxSessionsPerWeek", nextValue)}
          testId="training-preferences-compact-max-sessions"
          value={value.maxSessionsPerWeek}
        />
        <IntegerStepper
          label="Longest session (minutes)"
          max={600}
          min={20}
          onChange={(nextValue) => update("maxSingleSessionMinutes", nextValue)}
          testId="training-preferences-compact-max-single-session"
          value={value.maxSingleSessionMinutes}
        />
        <IntegerStepper
          label="Weekly time budget (minutes)"
          max={10080}
          min={30}
          onChange={(nextValue) => update("maxWeeklyMinutes", nextValue)}
          testId="training-preferences-compact-max-weekly"
          value={value.maxWeeklyMinutes}
        />
      </View>
    </View>
  );
}

export function TrainingPreferencesSurface(props: TrainingPreferencesSurfaceProps) {
  if (props.presentation === "compact") {
    return <CompactTrainingPreferencesSurface {...props} />;
  }

  const {
    activeTab,
    onSelectTab,
    presentation: _presentation,
    visibleTabs,
    ...catalogProps
  } = props;

  return (
    <TrainingPreferencesContent>
      <TrainingPreferencesTabs
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        visibleTabs={visibleTabs}
      />
      <TrainingPreferencesPanel>
        <GlobalTrainingPreferenceCatalogSection activeTab={activeTab} {...catalogProps} />
      </TrainingPreferencesPanel>
    </TrainingPreferencesContent>
  );
}
