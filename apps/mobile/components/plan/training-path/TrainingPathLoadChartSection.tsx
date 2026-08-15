import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ChevronDown, HelpCircle, Plus, Settings } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import {
  aggregateDailyTrainingAdjustmentPoints,
  formatPlanChartDateLabel,
  getPlanChartBucketDate,
  hasRenderableDailyTrainingAdjustmentData,
} from "./dailyTrainingAdjustmentChartPresentation";
import { TrainingPathChart } from "./TrainingPathChart";
import { TrainingPathLegend } from "./TrainingPathLegend";
import {
  buildSelectedWeekBucket,
  type TrainingPathSelectedWeekBucket,
} from "./trainingPathSelectedWeekBucket";
import type { PlanTrainingChartRange, TrainingPathViewModel } from "./trainingPathTypes";

type ChartEmptyTone = "empty" | "loading" | "unavailable";
type TrainingPathSelectionMode = "day" | "week";
type DailyPoint = ComponentProps<typeof DailyTrainingAdjustmentChart>["points"][number];
type SelectedWeekBucket = TrainingPathSelectedWeekBucket<DailyPoint>;

export type TrainingPathChartSectionContext = {
  mode: TrainingPathSelectionMode;
  selectedDate: string | null;
  selectedDayPoint: DailyPoint | null;
  selectedWeek: TrainingPathViewModel["weeks"][number] | null;
  selectedWeekBucket: SelectedWeekBucket | null;
  selectedWeekStart: string | null;
};

export type TrainingPathLedgerSelection = {
  period: "day" | "week" | "month";
  anchorDate: string;
};

type TrainingPathLoadChartSectionProps = {
  chartRange?: PlanTrainingChartRange;
  onChartRangeChange?: (range: PlanTrainingChartRange) => void;
  chartHeight?: number;
  dailyDensity?: ComponentProps<typeof DailyTrainingAdjustmentChart>["density"];
  dailyPoints?: ComponentProps<typeof DailyTrainingAdjustmentChart>["points"];
  dailyTestID?: string;
  dailyDateLabelFormatter?: ComponentProps<typeof DailyTrainingAdjustmentChart>["formatDateLabel"];
  preferDailyChart?: boolean;
  renderBelowChart?: (context: TrainingPathChartSectionContext) => ReactNode;
  selectionMode?: TrainingPathSelectionMode;
  emptyState?: {
    body?: string;
    title: string;
    tone?: ChartEmptyTone;
  };
  model?: TrainingPathViewModel | null;
  loading?: boolean;
  onCreateGoal?: () => void;
  onDisplayedWeekChange?: (weekStart: string) => void;
  onOpenSettings?: () => void;
  onViewDetails?: (selection: TrainingPathLedgerSelection) => void;
  onScrollInteractionSettled?: () => void;
  onScrollInteractionStart?: () => void;
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  onSelectedDateChange?: (date: string) => void;
  onSelectedWeekChange?: (weekStart: string) => void;
  selectedDate?: string | null;
  showHeader?: boolean;
  showAnalysisControls?: boolean;
  showInlineLegend?: boolean;
  showLegendButton?: boolean;
  showSelectedPointTray?: boolean;
  testID?: string;
  title?: string;
};

const rangeOptions: Array<{ label: string; value: PlanTrainingChartRange }> = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

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
        (typeof week.scheduledFitness === "number" && Number.isFinite(week.scheduledFitness)) ||
        (typeof week.fatigue === "number" && Number.isFinite(week.fatigue)),
    ) === true
  );
}

