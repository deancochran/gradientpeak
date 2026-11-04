import type { ActivityPlanMetric, ActivityPlanPlanningEstimate } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Plus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { DailyTrainingAdjustmentPoint } from "@/components/plan/training-path/DailyTrainingAdjustmentChart";
import { PlanTrainingChart } from "@/components/plan/training-path/PlanTrainingChart";
import { TrainingPathSelectedDayPanel } from "@/components/plan/training-path/TrainingPathSelectedDayPanel";
import { buildTrainingPathLoadMetrics } from "@/components/plan/training-path/trainingPathLoadMetrics";
import { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";
import { TrainingPlanBuilderEventCard } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import type { BuilderPlanPresentation } from "@/lib/training-plan-creation/builder-presentation";
import { addDaysToDateKey } from "@/lib/training-plan-creation/date-utils";
import { formatBuilderWeekdayWithWeek } from "@/lib/training-plan-creation/formatters";

type BuilderScheduleEditorProps = {
  viewModel: BuilderPlanPresentation;
  chartReview: TrainingPlanBuilderController["chartReview"];
  estimateBySessionId: Map<string, ActivityPlanPlanningEstimate>;
  metricsBySessionId?: ReadonlyMap<string, readonly ActivityPlanMetric[]> | undefined;
  onAddSessionAtOffset: (offsetDays: number) => void;
  onCopyWeek: (sourceWeekIndex: number, destinationWeekIndex: number) => void;
  onDuplicateSession: (sessionId: string) => void;
  onMoveSessionByDays: (sessionId: string, days: number) => void;
  onPressSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;
  selectedDayPointOverride?: DailyTrainingAdjustmentPoint | null;
  showChart?: boolean;
  scheduleOnly?: boolean;
  focusOffsetDays?: number;
  weekSummary?: string;
  creationChart?: TrainingPlanBuilderController["creationChart"] | undefined;
};

type BuilderSelectedDayPlanningPanelProps = {
  metricsBySessionId?: ReadonlyMap<string, readonly ActivityPlanMetric[]> | undefined;
  dateLabel: string | null;
  estimateBySessionId: Map<string, ActivityPlanPlanningEstimate>;
  onAddActivity: () => void;
  onDuplicateSession: (sessionId: string) => void;
  onMoveSessionByDays: (sessionId: string, days: number) => void;
  onPressSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;
  point: DailyTrainingAdjustmentPoint | null;
  selectedDayOffset: number;
  sessions: BuilderPlanPresentation["timelineWeeks"][number]["sessions"];
};

export function BuilderScheduleEditor({
  chartReview,
  onAddSessionAtOffset,
  onCopyWeek,
  onDuplicateSession,
  onMoveSessionByDays,
  onPressSession,
  onRemoveSession,
  selectedDayPointOverride,
  showChart = true,
  scheduleOnly = false,
  focusOffsetDays,
  estimateBySessionId,
  metricsBySessionId,
  viewModel,
  weekSummary,
  creationChart,
}: BuilderScheduleEditorProps) {
  const [scheduleWeekIndex, setScheduleWeekIndex] = useState(
    Math.floor((focusOffsetDays ?? 0) / 7),
  );
  useEffect(() => {
    if (focusOffsetDays !== undefined) setScheduleWeekIndex(Math.floor(focusOffsetDays / 7));
  }, [focusOffsetDays]);
  const lastScheduleWeek = Math.max(0, ...viewModel.timelineWeeks.map((week) => week.weekIndex));
  const selectedWeekIndex = creationChart
    ? Math.floor(creationChart.selectedDayOffset / 7)
    : scheduleOnly
      ? Math.min(scheduleWeekIndex, lastScheduleWeek)
      : chartReview.selectedWeekIndex;
  const selectedTimelineWeek =
    viewModel.timelineWeeks.find((week) => week.weekIndex === selectedWeekIndex) ?? null;
  const activeWeekStartOffset = selectedWeekIndex * 7;
  const selectedDayOffset =
    creationChart?.selectedDayOffset ?? chartReview.selectedDayOffset ?? activeWeekStartOffset;
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
      metricsBySessionId={metricsBySessionId}
      onAddActivity={() => onAddSessionAtOffset(selectedDayOffset)}
      onDuplicateSession={onDuplicateSession}
      onMoveSessionByDays={onMoveSessionByDays}
      onPressSession={onPressSession}
      onRemoveSession={onRemoveSession}
      point={point ?? selectedDayPointOverride ?? selectedDayPoint}
      selectedDayOffset={selectedDayOffset}
      sessions={selectedDaySessions}
    />
  );

  if (creationChart) {
    const point =
      creationChart.chartProps.dailyPoints.find(
        (entry) => entry.date === creationChart.selectedDate,
      ) ?? null;
    return (
      <View className="gap-4" testID="builder-sessions-workspace">
        <Text className="text-lg font-semibold">Schedule & trajectory</Text>
        <PlanTrainingChart {...creationChart.chartProps} />
        <Text className="text-xs text-muted-foreground">
          {creationChart.forecastAvailable
            ? creationChart.forecastPartial
              ? "Partial forecast: activities with unresolved or incomplete load are excluded from the trajectory. Missing load estimates remain unknown."
              : "Projected trajectory uses your current plan check. Missing activity estimates remain unknown."
            : "Your authored schedule is shown now. A current plan check is needed for the projected trajectory."}
        </Text>
        <View className="flex-row items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel="Previous schedule day"
            disabled={selectedDayOffset === 0}
            onPress={() =>
              creationChart.selectDate(addDaysToDateKey(creationChart.selectedDate, -1))
            }
          >
            <Text>Previous day</Text>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel="Next schedule day"
            onPress={() =>
              creationChart.selectDate(addDaysToDateKey(creationChart.selectedDate, 1))
            }
          >
            <Text>Next day</Text>
          </Button>
        </View>
        {renderSelectedDayPanel(point)}
        <Button
          variant="outline"
          testID="builder-copy-week"
          disabled={!selectedTimelineWeek?.sessions.length}
          onPress={() => onCopyWeek(selectedWeekIndex, selectedWeekIndex + 1)}
        >
          <Text>
            Copy week {selectedWeekIndex + 1} to week {selectedWeekIndex + 2}
          </Text>
        </Button>
      </View>
    );
  }

  if (scheduleOnly) {
    const previousWeek = selectedWeekIndex > 0;
    const nextWeek = selectedWeekIndex < lastScheduleWeek;
    const sessions = selectedTimelineWeek?.sessions ?? [];
    return (
      <View className="gap-3" testID="builder-sessions-workspace">
        <Text className="text-lg font-semibold">Schedule</Text>
        <View className="flex-row items-center justify-between gap-2">
          <Button
            accessibilityLabel="Previous schedule week"
            disabled={!previousWeek}
            size="sm"
            variant="ghost"
            onPress={() => setScheduleWeekIndex(selectedWeekIndex - 1)}
          >
            <Text>Previous</Text>
          </Button>
          <Text className="font-semibold">Week {selectedWeekIndex + 1}</Text>
          <Button
            accessibilityLabel="Next schedule week"
            disabled={!nextWeek}
            size="sm"
            variant="ghost"
            onPress={() => setScheduleWeekIndex(selectedWeekIndex + 1)}
          >
            <Text>Next</Text>
          </Button>
        </View>
        {sessions.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            No activities this week. Add an activity to get started.
          </Text>
        ) : (
          sessions.map(({ session }) => (
            <View key={session.localId} className="gap-1">
              <Text className="text-sm text-muted-foreground">
                Day {(session.offsetDays % 7) + 1}
              </Text>
              <TrainingPlanBuilderEventCard
                event={session}
                estimate={estimateBySessionId.get(session.localId) ?? null}
                projectionMetrics={metricsBySessionId?.get(session.localId)}
                onDuplicate={() => onDuplicateSession(session.localId)}
                onEdit={() => onPressSession(session.localId)}
                onMoveByDays={(days) => onMoveSessionByDays(session.localId, days)}
                onRemove={() => onRemoveSession(session.localId)}
              />
            </View>
          ))
        )}
        <Button
          testID="builder-add-activity"
          onPress={() => onAddSessionAtOffset(activeWeekStartOffset)}
        >
          <Text>Add activity</Text>
        </Button>
        {sessions.length > 0 ? (
          <Button
            variant="ghost"
            testID="builder-copy-week"
            onPress={() => onCopyWeek(selectedWeekIndex, selectedWeekIndex + 1)}
          >
            <Text>Copy to week {selectedWeekIndex + 2}</Text>
          </Button>
        ) : null}
      </View>
    );
  }

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
      <Button
        onPress={() => onCopyWeek(selectedWeekIndex, selectedWeekIndex + 1)}
        testID="builder-copy-week"
        variant="outline"
      >
        <Text>
          Copy week {selectedWeekIndex + 1} to week {selectedWeekIndex + 2}
        </Text>
      </Button>
      {weekSummary ? <Text className="text-xs text-muted-foreground">{weekSummary}</Text> : null}
    </View>
  );
}

