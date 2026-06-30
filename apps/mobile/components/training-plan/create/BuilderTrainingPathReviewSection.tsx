import type { ReactNode } from "react";
import {
  type TrainingPathChartSectionContext,
  TrainingPathLoadChartSection,
} from "@/components/plan/training-path/TrainingPathLoadChartSection";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

type BuilderTrainingPathReviewSectionProps = {
  chartHeight?: number;
  chartReview: TrainingPlanBuilderController["chartReview"];
  onOpenSettings?: () => void;
  renderBelowChart?: (context: TrainingPathChartSectionContext) => ReactNode;
  title?: string;
};

export function BuilderTrainingPathReviewSection({
  chartHeight = 280,
  chartReview,
  onOpenSettings,
  renderBelowChart,
  title = "Weekly Training Path",
}: BuilderTrainingPathReviewSectionProps) {
  return (
    <TrainingPathLoadChartSection
      dailyPoints={chartReview.chart.dailyPoints}
      dailyDensity="detail"
      chartHeight={chartHeight}
      model={chartReview.chart}
      onDisplayedWeekChange={chartReview.selectWeekStart}
      onScrollNearEnd={chartReview.extendEnd}
      onScrollNearStart={chartReview.extendStart}
      onOpenSettings={onOpenSettings}
      renderBelowChart={renderBelowChart}
      selectedDate={chartReview.selectedDate}
      selectionMode="day"
      onSelectedDateChange={chartReview.selectDate}
      onSelectedWeekChange={chartReview.selectWeekStart}
      showHeader={false}
      showSelectedPointTray={false}
      title={title === "Weekly Training Path" ? "Daily Training Path" : title}
    />
  );
}
