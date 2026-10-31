import {
  type ActivityPlanMetric,
  type ActivityPlanPlanningEstimate,
  type ActivityPlanSummary,
  createActivityPlanMetric,
  getPlannedEstimate,
  type PlannedCalculatedQuantity,
  type PlannedQuantity,
} from "@repo/core";
import {
  durationMinutesToSeconds,
  durationSecondsToWholeMinutes,
  durationSegmentsText,
  durationTextSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "@repo/core/utils/fitness-inputs";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Form, FormTextField } from "@repo/ui/components/form";
import { SegmentedDurationField } from "@repo/ui/components/segmented-duration-field";
import { Text } from "@repo/ui/components/text";
import { TimeInput } from "@repo/ui/components/time-input";
import { useInputDraft, useZodForm } from "@repo/ui/hooks";
import { formatActivityPlanHeadlineMetric } from "@repo/ui/lib/activity-plan-metric-presentation";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import { Pressable, useWindowDimensions, View } from "react-native";
import { z } from "zod";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
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

const PLANNED_DURATION_PRESETS = [30, 45, 60, 90] as const;

const activityTitleSchema = z.object({
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
  activityPlan?: ActivityPlanSummary | null;
  event: TrainingPlanBuilderSession;
  onChange: (event: TrainingPlanBuilderSession) => void;
  onDuplicate: (eventId: string) => void;
  onOpenActivityPicker: (eventId: string) => void;
  onRemove: (eventId: string) => void;
  onNumericDraftError?: (key: string, message: string | null) => void;
  rawDrafts?: Record<string, string> | undefined;
  onRawDraftChange?: ((key: string, value: string) => void) | undefined;
};

function getEventTitle(event: TrainingPlanBuilderSession) {
  return event.eventOverrides?.title || event.activityPlan?.name || "Unassigned activity";
}

function getBuilderPlannedEstimate(
  event: TrainingPlanBuilderSession,
  estimate?: ActivityPlanPlanningEstimate | null,
) {
  const quantification =
    estimate === undefined
      ? event.activityPlan?.prescriptionQuantification
      : estimate?.prescriptionQuantification;
  return quantification ? getPlannedEstimate(quantification) : null;
}

type BuilderHeadlineMetrics = {
  duration: ActivityPlanMetric;
  load: ActivityPlanMetric;
  objectiveIntensity: ActivityPlanMetric;
};

function unavailableMetric(
  key: ActivityPlanMetric["key"],
  label: string,
  unit: string,
  reason = "not_available",
): ActivityPlanMetric {
  return createActivityPlanMetric({
    key,
    label,
    status: "unavailable",
    value: null,
    unit,
    reason,
    provenance: null,
  });
}

function durationMetric(quantity: PlannedQuantity<number> | undefined): ActivityPlanMetric {
  if (quantity?.status === "known" || quantity?.status === "estimated") {
    return createActivityPlanMetric({
      key: "elapsed_duration",
      label: "Duration",
      status: "available",
      value: quantity.value,
      unit: "seconds",
      reason: null,
      provenance: quantity.status === "known" ? "authored" : "estimated",
    });
  }
  return unavailableMetric(
    "elapsed_duration",
    "Duration",
    "seconds",
    quantity?.status === "partial"
      ? "incomplete_members"
      : quantity?.status === "unavailable"
        ? quantity.reason
        : "not_available",
  );
}

function loadMetric(quantity: PlannedCalculatedQuantity | undefined): ActivityPlanMetric {
  if (quantity?.status === "estimated") {
    return createActivityPlanMetric({
      key: "common_load",
      label: "Common Load",
      status: "available",
      value: quantity.value,
      unit: "score",
      reason: null,
      provenance: "estimated",
    });
  }
  return unavailableMetric(
    "common_load",
    "Common Load",
    "score",
    quantity?.status === "partial" ? "incomplete_members" : (quantity?.reason ?? "not_available"),
  );
}

function objectiveIntensityMetric(
  projection: ActivityPlanPlanningEstimate["planProjection"],
): ActivityPlanMetric {
  const objectiveIntensity = projection?.objectiveIntensity;
  if (objectiveIntensity?.status === "available") {
    return createActivityPlanMetric({
      key: "objective_intensity",
      label: "Intensity",
      status: "available",
      value: objectiveIntensity.value,
      unit: "ratio",
      reason: null,
      provenance: "estimated",
    });
  }
  return unavailableMetric(
    "objective_intensity",
    "Intensity",
    "ratio",
    objectiveIntensity?.reason ?? "not_available",
  );
}

function getBuilderHeadlineMetrics(
  event: TrainingPlanBuilderSession,
  estimate?: ActivityPlanPlanningEstimate | null,
): BuilderHeadlineMetrics | null {
  if (!event.activityPlan) return null;
  const plannedEstimate = getBuilderPlannedEstimate(event, estimate);
  return {
    duration: durationMetric(plannedEstimate?.durationSeconds),
    load: loadMetric(plannedEstimate?.load),
    objectiveIntensity: objectiveIntensityMetric(estimate?.planProjection),
  };
}

function getEventMeta(event: TrainingPlanBuilderSession, metrics: BuilderHeadlineMetrics | null) {
  const duration = metrics
    ? formatActivityPlanHeadlineMetric(metrics.duration, "elapsed_duration")
    : null;
  const load = metrics ? formatActivityPlanHeadlineMetric(metrics.load, "common_load") : null;
  return [
    event.eventOverrides?.start_time || null,
    duration === "—" ? null : duration,
    load === null || load === "—" ? null : `Common Load ${load}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function getActivityMetrics(metrics: BuilderHeadlineMetrics | null): ResourceMetric[] {
  if (!metrics) return [];
  return [
    {
      label: "Duration",
      value: formatActivityPlanHeadlineMetric(metrics.duration, "elapsed_duration"),
    },
    {
      label: "Common Load",
      value: formatActivityPlanHeadlineMetric(metrics.load, "common_load"),
      tone: "primary",
    },
    {
      label: "Intensity",
      value: formatActivityPlanHeadlineMetric(metrics.objectiveIntensity, "objective_intensity"),
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
  const headlineMetrics = getBuilderHeadlineMetrics(event, estimate);
  const meta = getEventMeta(event, headlineMetrics);
  const metrics = getActivityMetrics(headlineMetrics);
  const scheduleLabel = formatBuilderWeekdayWithWeek(event.offsetDays);
  const { fontScale, width } = useWindowDimensions();
  const useVerticalLayout = shouldUseAccessibleBuilderLayout({ fontScale, width });

  return (
    <View className="gap-2">
      <TrainingPlanEventCard
        metrics={metrics}
        onPress={onEdit}
        scheduleLabel={scheduleLabel}
        statusLabel={!event.activityPlan ? "Needs activity" : null}
        subtitle={meta || null}
        testID={`builder-timeline-activity-${event.localId}`}
        title={getEventTitle(event)}
      />
      {event.activityPlan ? (
        <View className="gap-2" testID={`builder-activity-actions-${event.localId}`}>
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
  onNumericDraftError = () => undefined,
  rawDrafts,
  onRawDraftChange,
}: TrainingPlanBuilderEventEditorProps) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const updateEvent = useCallback(
    (patch: Partial<TrainingPlanBuilderSession>) => {
      if (!mounted.current) return;
      onChange({ ...event, ...patch });
    },
    [event, onChange],
  );
  const updateOverride = useCallback(
    (field: keyof TrainingPlanBuilderEventOverrides, value: string) => {
      if (!mounted.current) return;
      const eventOverrides = compactOverrides({
        ...event.eventOverrides,
        [field]: value,
      });
      if (eventOverrides) {
        updateEvent({ eventOverrides });
        return;
      }
      const { eventOverrides: _removed, ...eventWithoutOverrides } = event;
      onChange(eventWithoutOverrides);
    },
    [event, onChange, updateEvent],
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
  const titlePlaceholder = event.activityPlan?.name ?? "Unassigned activity";
  const title = event.eventOverrides?.title ?? "";
  const activityTitleForm = useZodForm({
    schema: activityTitleSchema,
    values: { title },
  });
  const activityTitle = useWatch({
    control: activityTitleForm.control,
    name: "title",
  });

  useEffect(() => {
    if (activityTitle !== title) {
      updateOverride("title", activityTitle);
    }
  }, [title, updateOverride, activityTitle]);

  const setWeekday = (weekdayIndex: number) => {
    updateEvent({ offsetDays: weekOffset + weekdayIndex });
  };
  const moveWeek = (deltaWeeks: number) => {
    updateEvent({ offsetDays: Math.max(0, event.offsetDays + deltaWeeks * 7) });
  };
  const updateDemand = (patch: Partial<TrainingPlanBuilderSession["demand"]>) =>
    updateEvent({ demand: { ...event.demand, ...patch } });
  const [plannedDurationDraft, setPlannedDurationDraft] = useInputDraft(
    rawDrafts?.[`session:${event.localId}:planned-duration`] ??
      durationSegmentsText(
        splitDurationSeconds(durationMinutesToSeconds(event.demand.target_duration_minutes), "hm"),
        { layout: "hm" },
      ),
    event.localId,
  );
  const updatePlannedDuration = (value: string) => {
    if (!mounted.current) return;
    setPlannedDurationDraft(value);
    onRawDraftChange?.(`session:${event.localId}:planned-duration`, value);
    if (!value.trim()) {
      onNumericDraftError(`session:${event.localId}:planned-duration`, null);
      updateDemand({ target_duration_minutes: null });
      return;
    }
    const seconds = parseDurationSegments(durationTextSegments(value, "hm"), {
      layout: "hm",
      minSeconds: 60,
      maxSeconds: 36000,
      granularitySeconds: 60,
      allowOmittedSegments: true,
    });
    const duration = seconds === null ? undefined : durationSecondsToWholeMinutes(seconds);
    if (duration === undefined) {
      onNumericDraftError(
        `session:${event.localId}:planned-duration`,
        "Planned duration must be a whole number from 1 to 600 minutes.",
      );
      return;
    }
    onNumericDraftError(`session:${event.localId}:planned-duration`, null);
    updateDemand({ target_duration_minutes: duration });
  };
  const loadKey = `session:${event.localId}:target-common-load`;
  const [loadDraft, setLoadDraft] = useInputDraft(
    rawDrafts?.[loadKey] ?? event.demand.target_common_load?.toString() ?? "",
    event.localId,
  );
  const updateLoad = (value: string) => {
    if (!mounted.current) return;
    setLoadDraft(value);
    onRawDraftChange?.(loadKey, value);
    const parsed = value.trim() ? Number(value) : null;
    const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000);
    onNumericDraftError(
      loadKey,
      invalid ? "Target common load must be a whole number from 0 to 10000." : null,
    );
    if (!invalid) updateDemand({ target_common_load: parsed });
  };
  return (
    <View className="gap-4 pb-1" testID="builder-session-editor-modal">
      <Form {...activityTitleForm}>
        <FormTextField
          className="border-0 bg-transparent px-0 text-2xl font-semibold text-foreground"
          control={activityTitleForm.control}
          label="Activity title"
          name="title"
          placeholder={titlePlaceholder}
          testId="builder-session-editor-title"
        />
      </Form>

      {activityPlan ? (
        <View className="gap-2">
          <ActivityPlanCard
            plan={activityPlan}
            testID="builder-session-editor-activity"
            variant="compact"
          />
          <Pressable
            accessibilityLabel="Reassign activity"
            accessibilityRole="button"
            className="min-h-11 justify-center self-start rounded-full px-2 py-1"
            onPress={() => onOpenActivityPicker(event.localId)}
            testID="builder-session-reassign-activity"
          >
            <Text className="text-xs font-semibold text-primary">Reassign activity</Text>
          </Pressable>
        </View>
      ) : event.activityPlan ? (
        <View className="gap-2">
          <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
            <Text className="font-medium text-foreground">{event.activityPlan.name}</Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Plan details are unavailable. Reassign to load a current projection.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Reassign activity"
            accessibilityRole="button"
            className="min-h-11 justify-center self-start rounded-full px-2 py-1"
            onPress={() => onOpenActivityPicker(event.localId)}
            testID="builder-session-reassign-activity"
          >
            <Text className="text-xs font-semibold text-primary">Reassign activity</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityLabel="Choose activity"
          accessibilityRole="button"
          className="min-h-11 rounded-2xl border border-dashed border-border px-4 py-3"
          onPress={() => onOpenActivityPicker(event.localId)}
          testID="builder-session-assign-activity"
        >
          <Text className="text-sm font-medium text-foreground">Choose activity</Text>
        </Pressable>
      )}

      <View className="gap-4">
        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Session demand</Text>
          <View
            accessibilityLabel="Activity category"
            accessibilityRole="radiogroup"
            className="flex-row gap-1"
          >
            {(["run", "bike", "swim", "strength", "other"] as const).map((category) => (
              <ChoicePill
                className="flex-1 px-1"
                isSelected={event.demand.activity_category === category}
                key={category}
                onPress={() => updateDemand({ activity_category: category })}
              >
                {category}
              </ChoicePill>
            ))}
          </View>
          <View
            accessibilityLabel="Session importance"
            accessibilityRole="radiogroup"
            className="flex-row gap-2"
          >
            {(["support", "normal", "key"] as const).map((importance) => (
              <ChoicePill
                className="flex-1"
                isSelected={event.demand.importance === importance}
                key={importance}
                onPress={() => updateDemand({ importance })}
              >
                {importance}
              </ChoicePill>
            ))}
          </View>
          <View
            accessibilityLabel="Training intent"
            accessibilityRole="radiogroup"
            className="gap-1"
          >
            {(
              [
                "recovery",
                "aerobic_base",
                "durable_endurance",
                "threshold_development",
                "vo2max",
                "race_specific",
                "anaerobic_capacity",
                "muscular_endurance",
                "speed_skill",
                "technique",
                "strength_support",
                "general_maintenance",
              ] as const
            ).map((training_intent) => (
              <ChoicePill
                allowTextWrap
                isSelected={event.demand.training_intent === training_intent}
                key={training_intent}
                onPress={() => updateDemand({ training_intent })}
              >
                {training_intent.replaceAll("_", " ")}
              </ChoicePill>
            ))}
          </View>
          <Text className="text-sm font-medium">Planned duration</Text>
          <SegmentedDurationField
            presentation="native-overlay"
            label="Planned duration"
            layout="hm"
            minSeconds={60}
            maxSeconds={36000}
            granularitySeconds={60}
            allowOmittedSegments
            required={false}
            isCurrent={() => mounted.current}
            valueSeconds={durationMinutesToSeconds(event.demand.target_duration_minutes)}
            segments={durationTextSegments(plannedDurationDraft, "hm")}
            onSegmentsChange={(parts) =>
              updatePlannedDuration(
                durationSegmentsText(parts, {
                  layout: "hm",
                  minSeconds: 60,
                  maxSeconds: 36000,
                  allowOmittedSegments: true,
                }),
              )
            }
            onChangeSeconds={() => undefined}
            onInvalidChange={(invalid) =>
              onNumericDraftError(
                `session:${event.localId}:planned-duration`,
                invalid ? "Enter whole hours and minutes totaling 1–600 minutes." : null,
              )
            }
          />
          <View
            accessibilityLabel="Planned duration presets"
            accessibilityRole="radiogroup"
            className="flex-row gap-2"
          >
            {PLANNED_DURATION_PRESETS.map((duration) => (
              <ChoicePill
                className="flex-1 px-1"
                isSelected={event.demand.target_duration_minutes === duration}
                key={duration}
                onPress={() =>
                  updatePlannedDuration(
                    durationSegmentsText(splitDurationSeconds(duration * 60, "hm"), {
                      layout: "hm",
                    }),
                  )
                }
              >
                {formatDurationSeconds(duration * 60)}
              </ChoicePill>
            ))}
          </View>
          <BoundedNumberInput
            adjustmentStep={10}
            clampProjection={false}
            decimals={0}
            label="Target common load"
            max={10000}
            min={0}
            onChange={updateLoad}
            showAdjustmentButtons
            value={loadDraft}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Week</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityLabel="Move activity to previous week"
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
              accessibilityLabel="Move activity to next week"
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
          <View accessibilityLabel="Activity day" accessibilityRole="radiogroup" className="gap-1">
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
                      {weekday}
                    </ChoicePill>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-muted-foreground">Time</Text>
          <TimeInput
            id="builder-session-clock"
            testId="builder-session-clock"
            label="Exact start time"
            clearable
            is24Hour
            {...(event.eventOverrides?.start_time
              ? { value: event.eventOverrides.start_time }
              : {})}
            onChange={(value) => updateOverride("start_time", value ?? "")}
          />
          <View accessibilityLabel="Activity time" accessibilityRole="radiogroup" className="gap-2">
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
          <Text className="text-sm font-semibold text-muted-foreground">Activity actions</Text>
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
