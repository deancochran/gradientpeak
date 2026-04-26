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

import { plannedActivityScheduleFormSchema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
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
import { Calendar, ChevronDown, ChevronUp, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ActivityIndicator, Alert, Pressable, TouchableOpacity, View } from "react-native";
import { z } from "zod";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { AppConfirmModal, AppFormModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { applyServerFormErrors, getErrorMessage } from "@/lib/utils/formErrors";
import { ConstraintValidator } from "./training-plan/modals/components/ConstraintValidator";

type PlannedActivityScheduleFormInput = z.input<typeof plannedActivityScheduleFormSchema>;
type PlannedActivityScheduleFormOutput = z.output<typeof plannedActivityScheduleFormSchema>;
const scheduleActivityModalFormSchema = plannedActivityScheduleFormSchema.extend({
  all_day: z.boolean(),
  scheduled_time: z.string().nullable().optional(),
});
type ScheduleActivityModalFormOutput = z.output<typeof scheduleActivityModalFormSchema>;

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
  editScope?: "single" | "future" | "series";
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
  form: Partial<Pick<UseFormReturn<PlannedActivityScheduleFormOutput>, "setError">>,
  error: unknown,
  fallbackMessage: string,
) {
  if (
    form.setError &&
    applyServerFormErrors(
      form as Pick<UseFormReturn<PlannedActivityScheduleFormOutput>, "setError">,
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
  form: Partial<Pick<UseFormReturn<PlannedActivityScheduleFormOutput>, "clearErrors">>,
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

  const form = useZodForm({
    schema: scheduleActivityModalFormSchema,
    defaultValues: {
      scheduled_date: preselectedDate || toDateOnlyString(new Date()),
      all_day: false,
      scheduled_time: null,
      notes: null,
      activity_plan_id: resolvedActivityPlanId,
      training_plan_id: trainingPlanId || null,
    },
  });

  const [showConstraintDetails, setShowConstraintDetails] = useState(false);
  const [showEditScopeModal, setShowEditScopeModal] = useState(false);
  const [pendingEditValues, setPendingEditValues] =
    useState<ScheduleActivityModalFormOutput | null>(null);
  const [successState, setSuccessState] = useState<null | { message: string; title: string }>(null);

  const scheduledDateString = form.watch("scheduled_date");
  const scheduledTimeString = form.watch("scheduled_time");
  const allDay = form.watch("all_day") ?? false;
  const scheduledDateForApi = scheduledDateString || toDateOnlyString(new Date());
  const currentActivityPlanId = form.watch("activity_plan_id");
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
      setShowEditScopeModal(false);
      setPendingEditValues(null);
      setSuccessState(null);
    }
  }, [visible, form]);

  useEffect(() => {
    if (!isEditMode && resolvedActivityPlanId) {
      form.setValue("activity_plan_id", resolvedActivityPlanId, {
        shouldValidate: false,
      });
    }
  }, [isEditMode, resolvedActivityPlanId, form]);

  // Load existing activity data (edit mode)
  useEffect(() => {
    if (existingActivity && existingActivity.activity_plan) {
      form.setValue("activity_plan_id", existingActivity.activity_plan.id);
      form.setValue("scheduled_date", existingActivity.scheduled_date);
      form.setValue("all_day", !!existingActivity.all_day);
      form.setValue("scheduled_time", format(parseEventDateForEditor(existingActivity), "HH:mm"));
      form.setValue("notes", existingActivity.notes || null);
    }
  }, [existingActivity, form]);

  useEffect(() => {
    if (!isEditMode) {
      form.setValue("all_day", false, { shouldValidate: false });
      form.setValue("scheduled_time", null, { shouldValidate: false });
    }
  }, [isEditMode, scheduledDateForApi, form]);

  const queryClient = useQueryClient();
  const existingActivityIsRecurring = isRecurringEvent(existingActivity);

  const createMutation = api.events.create.useMutation();

  const updateMutation = api.events.update.useMutation();

  const handleMutationSuccess = async (message: string) => {
    await refreshScheduleWithCallbacks({
      queryClient,
      callbacks: [],
    });
    setSuccessState({
      title: isEditMode ? "Schedule updated" : "Activity scheduled",
      message,
    });
  };

  const submitEditWithScope = async (
    data: ScheduleActivityModalFormOutput,
    scope: "single" | "future" | "series",
  ) => {
    clearRootFormError(form);

    try {
      await runMutation(updateMutation, {
        id: eventId!,
        scope,
        patch: {
          activity_plan_id: data.activity_plan_id,
          notes: data.notes || null,
          all_day: data.all_day,
          timezone: "UTC",
          starts_at: data.all_day ? buildAllDayStartIso(startsAt) : startsAt.toISOString(),
        },
      });

      await handleMutationSuccess("Activity updated!");
    } catch (error) {
      setRootFormError(form, error, "Failed to update activity. Please try again.");
    }
  };

  const handleSelectEditScope = (scope: "single" | "future" | "series") => {
    const values = pendingEditValues;
    setShowEditScopeModal(false);
    setPendingEditValues(null);

    if (!values) {
      return;
    }

    void submitEditWithScope(values, scope);
  };

  const onSubmit = async (data: ScheduleActivityModalFormOutput) => {
    if (isEditMode) {
      if (existingActivityIsRecurring && !editScope) {
        setPendingEditValues(data);
        setShowEditScopeModal(true);
        return;
      }

      await submitEditWithScope(data, editScope ?? "single");
      return;
    }

    clearRootFormError(form);

    try {
      await runMutation(createMutation, {
        activity_plan_id: data.activity_plan_id,
        scheduled_date: data.scheduled_date,
        notes: data.notes || undefined,
        training_plan_id: data.training_plan_id || undefined,
      });

      await handleMutationSuccess("Activity scheduled!");
    } catch (error) {
      setRootFormError(form, error, "Failed to schedule activity. Please try again.");
    }
  };

  const submitForm = useZodFormSubmit<ScheduleActivityModalFormOutput>({
    form,
    onSubmit,
  });

  const getActivityTypeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      outdoor_run: "🏃",
      outdoor_bike: "🚴",
      indoor_treadmill: "🏃‍♂️",
      indoor_bike_trainer: "🚴‍♀️",
      indoor_strength: "💪",
      indoor_swim: "🏊",
    };
    return iconMap[type] || "🏋️";
  };

  const isSubmitting =
    submitForm.isSubmitting || createMutation.isPending || updateMutation.isPending;
  const rootErrorMessage = form.formState?.errors.root?.message;
  const isLoading = (loadingPlan && !isTemplate) || loadingExistingActivity;
  const isValidationPending = !!trainingPlanId && validationLoading && !validation;
  const canSchedule =
    !isLoading && displayPlan && !!currentActivityPlanId && !isValidationPending && !isSubmitting;
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

  const handleAcknowledgeSuccess = async () => {
    setSuccessState(null);
    onClose();
    await onSuccess?.();
  };

  return (
    <>
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
                <Text>Cancel</Text>
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
              <Text className="text-sm text-muted-foreground mt-2">
                Loading activity details...
              </Text>
            </View>
          ) : displayPlan ? (
            <>
              {/* Activity Plan Summary */}
              <Card>
                <CardContent className="p-4 gap-4">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Selected activity
                  </Text>
                  <View className="flex-row items-start gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Text className="text-xl">
                        {getActivityTypeIcon(displayPlan.activity_category)}
                      </Text>
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-lg font-semibold text-foreground">
                        {displayPlan.name}
                      </Text>
                      {displayPlan.description ? (
                        <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={3}>
                          {displayPlan.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text className="text-sm text-muted-foreground">
                    Review the session shape before you save the activity.
                  </Text>
                  <View testID="schedule-preview-details">
                    <ActivityPlanContentPreview
                      size="medium"
                      plan={displayPlan}
                      route={displayRoute}
                    />
                  </View>
                </CardContent>
              </Card>

              <Form {...form}>
                {isEditMode ? (
                  <View className="gap-3">
                    <FormDateInputField
                      accessibilityHint="Choose the day for this activity"
                      control={form.control}
                      disabled={isSubmitting}
                      label="Scheduled Date"
                      minimumDate={minimumScheduleDate}
                      name="scheduled_date"
                      pickerPresentation="modal"
                      testId="scheduled-date-button"
                    />

                    <FormSwitchField
                      control={form.control}
                      disabled={isSubmitting}
                      label="All day"
                      name="all_day"
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
                          name="scheduled_time"
                          pickerPresentation="modal"
                          testId="scheduled-time-button"
                        />
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <FormDateInputField
                    accessibilityHint="Choose when this activity should be scheduled"
                    control={form.control}
                    disabled={isSubmitting}
                    label="Scheduled Date"
                    minimumDate={minimumScheduleDate}
                    name="scheduled_date"
                    placeholder="Choose a date"
                    testId="scheduled-date-field"
                  />
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

      {showEditScopeModal ? (
        <AppFormModal
          onClose={() => {
            setShowEditScopeModal(false);
            setPendingEditValues(null);
          }}
          secondaryAction={
            <Button
              onPress={() => {
                setShowEditScopeModal(false);
                setPendingEditValues(null);
              }}
              variant="outline"
            >
              <Text>Cancel</Text>
            </Button>
          }
          testID="schedule-edit-scope-modal"
          title="Recurring Schedule"
          description="Choose how much of this series to update."
        >
          <View className="gap-3">
            <Button
              onPress={() => handleSelectEditScope("single")}
              testID="schedule-edit-scope-single"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This event only</Text>
            </Button>
            <Button
              onPress={() => handleSelectEditScope("future")}
              testID="schedule-edit-scope-future"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This and future events</Text>
            </Button>
            <Button
              onPress={() => handleSelectEditScope("series")}
              testID="schedule-edit-scope-series"
              variant="outline"
            >
              <Text className="text-foreground font-medium">Entire series</Text>
            </Button>
          </View>
        </AppFormModal>
      ) : null}

      {successState ? (
        <AppConfirmModal
          description={successState.message}
          onClose={() => {
            void handleAcknowledgeSuccess();
          }}
          primaryAction={{
            label: "Done",
            onPress: () => {
              void handleAcknowledgeSuccess();
            },
            testID: "schedule-success-confirm",
          }}
          testID="schedule-success-modal"
          title={successState.title}
        />
      ) : null}
    </>
  );
}
