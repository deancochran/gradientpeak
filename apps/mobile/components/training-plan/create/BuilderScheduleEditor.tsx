import type { ActivityPlanPlanningEstimate } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Plus } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import type { DailyTrainingAdjustmentPoint } from "@/components/plan/training-path/DailyTrainingAdjustmentChart";
import { TrainingPathSelectedDayPanel } from "@/components/plan/training-path/TrainingPathSelectedDayPanel";
import { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";
import { TrainingPlanBuilderEventCard } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import { formatBuilderWeekdayWithWeek } from "@/lib/training-plan-creation/formatters";
import type { BuilderPlanCreationViewModel } from "@/lib/training-plan-creation/view-model";

type BuilderScheduleEditorProps = {
  viewModel: BuilderPlanCreationViewModel;
  chartReview: TrainingPlanBuilderController["chartReview"];
  estimateBySessionId: Map<string, ActivityPlanPlanningEstimate>;
  onAddSessionAtOffset: (offsetDays: number) => void;
  onDuplicateSession: (sessionId: string) => void;
  onMoveSessionByDays: (sessionId: string, days: number) => void;
  onPressSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;
  selectedDayPointOverride?: DailyTrainingAdjustmentPoint | null;
  showChart?: boolean;
};

type BuilderSelectedDayPlanningPanelProps = {
  dateLabel: string | null;
  estimateBySessionId: Map<string, ActivityPlanPlanningEstimate>;
  onAddWorkout: () => void;
  onDuplicateSession: (sessionId: string) => void;
  onMoveSessionByDays: (sessionId: string, days: number) => void;
  onPressSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;
  point: DailyTrainingAdjustmentPoint | null;
  selectedDayOffset: number;
  sessions: BuilderPlanCreationViewModel["timelineWeeks"][number]["sessions"];
};

export function BuilderScheduleEditor({
  chartReview,
  onAddSessionAtOffset,
  onDuplicateSession,
  onMoveSessionByDays,
  onPressSession,
  onRemoveSession,
  selectedDayPointOverride,
  showChart = true,
  estimateBySessionId,
  viewModel,
}: BuilderScheduleEditorProps) {
  const selectedWeekIndex = chartReview.selectedWeekIndex;
  const selectedTimelineWeek =
    viewModel.timelineWeeks.find((week) => week.weekIndex === selectedWeekIndex) ?? null;
  const activeWeekStartOffset = selectedWeekIndex * 7;
  const selectedDayOffset = chartReview.selectedDayOffset ?? activeWeekStartOffset;
  const selectedDaySessions = useMemo(
    () =>
      (selectedTimelineWeek?.sessions ?? []).filter(
        (sessionRow) => sessionRow.session.offsetDays === selectedDayOffset,
      ),
    [selectedDayOffset, selectedTimelineWeek?.sessions],
  );
  const selectedDayPoint =
    chartReview.chart.dailyPoints?.find((point) => point.date === chartReview.selectedDate) ?? null;
  const selectedDayLabel = formatBuilderWeekdayWithWeek(selectedDayOffset);

  const renderSelectedDayPanel = (point: DailyTrainingAdjustmentPoint | null) => (
    <BuilderSelectedDayPlanningPanel
      dateLabel={selectedDayLabel}
      estimateBySessionId={estimateBySessionId}
      onAddWorkout={() => onAddSessionAtOffset(selectedDayOffset)}
      onDuplicateSession={onDuplicateSession}
      onMoveSessionByDays={onMoveSessionByDays}
      onPressSession={onPressSession}
      onRemoveSession={onRemoveSession}
      point={point ?? selectedDayPointOverride ?? selectedDayPoint}
      selectedDayOffset={selectedDayOffset}
      sessions={selectedDaySessions}
    />
  );

  return (
    <View className="gap-4" testID="builder-sessions-workspace">
      {showChart ? (
        <View className="-mx-2">
          <BuilderTrainingPathReviewSection
            chartHeight={260}
            chartReview={chartReview}
            renderBelowChart={(context) => (
              <View className="mx-2">{renderSelectedDayPanel(context.selectedDayPoint)}</View>
            )}
          />
        </View>
      ) : (
        renderSelectedDayPanel(selectedDayPoint)
      )}
    </View>
  );
}

function BuilderSelectedDayPlanningPanel({
  dateLabel,
  estimateBySessionId,
  onAddWorkout,
  onDuplicateSession,
  onMoveSessionByDays,
  onPressSession,
  onRemoveSession,
  point,
  selectedDayOffset,
  sessions,
}: BuilderSelectedDayPlanningPanelProps) {
  const planned = valueOrZero(point?.plannedLoadTss) + valueOrZero(point?.tentativePlannedLoadTss);
  const recommended = valueOrZero(point?.targetLoadTss);
  const weekIndex = Math.floor(selectedDayOffset / 7);
  const title = dateLabel ?? formatBuilderWeekdayWithWeek(selectedDayOffset);

  return (
    <TrainingPathSelectedDayPanel
      action={
        <Button
          size="sm"
          variant="outline"
          onPress={onAddWorkout}
          className="shrink-0"
          testID="builder-sessions-workspace-add"
        >
          <Plus size={14} className="text-foreground" />
          <Text className="text-sm font-medium text-foreground">Workout</Text>
        </Button>
      }
      emptyState="This day is ready to plan. Add a workout when this day should carry training load."
      eventCount={sessions.length}
      metadata={[
        `Week ${weekIndex + 1}`,
        `${sessions.length} workout${sessions.length === 1 ? "" : "s"}`,
      ]}
      metrics={[
        { label: "Recommended", value: formatTss(recommended) },
        { label: "Planned", value: formatTss(planned) },
      ]}
      testID="builder-selected-day-panel"
      title={title}
    >
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 360 }}
        contentContainerClassName="gap-2 pb-2"
      >
        {sessions.length === 0 ? (
          <View className="flex-row items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-3">
            <View className="size-8 items-center justify-center rounded-full bg-background">
              <Plus size={14} className="text-muted-foreground" />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                This day is ready to plan
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                Add a workout when this day should carry training load.
              </Text>
            </View>
          </View>
        ) : (
          sessions.map((sessionRow) => (
            <TrainingPlanBuilderEventCard
              key={sessionRow.session.localId}
              event={sessionRow.session}
              estimate={estimateBySessionId.get(sessionRow.session.localId) ?? null}
              onDuplicate={() => onDuplicateSession(sessionRow.session.localId)}
              onEdit={() => onPressSession(sessionRow.session.localId)}
              onMoveByDays={(days) => onMoveSessionByDays(sessionRow.session.localId, days)}
              onRemove={() => onRemoveSession(sessionRow.session.localId)}
            />
          ))
        )}
      </ScrollView>
    </TrainingPathSelectedDayPanel>
  );
}

function valueOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatTss(value: number) {
  return `${Math.round(value)} TSS`;
}
