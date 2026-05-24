/**
 * ScheduleActivityModal - Simplified Activity Scheduling Component
 *
 * ## Purpose
 * A focused modal for scheduling a specific activity plan. The plan must be
 * pre-selected before opening this modal, keeping the UX simple and focused.
 *
 * ## Design Philosophy
 * - User browses plans first (discover, detail page, etc.)
 * - User clicks "Schedule" with a specific plan in mind
 * - Modal opens with only date and notes to configure
 * - Much simpler and faster than full-page form
 *
 * ## Features
 * - Pre-selected activity plan (required)
 * - Date picker with formatted display
 * - Optional notes field
 * - Constraint validation (when used with training plans)
 * - Edit mode support
 * - Loading states and error handling
 *
 * ## Usage Examples
 *
 * ### Schedule from Discover/Detail Page
 * ```tsx
 * const [showModal, setShowModal] = useState(false);
 * const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
 *
 * <Button onPress={() => {
 *   setSelectedPlan(plan.id);
 *   setShowModal(true);
 * }}>
 *   Schedule
 * </Button>
 *
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   activityPlanId={selectedPlan!}
 *   onSuccess={() => refetch()}
 * />
 * ```
 *
 * ### Schedule with Pre-selected Date (from calendar)
 * ```tsx
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   activityPlanId={planId}
 *   preselectedDate={selectedDate}
 * />
 * ```
 *
 * ### Edit Existing Schedule
 * ```tsx
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   eventId={activityId}
 * />
 * ```
 *
 * ### With Training Plan Constraints
 * ```tsx
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   activityPlanId={planId}
 *   trainingPlanId={trainingPlanId}
 *   preselectedDate={selectedDate}
 * />
 * ```
 */

import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormDateInputField,
  FormSwitchField,
  FormTextareaField,
  FormTimeInputField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ActivityIndicator, Pressable, View } from "react-native";
import { z } from "zod";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { applyServerFormErrors, getErrorMessage } from "@/lib/utils/formErrors";
import { ConstraintValidator } from "./training-plan/modals/components/ConstraintValidator";

const scheduleActivityModalFormSchema = z.object({
  activityPlanId: z.string().uuid("Please select an activity plan"),
  scheduledDate: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date format"),
  notes: z.string().nullable().optional(),
  trainingPlanId: z.string().uuid().optional().nullable(),
  allDay: z.boolean(),
  scheduledTime: z.string().nullable().optional(),
});
type ScheduleActivityModalFormInput = z.input<typeof scheduleActivityModalFormSchema>;
type ScheduleActivityModalFormOutput = z.output<typeof scheduleActivityModalFormSchema>;
type EditScope = "single" | "future" | "series";

interface ScheduleActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;

  // Either provide activityPlanId (database ID), activityPlan (template object), or eventId (edit)
  activityPlanId?: string;
  activityPlan?: any; // Template object from discover/samples
  eventId?: string;

  // Optional pre-selected date
  preselectedDate?: string;

  // Training plan context (for constraint validation)
  trainingPlanId?: string;

  // Recurrence scope for edit mode updates
  editScope?: EditScope;
}

