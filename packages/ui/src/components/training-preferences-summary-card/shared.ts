export interface TrainingPreferenceSummaryItem {
  label: string;
  value: string;
}

export interface TrainingPreferencesSummaryCardProps {
  actionLabel?: string;
  items: TrainingPreferenceSummaryItem[];
  onActionPress: () => void;
  title?: string;
}
