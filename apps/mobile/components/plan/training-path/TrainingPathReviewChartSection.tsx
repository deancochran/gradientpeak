import type { ComponentProps } from "react";
import type { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import { TrainingPathLoadChartSection } from "./TrainingPathLoadChartSection";
import type { TrainingPathViewModel } from "./trainingPathTypes";

type TrainingPathReviewChartSectionProps = {
  chartHeight?: number;
  dailyPoints?: ComponentProps<typeof DailyTrainingAdjustmentChart>["points"];
  model: TrainingPathViewModel;
  onSelectedDateChange?: (date: string) => void;
  onCreateGoal?: () => void;
  onDisplayedWeekChange?: (weekStart: string) => void;
  onOpenSettings?: () => void;
  onScrollInteractionSettled?: () => void;
  onScrollInteractionStart?: () => void;
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  onSelectedWeekChange: (weekStart: string) => void;
  selectedDate?: string | null;
  showHeader?: boolean;
  showSelectedPointTray?: boolean;
  title?: string;
};

export function TrainingPathReviewChartSection({
  chartHeight = 300,
  dailyPoints,
  model,
  onCreateGoal,
  onDisplayedWeekChange,
  onOpenSettings,
  onSelectedDateChange,
  onScrollInteractionSettled,
  onScrollInteractionStart,
  onScrollNearEnd,
  onScrollNearStart,
  onSelectedWeekChange,
  selectedDate,
  showHeader = true,
  showSelectedPointTray = true,
  title = "Daily Training Path",
}: TrainingPathReviewChartSectionProps) {
  return (
    <TrainingPathLoadChartSection
      chartHeight={chartHeight}
      dailyDensity="standard"
      dailyPoints={dailyPoints}
      dailyTestID="training-path-daily-adjustment-chart"
      model={model}
      onCreateGoal={onCreateGoal}
      onDisplayedWeekChange={onDisplayedWeekChange}
      onOpenSettings={onOpenSettings}
      onScrollInteractionSettled={onScrollInteractionSettled}
      onScrollInteractionStart={onScrollInteractionStart}
      onScrollNearEnd={onScrollNearEnd}
      onScrollNearStart={onScrollNearStart}
      onSelectedDateChange={onSelectedDateChange}
      onSelectedWeekChange={onSelectedWeekChange}
      selectedDate={selectedDate}
      showHeader={showHeader}
      showSelectedPointTray={showSelectedPointTray}
      testID="training-path-review-chart-section"
      title={title}
    />
  );
}
