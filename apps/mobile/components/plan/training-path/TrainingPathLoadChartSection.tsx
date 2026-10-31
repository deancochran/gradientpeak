import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Info, Plus } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { omitUndefined } from "@/lib/omitUndefined";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import {
  formatPlanChartDateLabel,
  getDailyTrainingAdjustmentPlannedLoad,
  getDailyTrainingAdjustmentPlannedLoadStatus,
  hasRenderableDailyTrainingAdjustmentData,
} from "./dailyTrainingAdjustmentChartPresentation";
import { TrainingPathChart } from "./TrainingPathChart";
import { TrainingPathLegend } from "./TrainingPathLegend";
import {
  buildSelectedWeekBucket,
  type TrainingPathSelectedWeekBucket,
} from "./trainingPathSelectedWeekBucket";
import type { TrainingPathViewModel } from "./trainingPathTypes";

type ChartEmptyTone = "empty" | "loading" | "unavailable";
type DailyPoint = ComponentProps<typeof DailyTrainingAdjustmentChart>["points"][number];
type SelectedWeekBucket = TrainingPathSelectedWeekBucket<DailyPoint>;

export type TrainingPathChartSectionContext = {
  mode: "day";
  selectedDate: string | null;
  selectedDayPoint: DailyPoint | null;
  selectedWeek: TrainingPathViewModel["weeks"][number] | null;
  selectedWeekBucket: SelectedWeekBucket | null;
  selectedWeekStart: string | null;
};

type TrainingPathLoadChartSectionProps = {
  chartHeight?: number;
  dailyPoints?: ComponentProps<typeof DailyTrainingAdjustmentChart>["points"];
  dailyTestID?: string;
  dailyDateLabelFormatter?: ComponentProps<typeof DailyTrainingAdjustmentChart>["formatDateLabel"];
  emptyState?: { body?: string; title: string; tone?: ChartEmptyTone };
  goalDates?: readonly string[];
  loading?: boolean;
  model?: TrainingPathViewModel | null;
  onCreateGoal?: () => void;
  onDisplayedWeekChange?: (weekStart: string) => void;
  onSelectedDateChange?: (date: string) => void;
  onSelectedWeekChange?: (weekStart: string) => void;
  renderBelowChart?: (context: TrainingPathChartSectionContext) => ReactNode;
  selectedDate?: string | null;
  testID?: string;
};

const modelEmptyStateCopy: Record<NonNullable<TrainingPathViewModel["emptyState"]>, string> = {
  noGoal: "Add a goal to see your training path.",
  noActivityHistory: "Complete a few activities to calibrate your fitness path.",
  noPlannedSessions: "Training path is still being calculated.",
  noProjection: "Training path is still being calculated.",
};

function positiveValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasRenderableWeeklyTrainingPathData(model: TrainingPathViewModel | null | undefined) {
  return (
    model?.weeks.some(
      (week) =>
        week.completedLoadUnavailable === true ||
        positiveValue(week.effectiveCompletedLoad) ||
        positiveValue(week.effectiveRemainingLoad) ||
        (typeof week.fitness === "number" && Number.isFinite(week.fitness)) ||
        (typeof week.scheduledFitness === "number" && Number.isFinite(week.scheduledFitness)),
    ) === true
  );
}

