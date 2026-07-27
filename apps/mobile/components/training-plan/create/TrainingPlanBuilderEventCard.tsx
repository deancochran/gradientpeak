import type { ActivityPlanPlanningEstimate } from "@repo/core";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect } from "react";
import { useWatch } from "react-hook-form";
import { Pressable, useWindowDimensions, View } from "react-native";
import { z } from "zod";
import { type ActivityPlan, ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import type { ResourceMetric } from "@/components/shared/ResourceCardPrimitives";
import { shouldUseAccessibleBuilderLayout } from "@/components/training-plan/create/responsiveLayout";
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

const workoutTitleSchema = z.object({
  title: z.string(),
});

type TrainingPlanBuilderEventCardProps = {
  event: TrainingPlanBuilderSession;
  estimate?: ActivityPlanPlanningEstimate | null;
  onDuplicate: () => void;
  onEdit: () => void;
  onMoveByDays: (days: number) => void;
  onRemove: () => void;
};

type TrainingPlanBuilderEventEditorProps = {
  activityPlan?: ActivityPlan | null;
  event: TrainingPlanBuilderSession;
  onChange: (event: TrainingPlanBuilderSession) => void;
  onDuplicate: (eventId: string) => void;
  onOpenActivityPicker: (eventId: string) => void;
  onRemove: (eventId: string) => void;
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
    tss !== null ? `${Math.round(tss)} Load` : null,
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
    { label: "Load", value: tss !== null ? `${Math.round(tss)}` : "--", tone: "primary" },
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

function ChoicePill({
  accessibilityLabel,
  allowTextWrap = false,
  children,
  className,
  isSelected,
  onPress,
  textClassName,
}: {
  accessibilityLabel?: string;
  allowTextWrap?: boolean;
  children: string;
  className?: string;
  isSelected: boolean;
  onPress: () => void;
  textClassName?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      className={`${
        isSelected
          ? "min-h-11 justify-center rounded-full bg-primary px-3.5 py-2"
          : "min-h-11 justify-center rounded-full bg-muted/60 px-3.5 py-2"
      } ${className ?? ""}`}
      onPress={onPress}
    >
      <Text
        className={`${
          isSelected
            ? "text-xs font-semibold text-primary-foreground"
            : "text-xs font-medium text-foreground"
        } text-center ${textClassName ?? ""}`}
        numberOfLines={allowTextWrap ? undefined : 1}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function TrainingPlanBuilderEventCard({
  event,
  estimate,
  onDuplicate,
  onEdit,
  onMoveByDays,
  onRemove,
}: TrainingPlanBuilderEventCardProps) {
  const meta = getEventMeta(event, estimate);
  const metrics = getActivityMetrics(event, estimate);
  const scheduleLabel = formatBuilderWeekdayWithWeek(event.offsetDays);
  const { fontScale, width } = useWindowDimensions();
  const useVerticalLayout = shouldUseAccessibleBuilderLayout({ fontScale, width });

  return (
    <View className="gap-2">
      <TrainingPlanEventCard
        metrics={metrics}
        onPress={onEdit}
        scheduleLabel={scheduleLabel}
        statusLabel={!event.activityPlan ? "Needs workout" : null}
        subtitle={meta || null}
        testID={`builder-timeline-workout-${event.localId}`}
        title={getEventTitle(event)}
      />
      {event.activityPlan ? (
        <View className="gap-2" testID={`builder-workout-actions-${event.localId}`}>
          <View className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}>
            <EventAction label="Edit" onPress={onEdit} />
            <EventAction label="Duplicate" onPress={onDuplicate} />
          </View>
          <View className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}>
            <EventAction
              disabled={event.offsetDays === 0}
              label="Move earlier"
              onPress={() => onMoveByDays(-1)}
            />
            <EventAction label="Move later" onPress={() => onMoveByDays(1)} />
          </View>
          <EventAction destructive label="Remove" onPress={onRemove} />
        </View>
      ) : null}
    </View>
  );
}

function EventAction({
  destructive = false,
  disabled = false,
  label,
  onPress,
}: {
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`min-h-11 flex-1 items-center justify-center rounded-xl border px-3 py-2 disabled:opacity-40 ${
        destructive ? "border-destructive/30 bg-destructive/10" : "border-border bg-background"
      }`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className={`text-center text-sm font-semibold ${destructive ? "text-destructive" : "text-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TrainingPlanBuilderEventEditor({
  activityPlan,
  event,
  onChange,
  onDuplicate,
  onOpenActivityPicker,
  onRemove,
}: TrainingPlanBuilderEventEditorProps) {
  const updateEvent = useCallback(
    (patch: Partial<TrainingPlanBuilderSession>) => {
      onChange({ ...event, ...patch });
    },
    [event, onChange],
  );
  const updateOverride = useCallback(
    (field: keyof TrainingPlanBuilderEventOverrides, value: string) => {
      updateEvent({
        eventOverrides: compactOverrides({
          ...event.eventOverrides,
          [field]: value,
        }),
      });
    },
    [event.eventOverrides, updateEvent],
  );
  const selectedWeekdayIndex = getBuilderWeekdayIndex(event.offsetDays);
  const weekOffset = Math.floor(event.offsetDays / 7) * 7;
  const weekIndex = Math.floor(event.offsetDays / 7);
  const { fontScale, width } = useWindowDimensions();
  const useVerticalLayout = shouldUseAccessibleBuilderLayout({ fontScale, width });
  const weekdayRows = useVerticalLayout
    ? [
        BUILDER_WEEKDAY_NAMES.slice(0, 3),
        BUILDER_WEEKDAY_NAMES.slice(3, 6),
        BUILDER_WEEKDAY_NAMES.slice(6),
      ]
    : [BUILDER_WEEKDAY_NAMES];
  const titlePlaceholder = event.activityPlan?.name ?? "Unassigned workout";
  const title = event.eventOverrides?.title ?? "";
  const workoutTitleForm = useZodForm({
    schema: workoutTitleSchema,
    values: { title },
  });
  const workoutTitle = useWatch({
    control: workoutTitleForm.control,
    name: "title",
  });

  useEffect(() => {
    if (workoutTitle !== title) {
      updateOverride("title", workoutTitle);
    }
  }, [title, updateOverride, workoutTitle]);

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
      <Form {...workoutTitleForm}>
        <FormTextField
          className="border-0 bg-transparent px-0 text-2xl font-semibold text-foreground"
          control={workoutTitleForm.control}
          label="Workout title"
          name="title"
          placeholder={titlePlaceholder}
          testId="builder-session-editor-title"
        />
      </Form>

      {activityPlan ? (
        <View className="gap-2">
          <ActivityPlanCard
            activityPlan={activityPlan}
            testID="builder-session-editor-activity"
            variant="compact"
          />
          <Pressable
            accessibilityLabel="Reassign workout"
            accessibilityRole="button"
            className="min-h-11 justify-center self-start rounded-full px-2 py-1"
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
            accessibilityLabel="Reassign workout"
            accessibilityRole="button"
            className="min-h-11 justify-center self-start rounded-full px-2 py-1"
            onPress={() => onOpenActivityPicker(event.localId)}
            testID="builder-session-reassign-workout"
          >
            <Text className="text-xs font-semibold text-primary">Reassign workout</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityLabel="Choose workout"
          accessibilityRole="button"
          className="min-h-11 rounded-2xl border border-dashed border-border px-4 py-3"
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
              accessibilityLabel="Move workout to previous week"
              accessibilityRole="button"
              accessibilityState={{ disabled: weekIndex <= 0 }}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted/60 disabled:opacity-40"
              disabled={weekIndex <= 0}
              onPress={() => moveWeek(-1)}
            >
              <ChevronLeft size={18} className="text-foreground" />
            </Pressable>
            <Text className="flex-1 text-center text-base font-semibold text-foreground">
              Week {weekIndex + 1}
            </Text>
            <Pressable
              accessibilityLabel="Move workout to next week"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-muted/60"
              onPress={() => moveWeek(1)}
            >
              <ChevronRight size={18} className="text-foreground" />
            </Pressable>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Day</Text>
          <View accessibilityLabel="Workout day" accessibilityRole="radiogroup" className="gap-1">
            {weekdayRows.map((weekdays) => (
              <View className="flex-row gap-1" key={weekdays.join("-")}>
                {weekdays.map((weekday) => {
                  const weekdayIndex = BUILDER_WEEKDAY_NAMES.indexOf(weekday);
                  return (
                    <ChoicePill
                      accessibilityLabel={weekday}
                      allowTextWrap={useVerticalLayout}
                      key={weekday}
                      className="min-w-0 flex-1 items-center px-1 py-2"
                      isSelected={selectedWeekdayIndex === weekdayIndex}
                      onPress={() => setWeekday(weekdayIndex)}
                    >
                      {weekday.slice(0, 3)}
                    </ChoicePill>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Time</Text>
          <View accessibilityLabel="Workout time" accessibilityRole="radiogroup" className="gap-2">
            <View className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}>
              <ChoicePill
                allowTextWrap={useVerticalLayout}
                className="flex-1 px-2 py-2"
                isSelected={!event.eventOverrides?.start_time}
                onPress={() => updateOverride("start_time", "")}
              >
                No time
              </ChoicePill>
              <ChoicePill
                allowTextWrap={useVerticalLayout}
                className="flex-1 px-2 py-2"
                isSelected={event.eventOverrides?.start_time === TIME_PRESETS[0].value}
                onPress={() => updateOverride("start_time", TIME_PRESETS[0].value)}
              >
                {TIME_PRESETS[0].label}
              </ChoicePill>
            </View>
            <View className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}>
              {TIME_PRESETS.slice(1).map((preset) => (
                <ChoicePill
                  allowTextWrap={useVerticalLayout}
                  className="flex-1 px-2 py-2"
                  key={preset.value}
                  isSelected={event.eventOverrides?.start_time === preset.value}
                  onPress={() => updateOverride("start_time", preset.value)}
                >
                  {preset.label}
                </ChoicePill>
              ))}
            </View>
          </View>
        </View>
      </View>
      {event.activityPlan ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Workout actions</Text>
          <View className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}>
            <EventAction label="Duplicate" onPress={() => onDuplicate(event.localId)} />
            <EventAction
              disabled={event.offsetDays === 0}
              label="Move earlier"
              onPress={() => updateEvent({ offsetDays: Math.max(0, event.offsetDays - 1) })}
            />
          </View>
          <View className={useVerticalLayout ? "gap-2" : "flex-row gap-2"}>
            <EventAction
              label="Move later"
              onPress={() => updateEvent({ offsetDays: event.offsetDays + 1 })}
            />
            <EventAction destructive label="Remove" onPress={() => onRemove(event.localId)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
