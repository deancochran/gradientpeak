import type { AthleteTrainingSettings } from "@repo/core";
import { TrainingPreferencesSummaryCard as CoreTrainingPreferencesSummaryCard } from "@repo/ui/components/training-preferences-summary-card";

interface TrainingPreferencesSummaryCardProps {
  settings: AthleteTrainingSettings;
  onOpen: () => void;
}

export function TrainingPreferencesSummaryCard({
  settings,
  onOpen,
}: TrainingPreferencesSummaryCardProps) {
  return (
    <CoreTrainingPreferencesSummaryCard
      items={[
        {
          label: "Progression pace",
          value: `${(settings.training_style.progression_pace * 100).toFixed(0)}%`,
        },
        {
          label: "Recovery priority",
          value: `${(settings.recovery_preferences.recovery_priority * 100).toFixed(0)}%`,
        },
        {
          label: "Target surplus preference",
          value: `${(settings.goal_strategy_preferences.target_surplus_preference * 100).toFixed(0)}%`,
        },
      ]}
      onActionPress={onOpen}
    />
  );
}
