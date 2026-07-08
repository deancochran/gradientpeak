import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import type { Control } from "react-hook-form";
import { PreferenceChoiceField } from "./PreferenceChoiceField";

type TrainingStyleSectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function TrainingStyleSection({ control }: TrainingStyleSectionProps) {
  return (
    <>
      <PreferenceChoiceField
        control={control}
        label="Training approach"
        description="Choose how assertively the planner should build fitness."
        name="training_style.progression_pace"
        testID="preferences-progression-pace"
        options={[
          {
            label: "Safer",
            description: "Progress more slowly and protect consistency.",
            value: 0.35,
          },
          {
            label: "Balanced",
            description: "Use a moderate build rate for most athletes.",
            value: 0.5,
          },
          {
            label: "Aggressive",
            description: "Allow faster progression when recovery supports it.",
            value: 0.72,
          },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Weekly rhythm"
        description="Control whether workouts should be evenly spread or clustered around key days."
        name="training_style.week_pattern_preference"
        testID="preferences-week-pattern"
        options={[
          {
            label: "Evenly spread",
            description: "Keep training distributed through the week.",
            value: 0.35,
          },
          {
            label: "Balanced",
            description: "Mix steady rhythm with key-session focus.",
            value: 0.5,
          },
          {
            label: "Key-day focused",
            description: "Allow more clustering around priority workouts.",
            value: 0.65,
          },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Key session density"
        description="Decide how many important sessions the plan can carry at once."
        name="training_style.key_session_density_preference"
        testID="preferences-key-session-density"
        options={[
          { label: "Low", description: "Keep hard/key workouts sparse.", value: 0.35 },
          { label: "Moderate", description: "Use a typical mix of easy and key work.", value: 0.5 },
          {
            label: "High",
            description: "Allow more key sessions when goals demand it.",
            value: 0.7,
          },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Strength / conditioning priority"
        description="Tell the planner how strongly to protect strength, conditioning, HIIT, or support work."
        name="training_style.strength_integration_priority"
        testID="preferences-strength-integration"
        options={[
          { label: "Optional", description: "Let sport-specific work take priority.", value: 0.25 },
          {
            label: "Balanced",
            description: "Include support work when it fits the week.",
            value: 0.5,
          },
          {
            label: "Protected",
            description: "Keep support work in the plan when possible.",
            value: 0.75,
          },
        ]}
      />
    </>
  );
}
