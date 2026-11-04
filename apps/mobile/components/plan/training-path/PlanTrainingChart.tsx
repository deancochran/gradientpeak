import type { PlanAnalysisWindowPeriod } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { ChartRangeModal } from "@/components/charts/ChartRangeModal";
import { omitUndefined } from "@/lib/omitUndefined";
import {
  DailyTrainingAdjustmentChart,
  type DailyTrainingAdjustmentPoint,
  type PlanLoadGoalMarker,
} from "./DailyTrainingAdjustmentChart";
import {
  aggregateDailyTrainingAdjustmentPoints,
  getPlanChartBucketDate,
} from "./dailyTrainingAdjustmentChartPresentation";
import { TrainingPathLegend } from "./TrainingPathLegend";
import type { PlanTrainingChartRange, PlanTrainingTrendLine } from "./trainingPathTypes";

const ranges: ReadonlyArray<{ label: string; value: PlanAnalysisWindowPeriod }> = [
  { label: "6W", value: "6w" },
  { label: "3M", value: "3m" },
  { label: "6M", value: "6m" },
  { label: "1Y", value: "1y" },
];

const bins: ReadonlyArray<{ label: string; value: PlanTrainingChartRange }> = [
  { label: "Day", value: "daily" },
  { label: "Week", value: "weekly" },
];

const trends: ReadonlyArray<{ label: string; value: PlanTrainingTrendLine }> = [
  { label: "Fitness", value: "fitness" },
  { label: "Fatigue", value: "fatigue" },
  { label: "Form", value: "form" },
];

export type PlanTrainingChartProps = {
  analysisAnchor: string;
  analysisPeriod: PlanAnalysisWindowPeriod;
  analysisWindowLoading: boolean;
  dailyPoints: DailyTrainingAdjustmentPoint[];
  todayKey: string;
  selectedDate: string;
  binning: PlanTrainingChartRange;
  onBinningChange: (range: PlanTrainingChartRange) => void;
  onPeriodShift: (direction: -1 | 1) => void;
  onRangeChange: (period: PlanAnalysisWindowPeriod) => void;
  onRangeToday: () => void;
  onSelectedDateChange: (date: string) => void;
  goalMarkers?: readonly PlanLoadGoalMarker[];
  primaryGoalId?: string | null;
  onGoalPress?: (goalId: string) => void;
  formatDateLabel?: (date: string, index: number) => string;
  resetLabel?: string;
  previousDisabled?: boolean;
  initialVisibleTrends?: readonly PlanTrainingTrendLine[];
  weekAnchorDate?: string;
  todayLabel?: string;
};