function isRecurringEvent(event: any) {
  if (!event) {
    return false;
  }

  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

function toDateOnlyString(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

function toPickerDate(value: string | null | undefined): Date {
  if (!value) {
    return new Date();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
}

function setRootFormError(
  form: Partial<Pick<UseFormReturn<ScheduleActivityModalFormOutput>, "setError">>,
  error: unknown,
  fallbackMessage: string,
) {
  if (
    form.setError &&
    applyServerFormErrors(
      form as Pick<UseFormReturn<ScheduleActivityModalFormOutput>, "setError">,
      error,
    )
  ) {
    return;
  }

  form.setError?.("root", {
    type: "server",
    message: getErrorMessage(error) || fallbackMessage,
  });
}

function clearRootFormError(
  form: Partial<Pick<UseFormReturn<ScheduleActivityModalFormOutput>, "clearErrors">>,
) {
  form.clearErrors?.("root");
}

async function runMutation<TInput>(
  mutation: {
    mutateAsync?: (input: TInput) => Promise<unknown>;
    mutate?: (input: TInput) => void;
  },
  input: TInput,
) {
  if (mutation.mutateAsync) {
    await mutation.mutateAsync(input);
    return;
  }

  if (mutation.mutate) {
    mutation.mutate(input);
    return;
  }

  throw new Error("Mutation is unavailable");
}

function buildAllDayStartIso(value: Date) {
  return `${toDateOnlyString(value)}T00:00:00.000Z`;
}

function getRRuleWeekday(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day] ?? "MO";
}

function buildWeeklyRecurrence(dateKey: string, occurrenceCount: number) {
  return {
    rule: `FREQ=WEEKLY;INTERVAL=1;COUNT=${occurrenceCount};BYDAY=${getRRuleWeekday(dateKey)}`,
    timezone: "UTC",
  };
}

function buildStartsAtFromEditorValues(input: {
  scheduledDate: string;
  scheduledTime: string | null;
  allDay: boolean;
}) {
  return toPickerDate(
    input.allDay || !input.scheduledTime
      ? input.scheduledDate
      : `${input.scheduledDate}T${input.scheduledTime}:00.000Z`,
  );
}

function parseEventDateForEditor(event: { starts_at: string; all_day?: boolean | null }) {
  if (event.all_day) {
    return toPickerDate(event.starts_at.slice(0, 10));
  }

  return new Date(event.starts_at);
}

function toScheduleCreatePayload(input: {
  data: ScheduleActivityModalFormOutput;
  recurrence: ReturnType<typeof buildWeeklyRecurrence> | undefined;
}) {
  return {
    activity_plan_id: input.data.activityPlanId,
    scheduled_date: input.data.scheduledDate,
    notes: input.data.notes || undefined,
    training_plan_id: input.data.trainingPlanId || undefined,
    recurrence: input.recurrence,
  };
}

function toScheduleUpdatePayload(input: {
  data: ScheduleActivityModalFormOutput;
  eventId: string;
  scope: EditScope;
  startsAt: Date;
}) {
  return {
    id: input.eventId,
    scope: input.scope,
    patch: {
      activity_plan_id: input.data.activityPlanId,
      notes: input.data.notes || null,
      all_day: input.data.allDay,
      timezone: "UTC",
      starts_at: input.data.allDay
        ? buildAllDayStartIso(input.startsAt)
        : input.startsAt.toISOString(),
    },
  };
}

export function ScheduleActivityModal({
  visible,
  onClose,
  onSuccess,
  activityPlanId,
  activityPlan,
  eventId,
  preselectedDate,
  trainingPlanId,
  editScope,
}: ScheduleActivityModalProps) {
  if (!visible) {
    return null;
  }

  const isEditMode = !!eventId;
  const resolvedActivityPlanId = activityPlanId ?? activityPlan?.id ?? "";
  const isTemplate = !!activityPlan && !activityPlanId;

  // Validation: Must have either activityPlanId, activityPlan, or eventId
  if (!activityPlanId && !activityPlan && !eventId) {
    throw new Error(
      "ScheduleActivityModal requires either activityPlanId, activityPlan, or eventId",
    );
  }

  const form = useZodForm<
    ScheduleActivityModalFormInput,
    undefined,
    ScheduleActivityModalFormOutput
  >({
    schema: scheduleActivityModalFormSchema,
    defaultValues: {
      scheduledDate: preselectedDate || toDateOnlyString(new Date()),
      allDay: false,
      scheduledTime: null,
      notes: null,
      activityPlanId: resolvedActivityPlanId,
      trainingPlanId: trainingPlanId || null,
    },
  });

  const [showConstraintDetails, setShowConstraintDetails] = useState(false);
  const [localEditScope, setLocalEditScope] = useState<EditScope | null>(null);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatOccurrenceCount, setRepeatOccurrenceCount] = useState(4);

  const scheduledDateString = form.watch("scheduledDate");
  const scheduledTimeString = form.watch("scheduledTime");
  const allDay = form.watch("allDay") ?? false;
  const scheduledDateForApi = scheduledDateString || toDateOnlyString(new Date());
  const currentActivityPlanId = form.watch("activityPlanId");
  const startsAt = buildStartsAtFromEditorValues({
    scheduledDate: scheduledDateForApi,
    scheduledTime: scheduledTimeString ?? null,
    allDay,
  });

  // Fetch existing activity if editing
  const { data: existingActivity, isLoading: loadingExistingActivity } =
    api.events.getById.useQuery({ id: eventId! }, { enabled: isEditMode && visible });

  // Fetch plan details (only if we have an ID, not a template)
  const { data: planDetails, isLoading: loadingPlan } = api.activityPlans.getById.useQuery(
    { id: currentActivityPlanId },
    { enabled: !!currentActivityPlanId && visible && !isTemplate },
  );

  // Use template if provided, otherwise use fetched plan
  const displayPlan = isTemplate ? activityPlan : planDetails;
  const displayRouteId = displayPlan?.route_id;
  const { data: displayRoute } = api.routes.get.useQuery(
    { id: displayRouteId! },
    { enabled: visible && !!displayRouteId },
  );

  // Validate constraints in real-time (when training plan provided)
  const {
    data: validation,
    isLoading: validationLoading,
    error: validationError,
  } = api.events.validateConstraints.useQuery(
    {
      training_plan_id: trainingPlanId!,
      scheduled_date: scheduledDateForApi,
      activity_plan_id: currentActivityPlanId,
    },
    {
      enabled: visible && !!trainingPlanId && !!currentActivityPlanId,
    },
  );

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!visible) {
      form.reset();
      setShowConstraintDetails(false);
      setLocalEditScope(null);
      setRepeatWeekly(false);
      setRepeatOccurrenceCount(4);
    }
  }, [visible, form]);

  useEffect(() => {
    if (!isEditMode && resolvedActivityPlanId) {
      form.setValue("activityPlanId", resolvedActivityPlanId, {
        shouldValidate: false,
      });
    }
  }, [isEditMode, resolvedActivityPlanId, form]);

  // Load existing activity data (edit mode)
  useEffect(() => {
    if (existingActivity?.activity_plan) {
      form.setValue("activityPlanId", existingActivity.activity_plan.id);
      form.setValue("scheduledDate", existingActivity.scheduled_date);
      form.setValue("allDay", !!existingActivity.all_day);
      form.setValue("scheduledTime", format(parseEventDateForEditor(existingActivity), "HH:mm"));
      form.setValue("notes", existingActivity.notes || null);
    }
  }, [existingActivity, form]);

  useEffect(() => {
    if (!isEditMode) {
      form.setValue("allDay", false, { shouldValidate: false });
      form.setValue("scheduledTime", null, { shouldValidate: false });
    }
  }, [isEditMode, form]);

  const queryClient = useQueryClient();
  const existingActivityIsRecurring = isRecurringEvent(existingActivity);
  const recurringEditRequiresScope = isEditMode && existingActivityIsRecurring && !editScope;
  const resolvedEditScope = editScope ?? localEditScope;

  const createMutation = api.events.create.useMutation();

  const updateMutation = api.events.update.useMutation();

  const handleMutationSuccess = async () => {
    await refreshScheduleWithCallbacks({
      queryClient,
      callbacks: [],
    });
    onClose();
    await onSuccess?.();
  };

  const submitEditWithScope = async (data: ScheduleActivityModalFormOutput, scope: EditScope) => {
    clearRootFormError(form);

    try {
      await runMutation(
        updateMutation,
        toScheduleUpdatePayload({ data, eventId: eventId!, scope, startsAt }),
      );

      await handleMutationSuccess();
    } catch (error) {
      setRootFormError(form, error, "Failed to update activity. Please try again.");
    }
  };

  const onSubmit = async (data: ScheduleActivityModalFormOutput) => {
    if (isEditMode) {
      if (recurringEditRequiresScope && !resolvedEditScope) {
        const message = "Choose whether to update one event, future events, or the entire series.";
        setRootFormError(form, new Error(message), message);
        return;
      }

      await submitEditWithScope(data, resolvedEditScope ?? "single");
      return;
    }

    clearRootFormError(form);

    try {
      await runMutation(
        createMutation,
        toScheduleCreatePayload({
          data,
          recurrence: repeatWeekly
            ? buildWeeklyRecurrence(data.scheduledDate, repeatOccurrenceCount)
            : undefined,
        }),
      );

      await handleMutationSuccess();
    } catch (error) {
      setRootFormError(form, error, "Failed to schedule activity. Please try again.");
    }
  };

  const submitForm = useZodFormSubmit<ScheduleActivityModalFormOutput>({
    form,
    onSubmit,
  });

  const isSubmitting =
    submitForm.isSubmitting || createMutation.isPending || updateMutation.isPending;
  const rootErrorMessage = form.formState?.errors.root?.message;
  const isLoading = (loadingPlan && !isTemplate) || loadingExistingActivity;
  const isValidationPending = !!trainingPlanId && validationLoading && !validation;
  const canSchedule =
    !isLoading &&
    displayPlan &&
    !!currentActivityPlanId &&
    !isValidationPending &&
    !isSubmitting &&
    (!recurringEditRequiresScope || !!localEditScope);
  const validationSummary = !trainingPlanId
    ? null
    : validationError
      ? {
          title: "Could not validate schedule fit",
          detail: "You can still continue, but constraint details are unavailable right now.",
          tone: "border-destructive/20 bg-destructive/10",
          textTone: "text-destructive",
        }
      : validationLoading && !validation
        ? {
            title: "Checking schedule fit",
            detail: "Reviewing training-plan limits for this date.",
            tone: "border-border bg-muted/60",
            textTone: "text-muted-foreground",
          }
        : validation
          ? validation.canSchedule && !validation.hasWarnings
            ? {
                title: "Ready to schedule",
                detail: "This date fits cleanly within current plan limits.",
                tone: "border-emerald-500/20 bg-emerald-500/10",
                textTone: "text-emerald-700",
              }
            : validation.canSchedule
              ? {
                  title: "Close to plan limits",
                  detail: "You can schedule this, but it pushes one or more constraints.",
                  tone: "border-amber-500/20 bg-amber-500/10",
                  textTone: "text-amber-700",
                }
              : {
                  title: "Constraint override required",
                  detail: "This date violates one or more training-plan limits.",
                  tone: "border-destructive/20 bg-destructive/10",
                  textTone: "text-destructive",
                }
          : {
              title: "Schedule fit pending",
              detail: "Constraint details will appear once validation is ready.",
              tone: "border-border bg-muted/60",
              textTone: "text-muted-foreground",
            };

  const minimumScheduleDate = isEditMode ? undefined : new Date();
  const minimumScheduleDateProps = minimumScheduleDate ? { minimumDate: minimumScheduleDate } : {};

  return (
    <AppFormModal
      dismissDisabled={isSubmitting}
      footerContent={
        <View className="gap-2">
          <View className="flex-row gap-3">
            <Button
              variant="outline"
              onPress={onClose}
              disabled={isSubmitting}
              className="flex-1"
              testID="schedule-cancel-button"
            >
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
            <Button
              onPress={submitForm.handleSubmit}
              disabled={!canSchedule || isSubmitting}
              className="flex-1"
              testID="schedule-submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" className="mr-2" />
              ) : null}
              <Text className="text-primary-foreground font-semibold">
                {trainingPlanId && validation && !validation.canSchedule
                  ? "Schedule Anyway"
                  : isEditMode
                    ? "Update Schedule"
                    : "Schedule Activity"}
              </Text>
            </Button>
          </View>
          {displayPlan && trainingPlanId && validationSummary ? (
            <Text className="text-center text-xs text-muted-foreground">
              {validationSummary.title}
            </Text>
          ) : null}
        </View>
      }
      onClose={onClose}
      testID="schedule-modal"
      title={isEditMode ? "Update Schedule" : "Schedule Activity"}
      description={!isLoading && displayPlan ? displayPlan.name : undefined}
    >
      <View className="gap-4">
        {/* Loading State */}
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">Loading activity details...</Text>
          </View>
        ) : displayPlan ? (
          <>
            <View className="gap-2" testID="schedule-preview-details">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Selected activity
              </Text>
              <ActivityPlanCard
                activityPlan={displayPlan as any}
                route={displayRoute as any}
                testID="schedule-selected-activity-card"
                variant="compact"
              />
              <Text className="text-sm text-muted-foreground">
                Review the session shape before you save the activity.
              </Text>
            </View>

            <Form {...form}>
              {isEditMode ? (
                <View className="gap-3">
                  <FormDateInputField
                    accessibilityHint="Choose the day for this activity"
                    control={form.control}
                    disabled={isSubmitting}
                    label="Scheduled Date"
                    name="scheduledDate"
                    pickerPresentation="modal"
                    testId="scheduled-date-button"
                    {...minimumScheduleDateProps}
                  />

                  <FormSwitchField
                    control={form.control}
                    disabled={isSubmitting}
                    label="All day"
                    name="allDay"
                    switchLabel="All day"
                    description="Turn this on when the event does not need a start time."
                    testId="schedule-all-day-toggle"
                  />

                  {!allDay ? (
                    <View className="gap-2">
                      <FormTimeInputField
                        accessibilityHint="Choose the start time for this activity"
                        control={form.control}
                        disabled={isSubmitting}
                        label="Start Time"
                        name="scheduledTime"
                        pickerPresentation="modal"
                        testId="scheduled-time-button"
                      />
                    </View>
                  ) : null}

                  {recurringEditRequiresScope ? (
                    <View className="gap-2 rounded-xl border border-border bg-card px-3 py-3">
                      <View className="gap-1">
                        <Text className="text-sm font-semibold text-foreground">
                          Apply changes to
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          This activity repeats. Choose the part of the series to update before
                          saving.
                        </Text>
                      </View>
                      <View className="gap-2">
                        {(
                          [
                            ["single", "This event only"],
                            ["future", "This and future events"],
                            ["series", "Entire series"],
                          ] as const
                        ).map(([scope, label]) => {
                          const selected = localEditScope === scope;
                          return (
                            <Pressable
                              key={scope}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              className={`rounded-lg border px-3 py-2 ${
                                selected
                                  ? "border-primary bg-primary/10"
                                  : "border-border bg-background"
                              }`}
                              disabled={isSubmitting}
                              onPress={() => setLocalEditScope(scope)}
                              testID={`schedule-edit-scope-${scope}`}
                            >
                              <Text
                                className={`text-sm font-medium ${
                                  selected ? "text-primary" : "text-foreground"
                                }`}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className="gap-3">
                  <FormDateInputField
                    accessibilityHint="Choose when this activity should be scheduled"
                    control={form.control}
                    disabled={isSubmitting}
                    label="Scheduled Date"
                    name="scheduledDate"
                    placeholder="Choose a date"
                    testId="scheduled-date-field"
                    {...minimumScheduleDateProps}
                  />

                  <View className="rounded-xl border border-border bg-card px-3 py-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="text-sm font-medium text-foreground">Repeat weekly</Text>
                        <Text className="text-xs text-muted-foreground">
                          Schedule this activity every week on the selected day.
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{ checked: repeatWeekly }}
                        className={`rounded-full px-3 py-2 ${repeatWeekly ? "bg-primary" : "bg-muted"}`}
                        disabled={isSubmitting}
                        onPress={() => setRepeatWeekly((current) => !current)}
                        testID="schedule-repeat-weekly-toggle"
                      >
                        <Text
                          className={`text-xs font-semibold ${repeatWeekly ? "text-primary-foreground" : "text-foreground"}`}
                        >
                          {repeatWeekly ? "On" : "Off"}
                        </Text>
                      </Pressable>
                    </View>

                    {repeatWeekly ? (
                      <View className="mt-3 gap-2 border-t border-border pt-3">
                        <Text className="text-xs font-medium text-muted-foreground">
                          Ends after {repeatOccurrenceCount} occurrences
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            className="rounded-md border border-border px-3 py-2"
                            disabled={isSubmitting || repeatOccurrenceCount <= 2}
                            onPress={() =>
                              setRepeatOccurrenceCount((current) => Math.max(2, current - 1))
                            }
                            testID="schedule-repeat-count-decrement"
                          >
                            <Text className="text-sm text-foreground">-</Text>
                          </Pressable>
                          <Pressable
                            className="rounded-md border border-border px-3 py-2"
                            disabled={isSubmitting || repeatOccurrenceCount >= 52}
                            onPress={() =>
                              setRepeatOccurrenceCount((current) => Math.min(52, current + 1))
                            }
                            testID="schedule-repeat-count-increment"
                          >
                            <Text className="text-sm text-foreground">+</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}
            </Form>

            {/* Constraint Validation Summary */}
            {trainingPlanId && validationSummary && (
              <View className={`rounded-xl border px-4 py-4 ${validationSummary.tone}`}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className={`text-sm font-semibold ${validationSummary.textTone}`}>
                      {validationSummary.title}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {validationSummary.detail}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setShowConstraintDetails((current) => !current)}
                    className="flex-row items-center gap-1 rounded-full border border-border bg-background px-3 py-2"
                    disabled={isSubmitting}
                    testID="schedule-constraints-toggle"
                  >
                    <Text className="text-xs font-semibold text-foreground">
                      {showConstraintDetails ? "Hide" : "Details"}
                    </Text>
                    <Icon
                      as={showConstraintDetails ? ChevronUp : ChevronDown}
                      size={14}
                      className="text-foreground"
                    />
                  </Pressable>
                </View>

                {showConstraintDetails ? (
                  <View className="mt-3" testID="schedule-constraints-details">
                    <ConstraintValidator
                      validation={validation ?? null}
                      isLoading={validationLoading}
                    />
                  </View>
                ) : null}
              </View>
            )}

            <Form {...form}>
              <FormTextareaField
                control={form.control}
                disabled={isSubmitting}
                formatValue={(value) => value ?? ""}
                label="Notes"
                name="notes"
                numberOfLines={5}
                parseValue={(value) => value || null}
                placeholder="Add any notes about this activity..."
                description="Optional details to help you remember context when you review this activity later."
                className="min-h-[100px]"
                testId="schedule-notes-field"
              />
            </Form>

            {/* Error Messages */}
            {!currentActivityPlanId ? (
              <View className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <Text className="text-destructive font-medium">
                  This activity cannot be scheduled yet
                </Text>
                <Text className="text-destructive/80 text-sm mt-1">
                  Duplicate the activity plan first, then schedule it from its detail screen.
                </Text>
              </View>
            ) : null}
            {rootErrorMessage ? (
              <View className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <Text className="text-destructive font-medium">
                  Failed to {isEditMode ? "update" : "schedule"} activity
                </Text>
                <Text className="text-destructive/80 text-sm mt-1">{rootErrorMessage}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View className="py-8 items-center">
            <Text className="text-destructive">Failed to load activity details</Text>
          </View>
        )}
      </View>
    </AppFormModal>
  );
}
