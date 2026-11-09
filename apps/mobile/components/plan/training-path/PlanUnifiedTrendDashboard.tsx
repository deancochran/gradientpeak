import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { PlanAnalysisWindowPeriod } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { ChartRangeModal } from "@/components/charts/ChartRangeModal";
import { api } from "@/lib/api";
import {
  DailyTrainingAdjustmentChart,
  type DailyTrainingAdjustmentPoint,
} from "./DailyTrainingAdjustmentChart";
import {
  aggregateDailyTrainingAdjustmentPoints,
  getPlanChartBucketDate,
} from "./dailyTrainingAdjustmentChartPresentation";
import { PlanSelectedDay } from "./PlanSelectedDay";
import { PlanSelectedPeriodReview } from "./PlanSelectedPeriodReview";
import { TrainingPathLegend } from "./TrainingPathLegend";
import type {
  PlanTrainingChartRange,
  PlanTrainingTrendLine,
  TrainingPathViewModel,
} from "./trainingPathTypes";

type Projection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type ProjectionDay = NonNullable<Projection["timeline"]>["days"][number];
type GoalMarker = Projection["goalMarkers"][number];

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

/** One range-aware Load timeline plus one canonical selected-day context. */
export function PlanUnifiedTrendDashboard({
  analysisAnchor,
  analysisPeriod,
  analysisWindowLoading,
  dailyPoints,
  goalMarkers,
  model,
  onGoalPress,
  onOpenCompletedActivity,
  onPeriodShift,
  onRangeChange,
  onRangeToday,
  onSelectedDateChange,
  onViewDetails,
  primaryGoalId,
  selectedDate,
  timelineDaysByDate,
}: {
  analysisAnchor: string;
  analysisPeriod: PlanAnalysisWindowPeriod;
  analysisWindowLoading: boolean;
  dailyPoints: DailyTrainingAdjustmentPoint[];
  goalMarkers: readonly GoalMarker[];
  model: TrainingPathViewModel;
  onGoalPress: (goalId: string) => void;
  onOpenCompletedActivity: (activityId: string) => void;
  onPeriodShift: (direction: -1 | 1) => void;
  onRangeChange: (period: PlanAnalysisWindowPeriod) => void;
  onRangeToday: () => void;
  onSelectedDateChange: (date: string) => void;
  onViewDetails: (date: string, period: "day" | "week") => void;
  primaryGoalId: string | null;
  selectedDate: string;
  timelineDaysByDate: Record<string, ProjectionDay>;
}) {
  const [binning, setBinning] = useState<PlanTrainingChartRange>("daily");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleTrends, setVisibleTrends] = useState<PlanTrainingTrendLine[]>([
    "fitness",
    "fatigue",
    "form",
  ]);
  const chartPoints = useMemo(
    () => aggregateDailyTrainingAdjustmentPoints(dailyPoints, binning),
    [binning, dailyPoints],
  );
  const selectedBucketKey = getPlanChartBucketDate(selectedDate, binning);
  const selectedBucketDate =
    chartPoints.find((point) => getPlanChartBucketDate(point.date, binning) === selectedBucketKey)
      ?.date ??
    chartPoints[0]?.date ??
    selectedDate;
  const selectedIndex = dailyPoints.findIndex((point) => point.date === selectedDate);
  const selectedPoint = dailyPoints[selectedIndex] ?? null;
  const selectedDay = timelineDaysByDate[selectedDate] ?? null;
  const selectedGoals = goalMarkers.filter((goal) => goal.targetDate === selectedDate);
  const selectedRangeLabel = ranges.find((range) => range.value === analysisPeriod)?.label ?? "6M";
  const selectedBinLabel = bins.find((bin) => bin.value === binning)?.label ?? "Day";
  const trendSummary =
    visibleTrends.length === 0
      ? "Load only"
      : `${visibleTrends.length} trend${visibleTrends.length === 1 ? "" : "s"}`;
  const showTodayAction = analysisAnchor !== model.todayKey || selectedDate !== model.todayKey;
  const selectedPeriod = binning === "weekly" ? "week" : "day";
  const periodReviewQuery = api.trainingPlans.getPlanPeriodReview.useQuery(
    { anchorDate: selectedDate, period: selectedPeriod },
    { retry: false },
  );
  const selectedDayCalendarQuery = api.calendar.day.useQuery(
    { date: selectedDate },
    { enabled: selectedPeriod === "day", retry: false },
  );
  const selectedDayActivities = useMemo(
    () =>
      selectedDayCalendarQuery.data?.projection.items.flatMap((item) =>
        item.activity ? [item.activity] : [],
      ) ?? [],
    [selectedDayCalendarQuery.data],
  );

  return (
    <View className="gap-3" testID="plan-unified-trends">
      <View className="flex-row items-center gap-2" testID="plan-load-toolbar">
        <ToolbarButton
          accessibilityLabel={`Show previous ${selectedRangeLabel} window`}
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
            accessibilityLabel="Return chart and selection to today"
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-xl border border-border px-3"
            onPress={onRangeToday}
            testID="plan-load-controls-today"
          >
            <Text className="text-xs font-semibold text-foreground">Today</Text>
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
          goalMarkers={goalMarkers}
          height={250}
          key={`${analysisPeriod}:${analysisAnchor}:${binning}`}
          loadOnly
          onGoalPress={onGoalPress}
          onSelectedDateChange={onSelectedDateChange}
          points={chartPoints}
          primaryGoalId={primaryGoalId}
          range={binning}
          selectedDate={selectedBucketDate}
          showSelectedTray={false}
          testID="plan-training-chart"
          todayDate={model.todayKey}
          visibleTrends={visibleTrends}
        />
      )}
      {selectedPeriod !== "day" ? (
        <PlanSelectedPeriodReview
          fallbackPoint={
            chartPoints.find(
              (point) => getPlanChartBucketDate(point.date, binning) === selectedBucketKey,
            ) ?? null
          }
          loading={periodReviewQuery.isLoading || periodReviewQuery.isFetching}
          onOpenDetails={() => onViewDetails(selectedDate, selectedPeriod)}
          onRetry={() => void periodReviewQuery.refetch()}
          review={periodReviewQuery.data ?? null}
        />
      ) : (
        <PlanSelectedDay
          completedActivities={selectedDayActivities}
          completedActivitiesState={
            selectedDayCalendarQuery.isLoading || selectedDayCalendarQuery.isFetching
              ? "loading"
              : selectedDayCalendarQuery.isError
                ? "error"
                : "ready"
          }
          day={selectedDay}
          goals={selectedGoals}
          onOpenCompletedActivity={onOpenCompletedActivity}
          onOpenDayDetails={(date) => onViewDetails(date, "day")}
          onOpenGoal={onGoalPress}
          onRetryCompletedActivities={() => void selectedDayCalendarQuery.refetch()}
          point={selectedPoint}
          selectedDate={selectedDate}
          todayKey={model.todayKey}
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
                setBinning(range);
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
    </View>
  );
}

function ToolbarButton({
  accessibilityLabel,
  icon,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  icon: typeof ChevronLeft;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-border"
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
