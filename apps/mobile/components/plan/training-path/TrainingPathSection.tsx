import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { HelpCircle, Settings } from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { TrainingPathChart } from "./TrainingPathChart";
import { TrainingPathControls } from "./TrainingPathControls";
import { TrainingPathLegend } from "./TrainingPathLegend";
import { TrainingPathWeekSummaryCard } from "./TrainingPathWeekSummaryCard";
import type {
  TrainingPathCompletedActivity,
  TrainingPathRange,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathViewModel,
} from "./trainingPathTypes";

type TrainingPathSectionProps = {
  model: TrainingPathViewModel;
  range: TrainingPathRange;
  selectedWeekGoals: TrainingPathSelectedGoal[];
  selectedWeekScheduledItems: TrainingPathScheduledItem[];
  selectedWeekCompletedActivities: TrainingPathCompletedActivity[];
  onRangeChange: (range: TrainingPathRange) => void;
  onOpenActivity: (activityId: string) => void;
  onOpenActivityPlan: (activityPlanId: string) => void;
  onOpenGoal: (goalId: string) => void;
  onOpenGroupEvent: (eventId: string) => void;
  onOpenScheduledEvent: (eventId: string) => void;
  onOpenSettings: () => void;
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

function TrainingPathMetric({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 rounded-2xl bg-muted/40 px-2.5 py-2">
      <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {formatLoad(value)}
      </Text>
    </View>
  );
}

function TrainingPathDateMetric({ value }: { value: string }) {
  return (
    <View className="flex-[1.25] rounded-2xl bg-muted/40 px-2.5 py-2">
      <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
        Week
      </Text>
      <Text className="text-xs font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function TrainingPathSection({
  model,
  range,
  selectedWeekGoals,
  selectedWeekScheduledItems,
  selectedWeekCompletedActivities,
  onRangeChange,
  onOpenActivity,
  onOpenActivityPlan,
  onOpenGoal,
  onOpenGroupEvent,
  onOpenScheduledEvent,
  onOpenSettings,
  onSelectedWeekChange,
}: TrainingPathSectionProps) {
  const selectedWeek = model.selectedWeekSummary;
  const [legendOpen, setLegendOpen] = useState(false);

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
            <TrainingPathControls range={range} onRangeChange={onRangeChange} />
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
              <TrainingPathDateMetric value={selectedWeek.dateLabel} />
              <TrainingPathMetric label="Completed" value={selectedWeek.completedLoad} />
              <TrainingPathMetric label="Planned" value={selectedWeek.plannedLoad} />
              <TrainingPathMetric label="Recommended" value={selectedWeek.targetLoad} />
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
          </View>
        ) : (
          <TrainingPathChart
            model={model}
            range={range}
            onSelectedWeekChange={onSelectedWeekChange}
          />
        )}
      </View>
      <TrainingPathWeekSummaryCard
        summary={model.selectedWeekSummary}
        goals={selectedWeekGoals}
        scheduledItems={selectedWeekScheduledItems}
        completedActivities={selectedWeekCompletedActivities}
        onOpenActivity={onOpenActivity}
        onOpenActivityPlan={onOpenActivityPlan}
        onOpenGoal={onOpenGoal}
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
            <TrainingPathLegend range={range} />
          </View>
        </AppFormModal>
      ) : null}
    </View>
  );
}
