import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { FormIntegerStepperField } from "@repo/ui/components/form";
import type { Control } from "react-hook-form";
import { PreferenceChoiceField } from "./PreferenceChoiceField";

type RecoverySectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function RecoverySection({ control }: RecoverySectionProps) {
  return (
    <>
      <PreferenceChoiceField
        control={control}
        label="Recovery bias"
        description="Choose how protective the plan should be when fatigue increases."
        name="recovery_preferences.recovery_priority"
        testID="preferences-recovery-priority"
        options={[
          {
            label: "Push through",
            description: "Allow moderate fatigue when the plan is progressing.",
            value: 0.45,
          },
          {
            label: "Balanced",
            description: "Protect recovery without being overly conservative.",
            value: 0.6,
          },
          {
            label: "Protect recovery",
            description: "Prefer easier adjustments when fatigue is elevated.",
            value: 0.75,
          },
        ]}
      />
      <FormIntegerStepperField
        control={control}
        label="Recovery days after a goal"
        max={21}
        min={0}
        name="recovery_preferences.post_goal_recovery_days"
        testId="preferences-recovery-days"
      />
      <PreferenceChoiceField
        control={control}
        label="Systemic fatigue tolerance"
        description="Set how much accumulated fatigue the planner may tolerate."
        name="recovery_preferences.systemic_fatigue_tolerance"
        testID="preferences-systemic-fatigue"
        options={[
          { label: "Low", description: "Back off quickly as fatigue rises.", value: 0.35 },
          { label: "Moderate", description: "Use a typical fatigue allowance.", value: 0.5 },
          { label: "High", description: "Allow more fatigue before reducing load.", value: 0.68 },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Double-day tolerance"
        description="Control whether two workouts can land on the same day."
        name="recovery_preferences.double_day_tolerance"
        testID="preferences-double-day-tolerance"
        options={[
          { label: "Avoid", description: "Prefer one workout per day.", value: 0.15 },
          { label: "Sometimes", description: "Use double days only when helpful.", value: 0.35 },
          {
            label: "Allowed",
            description: "Permit double days when the plan benefits.",
            value: 0.65,
          },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Long-session fatigue tolerance"
        description="Choose how much fatigue long workouts are allowed to create."
        name="recovery_preferences.long_session_fatigue_tolerance"
        testID="preferences-long-session-fatigue"
        options={[
          {
            label: "Conservative",
            description: "Keep long sessions more controlled.",
            value: 0.35,
          },
          { label: "Balanced", description: "Use normal long-session sizing.", value: 0.5 },
          {
            label: "Durability focus",
            description: "Allow larger long sessions when appropriate.",
            value: 0.7,
          },
        ]}
      />
    </>
  );
}
