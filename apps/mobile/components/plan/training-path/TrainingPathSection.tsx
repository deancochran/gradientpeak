import { View } from "react-native";
import type { DailyTrainingAdjustmentPoint } from "./DailyTrainingAdjustmentChart";
import {
  type TrainingPathLedgerSelection,
  TrainingPathLoadChartSection,
} from "./TrainingPathLoadChartSection";
import type { PlanTrainingChartRange, TrainingPathViewModel } from "./trainingPathTypes";

type TrainingPathSectionProps = {
  model: TrainingPathViewModel;
  dailyPoints?: DailyTrainingAdjustmentPoint[];
  selectedDate?: string | null;
  chartLoading?: boolean;
  chartUnavailable?: boolean;
  chartHeight?: number;
  chartRange?: PlanTrainingChartRange;
  onChartRangeChange?: (range: PlanTrainingChartRange) => void;
  onCreateGoal?: () => void;
  onViewDetails: (selection: TrainingPathLedgerSelection) => void;
  onSelectedWeekChange: (weekStart: string) => void;
  onSelectedDateChange?: (date: string) => void;
};

export function TrainingPathSection({
  model,
  dailyPoints,
  selectedDate,
  chartLoading = false,
  chartUnavailable = false,
  chartHeight = 300,
  chartRange,
  onCreateGoal,
  onChartRangeChange,
  onViewDetails,
  onSelectedWeekChange,
  onSelectedDateChange,
}: TrainingPathSectionProps) {
  return (
    <View className="min-h-0 flex-1" testID="training-path-section">
      <TrainingPathLoadChartSection
        dailyPoints={dailyPoints}
        dailyDensity="compact"
        chartHeight={chartHeight}
        chartRange={chartRange}
        fillAvailableHeight
        emptyState={
          chartUnavailable
            ? {
                body: "Check your connection and try again.",
                title: "Error loading plan information",
                tone: "unavailable",
              }
            : undefined
        }
        loading={chartLoading}
        model={model}
        onCreateGoal={onCreateGoal}
        onChartRangeChange={onChartRangeChange}
        onViewDetails={onViewDetails}
        selectedDate={selectedDate}
        selectionMode="day"
        showInlineLegend={false}
        showSelectedPointTray={false}
        onSelectedDateChange={onSelectedDateChange}
        onSelectedWeekChange={onSelectedWeekChange}
      />
    </View>
  );
}
