import type { ReactNode } from "react";
import {
  type TrainingPathChartSectionContext,
  TrainingPathLoadChartSection,
} from "@/components/plan/training-path/TrainingPathLoadChartSection";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";

function resolveDayOffset(dateKey: string, startDateKey: string | undefined) {
  if (!startDateKey) return undefined;
  const date = Date.parse(`${dateKey}T00:00:00Z`);
  const start = Date.parse(`${startDateKey}T00:00:00Z`);
  if (!Number.isFinite(date) || !Number.isFinite(start)) return undefined;
  return Math.max(0, Math.round((date - start) / 86_400_000));
}

function formatRelativeWeekDay(dateKey: string, index: number, startDateKey: string | undefined) {
  const offset = resolveDayOffset(dateKey, startDateKey) ?? index;
  return `W${Math.floor(offset / 7) + 1} D${(offset % 7) + 1}`;
}

type BuilderTrainingPathReviewSectionProps = {
  chartHeight?: number;
  chartReview: TrainingPlanBuilderController["chartReview"];
  renderBelowChart?: (context: TrainingPathChartSectionContext) => ReactNode;
  title?: string;
};

export function BuilderTrainingPathReviewSection({
  chartHeight = 280,
  chartReview,
  renderBelowChart,
  title = "Weekly Training Path",
}: BuilderTrainingPathReviewSectionProps) {
  const startDateKey = chartReview.chart.dailyPoints[0]?.date;

  return (
    <TrainingPathLoadChartSection
      dailyPoints={chartReview.chart.dailyPoints}
      dailyDensity="detail"
      chartHeight={chartHeight}
      dailyDateLabelFormatter={(dateKey, index) =>
        formatRelativeWeekDay(dateKey, index, startDateKey)
      }
      model={chartReview.chart}
      onDisplayedWeekChange={chartReview.selectWeekStart}
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