/** Shared Plan-tab chart surface; callers retain data loading and selected-day details. */
export function PlanTrainingChart({
  analysisAnchor,
  analysisPeriod,
  analysisWindowLoading,
  binning,
  dailyPoints,
  formatDateLabel,
  goalMarkers = [],
  initialVisibleTrends = ["fitness", "fatigue", "form"],
  onBinningChange,
  onGoalPress,
  onPeriodShift,
  onRangeChange,
  onRangeToday,
  onSelectedDateChange,
  previousDisabled = false,
  primaryGoalId = null,
  resetLabel = "Today",
  selectedDate,
  todayKey,
  todayLabel,
  weekAnchorDate,
}: PlanTrainingChartProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleTrends, setVisibleTrends] = useState<PlanTrainingTrendLine[]>(() => [
    ...initialVisibleTrends,
  ]);
  const chartPoints = useMemo(
    () => aggregateDailyTrainingAdjustmentPoints(dailyPoints, binning, weekAnchorDate),
    [binning, dailyPoints, weekAnchorDate],
  );
  const selectedBucketKey = getPlanChartBucketDate(selectedDate, binning, weekAnchorDate);
  const selectedBucketDate =
    chartPoints.find(
      (point) => getPlanChartBucketDate(point.date, binning, weekAnchorDate) === selectedBucketKey,
    )?.date ??
    chartPoints[0]?.date ??
    selectedDate;
  const selectedRangeLabel = ranges.find((range) => range.value === analysisPeriod)?.label ?? "6M";
  const selectedBinLabel = bins.find((bin) => bin.value === binning)?.label ?? "Day";
  const trendSummary =
    visibleTrends.length === 0
      ? "Load only"
      : `${visibleTrends.length} trend${visibleTrends.length === 1 ? "" : "s"}`;
  const showTodayAction = analysisAnchor !== todayKey || selectedDate !== todayKey;

  return (
    <>
      <View className="flex-row items-center gap-2" testID="plan-load-toolbar">
        <ToolbarButton
          accessibilityLabel={`Show previous ${selectedRangeLabel} window`}
          disabled={previousDisabled}
          icon={ChevronLeft}
          onPress={() => onPeriodShift(-1)}
          testID="plan-load-controls-previous"
        />
        <TouchableOpacity
          accessibilityLabel={`Legend and filters: ${selectedRangeLabel}, grouped by ${selectedBinLabel}, ${trendSummary}`}
          accessibilityRole="button"
          className="min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-muted/30 px-3"
          onPress={() => setSettingsOpen(true)}
          testID="plan-load-display-settings"
        >
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {selectedRangeLabel} · {selectedBinLabel}
            {analysisWindowLoading ? " · Updating" : ""}
          </Text>
          <Icon as={SlidersHorizontal} className="text-muted-foreground" size={16} />
        </TouchableOpacity>
        <ToolbarButton
          accessibilityLabel={`Show next ${selectedRangeLabel} window`}
          icon={ChevronRight}
          onPress={() => onPeriodShift(1)}
          testID="plan-load-controls-next"
        />
        {showTodayAction ? (
          <TouchableOpacity
            accessibilityLabel={`Return chart and selection to ${resetLabel.toLowerCase()}`}
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
            onPress={onRangeToday}
            testID="plan-load-controls-today"
          >
            <Text className="text-xs font-semibold text-foreground">{resetLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {analysisWindowLoading ? (
        <View
          accessibilityLabel="Updating chart data"
          accessibilityRole="progressbar"
          className="h-[250px] items-center justify-center rounded-2xl bg-card"
          testID="plan-training-chart-loading"
        >
          <ActivityIndicator size="small" />
          <Text className="mt-2 text-xs text-muted-foreground">Updating chart…</Text>
        </View>
      ) : (
        <DailyTrainingAdjustmentChart
          density="compact"
          fitRange
          {...omitUndefined({ formatDateLabel, onGoalPress })}
          goalMarkers={goalMarkers}
          height={250}
          key={`${analysisPeriod}:${analysisAnchor}:${binning}`}
          loadOnly
          onSelectedDateChange={onSelectedDateChange}
          points={chartPoints}
          primaryGoalId={primaryGoalId}
          range={binning}
          selectedDate={selectedBucketDate}
          showSelectedTray={false}
          testID="plan-training-chart"
          todayDate={todayKey}
          todayLabel={todayLabel}
          visibleTrends={visibleTrends}
          weekAnchorDate={weekAnchorDate}
        />
      )}
      <ChartRangeModal
        closeAccessibilityLabel="Close chart legend and filters"
        defaultRange={analysisPeriod}
        onClose={() => setSettingsOpen(false)}
        rangeOptions={ranges.map((range) => ({
          accessibilityLabel: range.label,
          label: range.label,
          value: range.value,
        }))}
        showRangeSelector={false}
        testID="plan-load-display-sheet"
        title="Legend & filters"
        visible={settingsOpen}
      >
        {() => (
          <View className="gap-5">
            <View className="gap-2" testID="plan-load-legend">
              <Text className="text-sm font-semibold text-foreground">Legend</Text>
              <TrainingPathLegend mode="daily" />
            </View>
            <ChartOptionGroup
              label="Window"
              options={ranges}
              onSelect={(period) => {
                onRangeChange(period);
                setSettingsOpen(false);
              }}
              selected={analysisPeriod}
              testIDPrefix="plan-load-controls-range"
            />
            <ChartOptionGroup
              label="Group by"
              options={bins}
              onSelect={(range) => {
                onBinningChange(range);
                setSettingsOpen(false);
              }}
              selected={binning}
              testIDPrefix="plan-load-bin"
            />
            <View className="gap-2" testID="plan-load-trends">
              <Text className="text-sm font-semibold text-foreground">Trend lines</Text>
              <View className="flex-row gap-2">
                {trends.map((trend) => {
                  const selected = visibleTrends.includes(trend.value);
                  return (
                    <TouchableOpacity
                      accessibilityLabel={`Show ${trend.label.toLowerCase()} trend`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-11 flex-1 items-center justify-center rounded-xl border px-2 ${
                        selected ? "border-primary bg-primary/10" : "border-border"
                      }`}
                      key={trend.value}
                      onPress={() => {
                        setVisibleTrends((current) =>
                          current.includes(trend.value)
                            ? current.filter((value) => value !== trend.value)
                            : [...current, trend.value],
                        );
                        setSettingsOpen(false);
                      }}
                      testID={`plan-load-trend-${trend.value}`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {trend.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </ChartRangeModal>
    </>
  );
}

function ToolbarButton({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: typeof ChevronLeft;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <Icon as={icon} className="text-foreground" size={18} />
    </TouchableOpacity>
  );
}

function ChartOptionGroup<Value extends string>({
  label,
  onSelect,
  options,
  selected,
  testIDPrefix,
}: {
  label: string;
  onSelect: (value: Value) => void;
  options: ReadonlyArray<{ label: string; value: Value }>;
  selected: Value;
  testIDPrefix: string;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <View className="flex-row rounded-xl bg-muted/30 p-1">
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <TouchableOpacity
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`min-h-11 flex-1 items-center justify-center rounded-lg px-2 ${
                isSelected ? "bg-card" : ""
              }`}
              key={option.value}
              onPress={() => onSelect(option.value)}
              testID={`${testIDPrefix}-${option.value}`}
            >
              <Text
                className={`text-xs font-semibold ${
                  isSelected ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
