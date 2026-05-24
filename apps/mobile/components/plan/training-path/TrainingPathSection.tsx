import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { HelpCircle, Plus, Settings } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { TrainingPathChart } from "./TrainingPathChart";
import { TrainingPathLegend } from "./TrainingPathLegend";
import { TrainingPathWeekSummaryCard } from "./TrainingPathWeekSummaryCard";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathViewModel,
} from "./trainingPathTypes";

type TrainingPathSectionProps = {
  model: TrainingPathViewModel;
  selectedWeekGoals: TrainingPathSelectedGoal[];
  selectedWeekEvents: TrainingPathScheduledItem[];
  selectedWeekGroupEvents: TrainingPathScheduledItem[];
  selectedWeekCompletedActivities: TrainingPathCompletedActivity[];
  selectedWeekLoading?: boolean;
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  onOpenActivity: (activityId: string) => void;
  onCreateGoal?: () => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGroup?: (groupId: string) => void;
  onOpenGroupEvent: (eventId: string) => void;
  onOpenScheduledEvent: (eventId: string) => void;
  onOpenSettings: () => void;
  onWeekScrollStart?: () => void;
  onSelectedWeekChange: (weekStart: string) => void;
};

const emptyStateCopy: Record<NonNullable<TrainingPathViewModel["emptyState"]>, string> = {
  noGoal: "Add a goal to see your training path.",
  noActivityHistory: "Complete a few activities to calibrate your fitness path.",
  noPlannedSessions: "Schedule workouts to compare your plan against the target path.",
  noProjection: "Training path is still being calculated.",
};

function formatLoad(value: number) {
  return `${Math.round(value)} TSS`;
}

function TrainingPathMetric({
  label,
  loading,
  value,
}: {
  label: string;
  loading?: boolean;
  value: number;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-muted/40 px-2.5 py-2">
      <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {loading ? "--" : formatLoad(value)}
      </Text>
    </View>
  );
}

function TrainingPathDateMetric({ loading, value }: { loading?: boolean; value: string }) {
  return (
    <View className="flex-[1.25] rounded-2xl bg-muted/40 px-2.5 py-2">
      <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
        Week
      </Text>
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {loading ? "Loading" : value}
      </Text>
    </View>
  );
}

