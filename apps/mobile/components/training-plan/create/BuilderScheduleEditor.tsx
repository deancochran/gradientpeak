import type { ActivityPlanPlanningEstimate } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Plus } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import type { DailyTrainingAdjustmentPoint } from "@/components/plan/training-path/DailyTrainingAdjustmentChart";
import { BuilderTrainingPathReviewSection } from "@/components/training-plan/create/BuilderTrainingPathReviewSection";
import { TrainingPlanBuilderEventCard } from "@/components/training-plan/create/TrainingPlanBuilderEventCard";
import type { TrainingPlanBuilderController } from "@/components/training-plan/create/useTrainingPlanBuilderController";
import {
  formatBuilderCompactDateLabel,
  formatBuilderWeekdayWithWeek,
} from "@/lib/training-plan-creation/formatters";
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
  const selectedDateLabel = chartReview.selectedDate
    ? formatBuilderCompactDateLabel(chartReview.selectedDate)
    : null;

  const renderSelectedDayPanel = (point: DailyTrainingAdjustmentPoint | null) => (
    <BuilderSelectedDayPlanningPanel
      dateLabel={selectedDateLabel}
      estimateBySessionId={estimateBySessionId}
      onAddWorkout={() => onAddSessionAtOffset(selectedDayOffset)}
      onDuplicateSession={onDuplicateSession}
      onMoveSessionByDays={onMoveSessionByDays}
      onPressSession={onPressSession}
      onRemoveSession={onRemoveSession}
      point={point ?? selectedDayPoint}
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
  const delta = valueOrZero(point?.plannedDeltaTss ?? planned - recommended);

  return (
    <View className="gap-3" testID="builder-selected-day-panel">
      <View className="gap-3 rounded-2xl bg-card px-3 py-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {formatBuilderWeekdayWithWeek(selectedDayOffset)}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {dateLabel ? `${dateLabel} · ` : ""}
              {sessions.length} workout{sessions.length === 1 ? "" : "s"}
            </Text>
          </View>
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
        </View>
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <InlineMetric label="Recommended" value={formatTss(recommended)} />
          <InlineMetric label="Planned" value={formatTss(planned)} />
          <InlineMetric label="Delta" value={formatSignedTss(delta)} />
          {point?.formTsb != null ? (
            <InlineMetric label="Form" value={point.formTsb.toFixed(1)} />
          ) : null}
          {point?.readinessScore != null ? (
            <InlineMetric label="Readiness" value={`${Math.round(point.readinessScore * 100)}%`} />
          ) : null}
        </View>
        {point?.annotations?.length ? (
          <View className="gap-1">
            {point.annotations.map((annotation) => (
              <Text
                className="text-xs text-muted-foreground"
                key={`${annotation.code}-${annotation.message ?? ""}`}
              >
                {annotation.message ?? annotation.code}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

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
    </View>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text className="text-[10px] font-medium text-muted-foreground">{label}</Text>
      <Text className="text-xs font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function valueOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatTss(value: number) {
  return `${Math.round(value)} TSS`;
}

function formatSignedTss(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "On target";
  return `${rounded > 0 ? "+" : ""}${rounded} TSS`;
}
