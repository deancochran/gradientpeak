import type { ReactNode } from "react";
import {
  type TrainingPathChartSectionContext,
  TrainingPathLoadChartSection,
} from "@/components/plan/training-path/TrainingPathLoadChartSection";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import { omitUndefined } from "@/lib/omitUndefined";

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
};

export function BuilderTrainingPathReviewSection({
  chartHeight = 280,
  chartReview,
  renderBelowChart,
}: BuilderTrainingPathReviewSectionProps) {
  const startDateKey = chartReview.chart.dailyPoints[0]?.date;

  return (
    <TrainingPathLoadChartSection
      {...omitUndefined({ renderBelowChart })}
      dailyPoints={chartReview.chart.dailyPoints}
      chartHeight={chartHeight}
      dailyDateLabelFormatter={(dateKey, index) =>
        formatRelativeWeekDay(dateKey, index, startDateKey)
      }
      model={chartReview.chart}
      onDisplayedWeekChange={chartReview.selectWeekStart}
      selectedDate={chartReview.selectedDate}
      onSelectedDateChange={chartReview.selectDate}
      onSelectedWeekChange={chartReview.selectWeekStart}
    />
  );
}