function BuilderSelectedDayPlanningPanel({
  metricsBySessionId,
  dateLabel,
  estimateBySessionId,
  onAddActivity,
  onDuplicateSession,
  onMoveSessionByDays,
  onPressSession,
  onRemoveSession,
  point,
  selectedDayOffset,
  sessions,
}: BuilderSelectedDayPlanningPanelProps) {
  const weekIndex = Math.floor(selectedDayOffset / 7);
  const title = dateLabel ?? formatBuilderWeekdayWithWeek(selectedDayOffset);

  return (
    <TrainingPathSelectedDayPanel
      action={
        <Button
          size="sm"
          variant="outline"
          onPress={onAddActivity}
          className="min-h-11 shrink-0"
          testID="builder-sessions-workspace-add"
        >
          <Plus size={14} className="text-foreground" />
          <Text className="text-sm font-medium text-foreground">Activity</Text>
        </Button>
      }
      emptyState="This day is ready to plan. Add a activity when this day should carry training load."
      eventCount={sessions.length}
      metadata={[
        `Week ${weekIndex + 1}`,
        `${sessions.length} activity${sessions.length === 1 ? "" : "s"}`,
      ]}
      metrics={buildTrainingPathLoadMetrics(point, { includeCompleted: false })}
      testID="builder-selected-day-panel"
      title={title}
    >
      <View className="gap-2 pb-2">
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
                Add a activity when this day should carry training load.
              </Text>
            </View>
          </View>
        ) : (
          sessions.map((sessionRow) => (
            <TrainingPlanBuilderEventCard
              key={sessionRow.session.localId}
              event={sessionRow.session}
              estimate={estimateBySessionId.get(sessionRow.session.localId) ?? null}
              projectionMetrics={metricsBySessionId?.get(sessionRow.session.localId)}
              onDuplicate={() => onDuplicateSession(sessionRow.session.localId)}
              onEdit={() => onPressSession(sessionRow.session.localId)}
              onMoveByDays={(days) => onMoveSessionByDays(sessionRow.session.localId, days)}
              onRemove={() => onRemoveSession(sessionRow.session.localId)}
            />
          ))
        )}
      </View>
    </TrainingPathSelectedDayPanel>
  );
}