export const TrainingPathLoadChartSection = memo(function TrainingPathLoadChartSection({
  chartRange: controlledChartRange,
  chartHeight = 300,
  dailyDensity = "standard",
  dailyDateLabelFormatter,
  dailyPoints,
  dailyTestID = "training-path-daily-adjustment-chart",
  emptyState,
  model,
  loading = false,
  onCreateGoal,
  onChartRangeChange,
  onDisplayedWeekChange,
  onOpenSettings,
  onViewDetails,
  onScrollInteractionSettled,
  onScrollInteractionStart,
  onScrollNearEnd,
  onScrollNearStart,
  onSelectedDateChange,
  onSelectedWeekChange,
  preferDailyChart = true,
  renderBelowChart,
  selectionMode = "day",
  selectedDate,
  showHeader = true,
  showAnalysisControls,
  showInlineLegend = true,
  showLegendButton = true,
  showSelectedPointTray = true,
  testID = "training-path-load-chart-section",
  title = "Training Analysis",
}: TrainingPathLoadChartSectionProps) {
  const [legendOpen, setLegendOpen] = useState(false);
  const [previewSelectedDate, setPreviewSelectedDate] = useState<string | null>(null);
  const [localChartRange, setLocalChartRange] = useState<PlanTrainingChartRange>("daily");
  const chartRange = controlledChartRange ?? localChartRange;
  const setChartRange = onChartRangeChange ?? setLocalChartRange;
  const analysisControlsVisible = showAnalysisControls ?? showHeader;
  const displayedDailyPoints = useMemo(
    () => aggregateDailyTrainingAdjustmentPoints(dailyPoints ?? [], chartRange),
    [chartRange, dailyPoints],
  );
  const chartSelectedDate = selectedDate
    ? getPlanChartBucketDate(selectedDate, chartRange)
    : selectedDate;
  const chartTodayDate = model?.todayKey
    ? getPlanChartBucketDate(model.todayKey, chartRange)
    : null;
  const canRenderDailyChart =
    preferDailyChart && hasRenderableDailyTrainingAdjustmentData(displayedDailyPoints);
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
  const summarySelectedDate = contextSelectedDate
    ? getPlanChartBucketDate(contextSelectedDate, chartRange)
    : chartSelectedDate;
  const detailsAnchorDate =
    contextSelectedDate ?? selectedDate ?? model?.todayKey ?? displayedDailyPoints[0]?.date ?? null;
  const detailsPeriod = chartRange === "daily" ? "day" : chartRange === "weekly" ? "week" : "month";

  useEffect(() => {
    setPreviewSelectedDate((current) => (selectedDate === undefined ? current : null));
  }, [selectedDate]);

  const belowChartContext = useMemo<TrainingPathChartSectionContext>(() => {
    const selectedDayPoint =
      dailyPoints?.find((point) => point.date === contextSelectedDate) ?? dailyPoints?.[0] ?? null;
    const selectedWeek =
      model?.weeks.find((week) => {
        if (selectionMode === "week") {
          return week.isSelected || week.weekStart === model.selectedWeekSummary?.weekStart;
        }
        const date = selectedDayPoint?.date ?? contextSelectedDate;
        return !!date && date >= week.weekStart && date <= week.weekEnd;
      }) ??
      model?.weeks.find((week) => week.isSelected) ??
      null;
    const selectedWeekStart =
      selectedWeek?.weekStart ?? model?.selectedWeekSummary?.weekStart ?? null;
    const selectedWeekBucket = selectedWeek
      ? buildSelectedWeekBucket({
          points: dailyPoints ?? [],
          weekEnd: selectedWeek.weekEnd,
          weekStart: selectedWeek.weekStart,
        })
      : null;

    return {
      mode: selectionMode,
      selectedDate: selectedDayPoint?.date ?? contextSelectedDate ?? null,
      selectedDayPoint,
      selectedWeek,
      selectedWeekBucket,
      selectedWeekStart,
    };
  }, [contextSelectedDate, dailyPoints, model, selectionMode]);

  return (
    <View className="gap-4" testID={testID}>
      {showHeader ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
              {analysisControlsVisible ? (
                <ChartDropdown
                  accessibilityLabel="Training range"
                  options={rangeOptions}
                  selectedValue={chartRange}
                  onSelect={setChartRange}
                  testID="training-path-range-dropdown"
                  triggerLabel={`${rangeOptions.find((option) => option.value === chartRange)?.label ?? "Daily"} Training`}
                />
              ) : (
                <Text className="text-sm font-semibold text-foreground">{title}</Text>
              )}
              {showLegendButton ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open training path legend"
                  activeOpacity={0.85}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  onPress={() => setLegendOpen(true)}
                  testID="training-path-legend-button"
                >
                  <Icon as={HelpCircle} size={15} className="text-muted-foreground" />
                </TouchableOpacity>
              ) : null}
            </View>
            {onOpenSettings ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Edit training preferences"
                activeOpacity={0.85}
                className="h-11 w-11 items-center justify-center rounded-full border border-border bg-background"
                onPress={onOpenSettings}
                testID="training-path-settings-button"
              >
                <Icon as={Settings} size={15} className="text-muted-foreground" />
              </TouchableOpacity>
            ) : null}
          </View>
          {analysisControlsVisible && chartRange === "monthly" ? (
            <Text
              accessibilityLabel="Monthly view uses only the loaded bounded Plan window"
              className="px-1 text-[10px] text-muted-foreground"
            >
              Monthly totals use the loaded, bounded Plan window.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="gap-3">
        {resolvedEmptyState ? (
          <ChartEmptyState
            body={resolvedEmptyState.body}
            minHeight={chartHeight}
            onCreateGoal={!emptyState && modelEmptyState === "noGoal" ? onCreateGoal : undefined}
            testID="training-path-empty-state"
            title={resolvedEmptyState.title}
            tone={resolvedEmptyState.tone}
          />
        ) : canRenderDailyChart ? (
          <DailyTrainingAdjustmentChart
            density={dailyDensity}
            height={chartHeight}
            formatDateLabel={chartRange === "daily" ? dailyDateLabelFormatter : undefined}
            points={displayedDailyPoints}
            range={chartRange}
            selectedDate={chartSelectedDate ?? chartTodayDate}
            showSelectedPointTray={showSelectedPointTray}
            todayDate={chartTodayDate}
            onPreviewSelectedDateChange={setPreviewSelectedDate}
            onScrollNearEnd={onScrollNearEnd}
            onScrollNearStart={onScrollNearStart}
            onSelectedDateChange={onSelectedDateChange}
            testID={dailyTestID}
          />
        ) : canRenderWeeklyChart ? (
          <TrainingPathChart
            model={model}
            range="season"
            height={chartHeight}
            scrollX
            reviewWeeks
            onScrollNearEnd={onScrollNearEnd}
            onScrollNearStart={onScrollNearStart}
            onScrollInteractionSettled={onScrollInteractionSettled}
            onScrollInteractionStart={onScrollInteractionStart}
            onDisplayedWeekChange={onDisplayedWeekChange}
            onSelectedWeekChange={onSelectedWeekChange}
          />
        ) : (
          <ChartEmptyState
            minHeight={chartHeight}
            testID="training-path-empty-state"
            title="Training path is still being calculated."
            tone="empty"
          />
        )}
        {showInlineLegend &&
        !resolvedEmptyState &&
        (canRenderDailyChart || canRenderWeeklyChart) ? (
          <TrainingPathLegend
            mode={canRenderDailyChart ? "daily" : "weekly"}
            range="season"
            showUnavailableLoad={
              dailyPoints?.some((point) => point.hasCompletedActivityWithoutLoad === true) ?? false
            }
            variant="primary"
          />
        ) : null}
        {canRenderDailyChart ? (
          <SelectedPeriodSummary
            point={
              displayedDailyPoints.find((point) => point.date === summarySelectedDate) ??
              displayedDailyPoints[0] ??
              null
            }
            period={detailsPeriod}
          />
        ) : null}
        {onViewDetails && detailsAnchorDate && hasRenderableChart ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`View ${detailsPeriod} planning ledger details`}
            activeOpacity={0.85}
            className="min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5"
            onPress={() =>
              onViewDetails({
                period: detailsPeriod,
                anchorDate: getPlanChartBucketDate(detailsAnchorDate, chartRange),
              })
            }
            testID="training-path-view-details"
          >
            <Text className="text-sm font-semibold text-foreground">View details</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {renderBelowChart && !analysisControlsVisible ? renderBelowChart(belowChartContext) : null}

      {legendOpen ? (
        <AppFormModal
          description="How to read the daily training path chart."
          onClose={() => setLegendOpen(false)}
          testID="training-path-legend-modal"
          title="Chart Legend"
        >
          <View className="gap-4 px-1 py-2">
            <TrainingPathLegend mode={canRenderDailyChart ? "daily" : "weekly"} range="season" />
          </View>
        </AppFormModal>
      ) : null}
    </View>
  );
});

function formatSummaryValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "Unavailable";
}

