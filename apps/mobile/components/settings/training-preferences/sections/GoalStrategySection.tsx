import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import type { Control } from "react-hook-form";
import { PreferenceChoiceField } from "./PreferenceChoiceField";

type GoalStrategySectionProps = {
  control: Control<AthleteTrainingSettingsFormInput>;
};

export function GoalStrategySection({ control }: GoalStrategySectionProps) {
  return (
    <>
      <PreferenceChoiceField
        control={control}
        label="Goal cushion"
        description="Choose whether plans should slightly exceed goal requirements."
        name="goal_strategy_preferences.target_surplus_preference"
        testID="preferences-target-surplus"
        options={[
          { label: "Exact", description: "Aim close to stated goal requirements.", value: 0.0 },
          { label: "Small cushion", description: "Build in a little extra capacity.", value: 0.25 },
          {
            label: "Bigger cushion",
            description: "Prefer extra readiness when recovery allows.",
            value: 0.45,
          },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Goal priority tradeoff"
        description="Set how much the planner may favor higher-priority goals."
        name="goal_strategy_preferences.priority_tradeoff_preference"
        testID="preferences-priority-tradeoff"
        options={[
          {
            label: "Keep balanced",
            description: "Avoid sacrificing lower-priority goals too much.",
            value: 0.35,
          },
          { label: "Balanced", description: "Use priority as one input among others.", value: 0.5 },
          {
            label: "Favor priority",
            description: "Let top-priority goals win more tradeoffs.",
            value: 0.7,
          },
        ]}
      />
      <PreferenceChoiceField
        control={control}
        label="Taper style"
        description="Choose how protective the plan should be before goal events."
        name="goal_strategy_preferences.taper_style_preference"
        testID="preferences-taper-style"
        options={[
          { label: "Subtle", description: "Keep training steadier before goals.", value: 0.35 },
          { label: "Balanced", description: "Use a moderate taper.", value: 0.5 },
          {
            label: "Protective",
            description: "Reduce load more before important goals.",
            value: 0.75,
          },
        ]}
      />
    </>
  );
}