export const TrainingPathLoadChartSection = memo(function TrainingPathLoadChartSection({
  chartHeight = 300,
  dailyDateLabelFormatter,
  dailyPoints,
  dailyTestID = "training-path-daily-adjustment-chart",
  emptyState,
  goalDates,
  loading = false,
  model,
  onCreateGoal,
  onDisplayedWeekChange,
  onSelectedDateChange,
  onSelectedWeekChange,
  renderBelowChart,
  selectedDate,
  testID = "training-path-load-chart-section",
}: TrainingPathLoadChartSectionProps) {
  const [previewSelectedDate, setPreviewSelectedDate] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const canRenderDailyChart = hasRenderableDailyTrainingAdjustmentData(dailyPoints ?? []);
  const canRenderWeeklyChart =
    !!model && !!onSelectedWeekChange && hasRenderableWeeklyTrainingPathData(model);
  const hasRenderableChart = canRenderDailyChart || canRenderWeeklyChart;
  const modelEmptyState = loading || hasRenderableChart ? null : (model?.emptyState ?? null);
  const resolvedEmptyState =
    loading && !hasRenderableChart
      ? { title: "Loading training path…", tone: "loading" as const }
      : (emptyState ??
        (modelEmptyState
          ? { title: modelEmptyStateCopy[modelEmptyState], tone: "empty" as const }
          : undefined));
  const contextSelectedDate = previewSelectedDate ?? selectedDate;
  const selectedDayPoint =
    dailyPoints?.find((point) => point.date === contextSelectedDate) ?? dailyPoints?.[0] ?? null;
  const selectedWeek =
    model?.weeks.find(
      (week) =>
        !!selectedDayPoint &&
        selectedDayPoint.date >= week.weekStart &&
        selectedDayPoint.date <= week.weekEnd,
    ) ??
    model?.weeks.find((week) => week.isSelected) ??
    null;
  const context = useMemo<TrainingPathChartSectionContext>(
    () => ({
      mode: "day",
      selectedDate: selectedDayPoint?.date ?? contextSelectedDate ?? null,
      selectedDayPoint,
      selectedWeek,
      selectedWeekBucket: selectedWeek
        ? buildSelectedWeekBucket({
            points: dailyPoints ?? [],
            weekEnd: selectedWeek.weekEnd,
            weekStart: selectedWeek.weekStart,
          })
        : null,
      selectedWeekStart: selectedWeek?.weekStart ?? model?.selectedWeekSummary?.weekStart ?? null,
    }),
    [
      contextSelectedDate,
      dailyPoints,
      model?.selectedWeekSummary?.weekStart,
      selectedDayPoint,
      selectedWeek,
    ],
  );

  useEffect(() => {
    if (selectedDate !== undefined) setPreviewSelectedDate(null);
  }, [selectedDate]);

  return (
    <View className="gap-3" testID={testID}>
      {resolvedEmptyState ? (
        <ChartEmptyState
          {...resolvedEmptyState}
          minHeight={chartHeight}
          {...omitUndefined({
            onCreateGoal: !emptyState && modelEmptyState === "noGoal" ? onCreateGoal : undefined,
          })}
          testID="training-path-empty-state"
        />
      ) : canRenderDailyChart ? (
        <DailyTrainingAdjustmentChart
          {...omitUndefined({ formatDateLabel: dailyDateLabelFormatter, goalDates })}
          height={chartHeight}
          points={dailyPoints ?? []}
          {...omitUndefined({
            selectedDate: selectedDate ?? model?.todayKey,
            todayDate: model?.todayKey,
          })}
          onPreviewSelectedDateChange={setPreviewSelectedDate}
          {...omitUndefined({ onSelectedDateChange })}
          testID={dailyTestID}
        />
      ) : canRenderWeeklyChart ? (
        <TrainingPathChart
          height={chartHeight}
          model={model}
          scrollX
          {...omitUndefined({ onDisplayedWeekChange })}
          onSelectedWeekChange={onSelectedWeekChange}
        />
      ) : (
        <ChartEmptyState
          minHeight={chartHeight}
          testID="training-path-empty-state"
          title="Training path is still being calculated."
        />
      )}
      {!resolvedEmptyState && hasRenderableChart ? (
        <>
          <TouchableOpacity
            accessibilityLabel={`${legendOpen ? "Hide" : "Show"} chart legend`}
            accessibilityRole="button"
            accessibilityState={{ expanded: legendOpen }}
            className="min-h-11 self-start flex-row items-center gap-2 rounded-xl border border-border px-3"
            onPress={() => setLegendOpen((open) => !open)}
            testID="training-path-legend-button"
          >
            <Icon as={Info} className="text-muted-foreground" size={16} />
            <Text className="text-xs font-semibold text-foreground">Legend</Text>
          </TouchableOpacity>
          {legendOpen ? (
            <TrainingPathLegend mode={canRenderDailyChart ? "daily" : "weekly"} />
          ) : null}
          {canRenderDailyChart ? <SelectedPeriodSummary point={selectedDayPoint} /> : null}
        </>
      ) : null}
      {renderBelowChart ? renderBelowChart(context) : null}
    </View>
  );
});

function formatSummaryValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function SelectedPeriodSummary({ point }: { point: DailyPoint | null }) {
  if (!point) return null;
  const planned = getDailyTrainingAdjustmentPlannedLoad(point);
  const plannedStatus = getDailyTrainingAdjustmentPlannedLoadStatus(point);
  const facts = [
    [
      "Completed load",
      point.effectiveCompletedLoadStatus === "known_zero"
        ? "0 · No completed load"
        : formatSummaryValue(point.effectiveCompletedLoad),
    ] as const,
    [
      "Planned load",
      plannedStatus === "known_zero"
        ? "0 · No planned load"
        : plannedStatus === "unavailable" && planned === null
          ? "Not available"
          : formatSummaryValue(planned),
    ] as const,
  ];
  return (
    <View className="gap-2 border-t border-border px-1 pt-3" testID="training-path-period-summary">
      <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
        Day · {formatPlanChartDateLabel(point.date, "daily")}
      </Text>
      <View className="flex-row flex-wrap gap-x-4 gap-y-2">
        {facts.map(([label, value]) => (
          <View
            accessible
            accessibilityLabel={`${label}: ${value}`}
            className="min-w-[28%] flex-1"
            key={label}
          >
            <Text className="text-[10px] text-muted-foreground">{label}</Text>
            <Text className="text-sm font-semibold text-foreground">{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ChartEmptyState({
  body,
  minHeight,
  onCreateGoal,
  testID,
  title,
  tone = "empty",
}: {
  body?: string;
  minHeight: number;
  onCreateGoal?: () => void;
  testID: string;
  title: string;
  tone?: ChartEmptyTone;
}) {
  return (
    <View
      className="items-center justify-center rounded-2xl bg-muted/20 px-4"
      style={{ minHeight }}
      testID={testID}
    >
      {tone === "loading" ? <ActivityIndicator size="small" /> : null}
      <Text className="text-center text-sm font-medium text-muted-foreground">{title}</Text>
      {body ? <Text className="mt-1 text-center text-xs text-muted-foreground">{body}</Text> : null}
      {onCreateGoal ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Create goal"
          activeOpacity={0.85}
          className="mt-3 min-h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-4 py-2"
          onPress={onCreateGoal}
          testID="plan-add-goal-button"
        >
          <Icon as={Plus} size={14} className="text-primary-foreground" />
          <Text className="text-xs font-semibold text-primary-foreground">Add goal</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
