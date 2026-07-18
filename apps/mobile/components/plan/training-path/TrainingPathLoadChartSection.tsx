import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { HelpCircle, Plus, Settings } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { DailyTrainingAdjustmentChart } from "./DailyTrainingAdjustmentChart";
import { TrainingPathChart } from "./TrainingPathChart";
import { TrainingPathLegend } from "./TrainingPathLegend";
import {
  buildSelectedWeekBucket,
  type TrainingPathSelectedWeekBucket,
} from "./trainingPathSelectedWeekBucket";
import type { TrainingPathViewModel } from "./trainingPathTypes";

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

type TrainingPathLoadChartSectionProps = {
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
  onScrollInteractionSettled?: () => void;
  onScrollInteractionStart?: () => void;
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  onSelectedDateChange?: (date: string) => void;
  onSelectedWeekChange?: (weekStart: string) => void;
  selectedDate?: string | null;
  showHeader?: boolean;
  showLegendButton?: boolean;
  showSelectedPointTray?: boolean;
  testID?: string;
  title?: string;
};

const modelEmptyStateCopy: Record<NonNullable<TrainingPathViewModel["emptyState"]>, string> = {
  noGoal: "Add a goal to see your training path.",
  noActivityHistory: "Complete a few activities to calibrate your fitness path.",
  noPlannedSessions: "Training path is still being calculated.",
  noProjection: "Training path is still being calculated.",
};

export const TrainingPathLoadChartSection = memo(function TrainingPathLoadChartSection({
  chartHeight = 300,
  dailyDensity = "standard",
  dailyDateLabelFormatter,
  dailyPoints,
  dailyTestID = "training-path-daily-adjustment-chart",
  emptyState,
  model,
  loading = false,
  onCreateGoal,
  onDisplayedWeekChange,
  onOpenSettings,
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
  showLegendButton = true,
  showSelectedPointTray = true,
  testID = "training-path-load-chart-section",
  title = "Daily Training Path",
}: TrainingPathLoadChartSectionProps) {
  const [legendOpen, setLegendOpen] = useState(false);
  const [previewSelectedDate, setPreviewSelectedDate] = useState<string | null>(null);
  const modelEmptyState = loading ? null : (model?.emptyState ?? null);
  const resolvedEmptyState = loading
    ? { title: "Loading training path…", tone: "loading" as const }
    : (emptyState ??
      (modelEmptyState
        ? { title: modelEmptyStateCopy[modelEmptyState], tone: "empty" as const }
        : undefined));
  const canRenderDailyChart = preferDailyChart && !!dailyPoints?.length;
  const canRenderWeeklyChart = !!model && !model.emptyState && !!onSelectedWeekChange;
  const contextSelectedDate = previewSelectedDate ?? selectedDate;

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
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text className="text-sm font-semibold text-foreground">{title}</Text>
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
            formatDateLabel={dailyDateLabelFormatter}
            points={dailyPoints}
            selectedDate={selectedDate ?? model?.todayKey}
            showSelectedPointTray={showSelectedPointTray}
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
        {!resolvedEmptyState && (canRenderDailyChart || canRenderWeeklyChart) ? (
          <TrainingPathLegend
            mode={canRenderDailyChart ? "daily" : "weekly"}
            range="season"
            showUnavailableLoad={
              dailyPoints?.some((point) => point.hasCompletedActivityWithoutLoad === true) ?? false
            }
            variant="primary"
          />
        ) : null}
      </View>

      {renderBelowChart ? renderBelowChart(belowChartContext) : null}

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