function SelectedPeriodSummary({
  period,
  point,
}: {
  period: TrainingPathLedgerSelection["period"];
  point: DailyPoint | null;
}) {
  if (!point) return null;
  const periodName = period === "day" ? "Day" : period === "week" ? "Week" : "Month";
  const range = period === "day" ? "daily" : period === "week" ? "weekly" : "monthly";
  const status =
    point.effectiveLoadStatus === "unavailable"
      ? "Load unavailable"
      : point.hasCompletedActivityWithoutLoad
        ? "Completed activity load unavailable"
        : null;
  const facts = [
    ["Completed load", formatSummaryValue(point.effectiveCompletedLoad)],
    ["Planned load", formatSummaryValue(point.plannedLoad ?? point.effectiveRemainingLoad)],
    ["Actual fitness", formatSummaryValue(point.fitnessCtl)],
    ["Planned fitness", formatSummaryValue(point.scheduledFitnessCtl)],
    ["Actual fatigue", formatSummaryValue(point.actualFatigueAtl)],
    ["Planned fatigue", formatSummaryValue(point.scheduledFatigueAtl)],
  ] as const;

  return (
    <View className="gap-2 border-t border-border px-1 pt-3" testID="training-path-period-summary">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
          {periodName} · {formatPlanChartDateLabel(point.date, range)}
        </Text>
        {status ? (
          <Text className="text-xs font-medium text-muted-foreground">{status}</Text>
        ) : null}
      </View>
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

function ChartDropdown<T extends string>({
  accessibilityLabel,
  onSelect,
  options,
  selectedValue,
  testID,
  triggerLabel,
}: {
  accessibilityLabel: string;
  onSelect: (value: T) => void;
  options: Array<{ label: string; value: T; unavailableReason?: string }>;
  selectedValue: T;
  testID: string;
  triggerLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityLabel={accessibilityLabel}
        className="min-h-11 flex-row items-center gap-1 rounded-lg px-1.5"
        testID={`${testID}-trigger`}
      >
        <Text className="text-sm font-semibold text-foreground">{triggerLabel}</Text>
        <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        {options.map((option) => {
          const disabled = !!option.unavailableReason;
          return (
            <DropdownMenuItem
              key={option.value}
              accessibilityHint={option.unavailableReason}
              accessibilityLabel={`${option.label}${disabled ? ", unavailable" : ""}`}
              accessibilityState={{ disabled, selected: option.value === selectedValue }}
              disabled={disabled}
              onPress={() => onSelect(option.value)}
              testID={`${testID}-${option.value}`}
            >
              <Text className="text-foreground">{option.label}</Text>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
