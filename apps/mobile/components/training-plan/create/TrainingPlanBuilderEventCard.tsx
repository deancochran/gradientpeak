import type { ActivityPlanPlanningEstimate } from "@repo/core";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { type ActivityPlan, ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import type { ResourceMetric } from "@/components/shared/ResourceCardPrimitives";
import { TrainingPlanEventCard } from "@/components/training-plan/TrainingPlanEventCard";
import {
  BUILDER_WEEKDAY_NAMES,
  formatBuilderWeekdayWithWeek,
  getBuilderWeekdayIndex,
} from "@/lib/training-plan-creation/formatters";
import type {
  TrainingPlanBuilderEventOverrides,
  TrainingPlanBuilderSession,
} from "@/lib/training-plan-creation/types";

const TIME_PRESETS = [
  { label: "Morning", value: "08:00" },
  { label: "Midday", value: "12:00" },
  { label: "Evening", value: "18:00" },
] as const;

type TrainingPlanBuilderEventCardProps = {
  event: TrainingPlanBuilderSession;
  estimate?: ActivityPlanPlanningEstimate | null;
  onDuplicate?: () => void;
  onEdit?: () => void;
  onMoveByDays?: (days: number) => void;
  onRemove?: () => void;
};

type TrainingPlanBuilderEventEditorProps = {
  activityPlan?: ActivityPlan | null;
  event: TrainingPlanBuilderSession;
  onChange: (event: TrainingPlanBuilderSession) => void;
  onDuplicate: (eventId: string) => void;
  onOpenActivityPicker: (eventId: string) => void;
};

function getEventTitle(event: TrainingPlanBuilderSession) {
  return event.eventOverrides?.title || event.activityPlan?.name || "Unassigned workout";
}

function getEventMeta(
  event: TrainingPlanBuilderSession,
  estimate?: ActivityPlanPlanningEstimate | null,
) {
  const tss = estimate?.tss ?? event.activityPlan?.estimatedTss ?? event.intent?.targetTss ?? null;
  const durationSeconds =
    estimate?.durationSeconds ??
    event.activityPlan?.estimatedDurationSeconds ??
    event.intent?.targetDurationSeconds ??
    null;
  const minutes = durationSeconds ? Math.round(durationSeconds / 60) : null;
  return [
    event.eventOverrides?.start_time || null,
    minutes !== null ? `${minutes} min` : null,
    tss !== null ? `${Math.round(tss)} TSS` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function formatDurationMetric(durationSeconds: number | null | undefined) {
  if (!durationSeconds) return "--";
  const minutes = Math.round(durationSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getActivityMetrics(
  event: TrainingPlanBuilderSession,
  estimate?: ActivityPlanPlanningEstimate | null,
): ResourceMetric[] {
  if (!event.activityPlan) return [];
  const tss = estimate?.tss ?? event.activityPlan.estimatedTss ?? null;
  const durationSeconds =
    estimate?.durationSeconds ?? event.activityPlan.estimatedDurationSeconds ?? null;
  const intensityFactor = estimate?.intensityFactor ?? null;
  return [
    { label: "Duration", value: formatDurationMetric(durationSeconds) },
    { label: "TSS", value: tss !== null ? `${Math.round(tss)}` : "--", tone: "primary" },
    {
      label: "Intensity",
      value: intensityFactor ? intensityFactor.toFixed(2) : "--",
      tone: "primary",
    },
  ];
}

function compactOverrides(
  overrides: TrainingPlanBuilderEventOverrides | undefined,
): TrainingPlanBuilderEventOverrides | undefined {
  if (!overrides) return undefined;

  const next: TrainingPlanBuilderEventOverrides = {};
  const title = overrides.title?.trim();
  const description = overrides.description?.trim();
  const startTime = overrides.start_time?.trim();

  if (title) next.title = title;
  if (description) next.description = description;
  if (startTime) next.start_time = startTime;

  return Object.keys(next).length > 0 ? next : undefined;
}

function formatTimeSummary(startTime: string | null | undefined) {
  if (!startTime) return "No specific time preference";
  const preset = TIME_PRESETS.find((option) => option.value === startTime);
  return preset ? `${preset.label} · ${startTime}` : startTime;
}

function ChoicePill({
  children,
  className,
  isSelected,
  onPress,
  textClassName,
}: {
  children: string;
  className?: string;
  isSelected: boolean;
  onPress: () => void;
  textClassName?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`${
        isSelected ? "rounded-full bg-primary px-3.5 py-2" : "rounded-full bg-muted/60 px-3.5 py-2"
      } ${className ?? ""}`}
      onPress={onPress}
    >
      <Text
        className={`${
          isSelected
            ? "text-xs font-semibold text-primary-foreground"
            : "text-xs font-medium text-foreground"
        } text-center ${textClassName ?? ""}`}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function TrainingPlanBuilderEventCard({
  event,
  estimate,
  onEdit,
}: TrainingPlanBuilderEventCardProps) {
  const meta = getEventMeta(event, estimate);
  const metrics = getActivityMetrics(event, estimate);
  const scheduleLabel = formatBuilderWeekdayWithWeek(event.offsetDays);

  return (
    <TrainingPlanEventCard
      metrics={metrics}
      onPress={onEdit}
      scheduleLabel={scheduleLabel}
      statusLabel={!event.activityPlan ? "Needs workout" : null}
      subtitle={meta || null}
      testID={`builder-timeline-workout-${event.localId}`}
      title={getEventTitle(event)}
    />
  );
}

export function TrainingPlanBuilderEventEditor({
  activityPlan,
  event,
  onChange,
  onOpenActivityPicker,
}: TrainingPlanBuilderEventEditorProps) {
  const updateEvent = (patch: Partial<TrainingPlanBuilderSession>) => {
    onChange({ ...event, ...patch });
  };
  const updateOverride = (field: keyof TrainingPlanBuilderEventOverrides, value: string) => {
    updateEvent({
      eventOverrides: compactOverrides({
        ...event.eventOverrides,
        [field]: value,
      }),
    });
  };
  const selectedWeekdayIndex = getBuilderWeekdayIndex(event.offsetDays);
  const weekOffset = Math.floor(event.offsetDays / 7) * 7;
  const weekIndex = Math.floor(event.offsetDays / 7);
  const titlePlaceholder = event.activityPlan?.name ?? "Unassigned workout";
  const setWeekday = (weekdayIndex: number) => {
    updateEvent({ offsetDays: weekOffset + weekdayIndex });
  };
  const moveWeek = (deltaWeeks: number) => {
    updateEvent({ offsetDays: Math.max(0, event.offsetDays + deltaWeeks * 7) });
  };
  const fallbackActivity = event.activityPlan
    ? {
        id: event.activityPlan.id,
        name: event.activityPlan.name,
        activityType: "other" as const,
        estimatedDuration: event.activityPlan.estimatedDurationSeconds ?? undefined,
        estimatedTss: event.activityPlan.estimatedTss ?? undefined,
      }
    : null;

  return (
    <View className="gap-4 pb-1" testID="builder-session-editor-modal">
      <Input
        accessibilityLabel="Workout title"
        className="border-0 bg-transparent px-0 text-2xl font-semibold text-foreground"
        onChangeText={(title) => updateOverride("title", title)}
        placeholder={titlePlaceholder}
        testID="builder-session-editor-title"
        value={event.eventOverrides?.title ?? ""}
      />

      {activityPlan ? (
        <View className="gap-2">
          <ActivityPlanCard
            activityPlan={activityPlan}
            testID="builder-session-editor-activity"
            variant="compact"
          />
          <Pressable
            accessibilityRole="button"
            className="self-start rounded-full px-1 py-1"
            onPress={() => onOpenActivityPicker(event.localId)}
            testID="builder-session-reassign-workout"
          >
            <Text className="text-xs font-semibold text-primary">Reassign workout</Text>
          </Pressable>
        </View>
      ) : fallbackActivity ? (
        <View className="gap-2">
          <ActivityPlanCard
            activity={fallbackActivity}
            testID="builder-session-editor-activity"
            variant="compact"
          />
          <Pressable
            accessibilityRole="button"
            className="self-start rounded-full px-1 py-1"
            onPress={() => onOpenActivityPicker(event.localId)}
            testID="builder-session-reassign-workout"
          >
            <Text className="text-xs font-semibold text-primary">Reassign workout</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          className="rounded-2xl border border-dashed border-border px-4 py-3"
          onPress={() => onOpenActivityPicker(event.localId)}
          testID="builder-session-assign-workout"
        >
          <Text className="text-sm font-medium text-foreground">Choose workout</Text>
        </Pressable>
      )}

      <View className="gap-4">
        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Week</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full bg-muted/60 disabled:opacity-40"
              disabled={weekIndex <= 0}
              onPress={() => moveWeek(-1)}
            >
              <ChevronLeft size={18} className="text-foreground" />
            </Pressable>
            <Text className="flex-1 text-center text-base font-semibold text-foreground">
              Week {weekIndex + 1}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full bg-muted/60"
              onPress={() => moveWeek(1)}
            >
              <ChevronRight size={18} className="text-foreground" />
            </Pressable>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Day</Text>
          <View className="flex-row flex-wrap gap-2">
            {BUILDER_WEEKDAY_NAMES.map((weekday, weekdayIndex) => (
              <ChoicePill
                key={weekday}
                className="items-center px-3 py-2"
                isSelected={selectedWeekdayIndex === weekdayIndex}
                onPress={() => setWeekday(weekdayIndex)}
              >
                {weekday.slice(0, 3)}
              </ChoicePill>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Time</Text>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="flex-row items-center gap-2"
          >
            <ChoicePill
              className="px-3 py-2"
              isSelected={!event.eventOverrides?.start_time}
              onPress={() => updateOverride("start_time", "")}
            >
              No time
            </ChoicePill>
            {TIME_PRESETS.map((preset) => (
              <ChoicePill
                key={preset.value}
                className="px-3 py-2"
                isSelected={event.eventOverrides?.start_time === preset.value}
                onPress={() => updateOverride("start_time", preset.value)}
              >
                {preset.label}
              </ChoicePill>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