export function TrainingPathSection({
  model,
  selectedWeekGoals,
  selectedWeekEvents,
  selectedWeekGroupEvents,
  selectedWeekCompletedActivities,
  selectedWeekLoading = false,
  onScrollNearEnd,
  onScrollNearStart,
  onOpenActivity,
  onCreateGoal,
  onOpenGoal,
  onOpenGroup,
  onOpenGroupEvent,
  onOpenScheduledEvent,
  onOpenSettings,
  onWeekScrollStart,
  onSelectedWeekChange,
}: TrainingPathSectionProps) {
  const selectedWeek = model.selectedWeekSummary;
  const [legendOpen, setLegendOpen] = useState(false);
  const [chartScrolling, setChartScrolling] = useState(false);
  const lastSelectedWeekStartRef = useRef<string | null>(selectedWeek?.weekStart ?? null);
  const [displayedWeekStart, setDisplayedWeekStart] = useState<string | null>(
    selectedWeek?.weekStart ?? null,
  );
  const displayedWeek = displayedWeekStart
    ? (model.weeks.find((week) => week.weekStart === displayedWeekStart) ?? null)
    : null;
  const displayedWeekLabel = displayedWeek?.label ?? selectedWeek?.dateLabel;
  const weekReviewLoading = selectedWeekLoading || chartScrolling;

  useEffect(() => {
    const previousSelectedWeekStart = lastSelectedWeekStartRef.current;
    lastSelectedWeekStartRef.current = selectedWeek?.weekStart ?? null;
    if (selectedWeekLoading) return;
    if (
      chartScrolling &&
      selectedWeek?.weekStart !== previousSelectedWeekStart &&
      selectedWeek?.weekStart === displayedWeekStart
    ) {
      setChartScrolling(false);
    }
    if (chartScrolling) return;
    setDisplayedWeekStart(selectedWeek?.weekStart ?? null);
  }, [chartScrolling, displayedWeekStart, selectedWeek?.weekStart, selectedWeekLoading]);

  const beginWeekProgress = (weekStart?: string) => {
    if (weekStart) setDisplayedWeekStart(weekStart);
    setChartScrolling(true);
    onWeekScrollStart?.();
  };

  return (
    <View className="gap-4" testID="training-path-section">
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text className="text-sm font-semibold text-foreground">Weekly Training Path</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open training path legend"
              activeOpacity={0.85}
              className="h-7 w-7 items-center justify-center rounded-full"
              onPress={() => setLegendOpen(true)}
              testID="training-path-legend-button"
            >
              <Icon as={HelpCircle} size={15} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Edit training preferences"
              activeOpacity={0.85}
              className="h-9 w-9 items-center justify-center rounded-full border border-border bg-background"
              onPress={onOpenSettings}
              testID="training-path-settings-button"
            >
              <Icon as={Settings} size={15} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>
        </View>
        {selectedWeek ? (
          <View className="gap-2">
            <View className="flex-row gap-1.5">
              <TrainingPathDateMetric
                loading={weekReviewLoading}
                value={displayedWeekLabel ?? selectedWeek.dateLabel}
              />
              <TrainingPathMetric
                label="Completed"
                loading={weekReviewLoading}
                value={selectedWeek.completedLoad}
              />
              <TrainingPathMetric
                label="Planned"
                loading={weekReviewLoading}
                value={selectedWeek.plannedLoad}
              />
              <TrainingPathMetric
                label="Recommended"
                loading={weekReviewLoading}
                value={selectedWeek.targetLoad}
              />
            </View>
          </View>
        ) : null}
      </View>
      <View className="gap-3">
        {model.emptyState ? (
          <View
            className="min-h-72 items-center justify-center rounded-2xl bg-muted/20 px-4"
            testID="training-path-empty-state"
          >
            <Text className="text-center text-sm font-medium text-muted-foreground">
              {emptyStateCopy[model.emptyState]}
            </Text>
            {model.emptyState === "noGoal" && onCreateGoal ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Create goal"
                activeOpacity={0.85}
                className="mt-3 flex-row items-center gap-1.5 rounded-full bg-primary px-4 py-2"
                onPress={onCreateGoal}
                testID="plan-add-goal-button"
              >
                <Icon as={Plus} size={14} className="text-primary-foreground" />
                <Text className="text-xs font-semibold text-primary-foreground">Add goal</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <TrainingPathChart
            model={model}
            range="season"
            scrollX
            onScrollNearEnd={onScrollNearEnd}
            onScrollNearStart={onScrollNearStart}
            onScrollInteractionSettled={() => setChartScrolling(false)}
            onScrollInteractionStart={() => {
              beginWeekProgress();
            }}
            onDisplayedWeekChange={setDisplayedWeekStart}
            onSelectedWeekChange={(weekStart) => {
              beginWeekProgress(weekStart);
              onSelectedWeekChange(weekStart);
            }}
          />
        )}
      </View>
      <TrainingPathWeekSummaryCard
        loading={weekReviewLoading}
        loadingDateLabel={displayedWeekLabel}
        summary={model.selectedWeekSummary}
        goals={selectedWeekGoals}
        events={selectedWeekEvents}
        groupEvents={selectedWeekGroupEvents}
        completedActivities={selectedWeekCompletedActivities}
        onOpenActivity={onOpenActivity}
        onOpenGoal={onOpenGoal}
        onOpenGroup={onOpenGroup}
        onOpenGroupEvent={onOpenGroupEvent}
        onOpenScheduledEvent={onOpenScheduledEvent}
      />
      {legendOpen ? (
        <AppFormModal
          description="How to read the weekly training path chart."
          onClose={() => setLegendOpen(false)}
          testID="training-path-legend-modal"
          title="Chart Legend"
        >
          <View className="gap-4 rounded-2xl border border-border bg-card p-4">
            <TrainingPathLegend range="season" />
          </View>
        </AppFormModal>
      ) : null}
    </View>
  );
}
