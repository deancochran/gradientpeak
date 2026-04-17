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

import DateTimePicker from "@react-native-community/datetimepicker";
import { plannedActivityScheduleFormSchema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormDateInputField, FormTextareaField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, ChevronDown, ChevronUp, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { api } from "@/lib/api";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { applyServerFormErrors, getErrorMessage } from "@/lib/utils/formErrors";
import { ConstraintValidator } from "./training-plan/modals/components/ConstraintValidator";

type PlannedActivityScheduleFormInput = z.input<typeof plannedActivityScheduleFormSchema>;
type PlannedActivityScheduleFormOutput = z.output<typeof plannedActivityScheduleFormSchema>;

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

function alertSuccess(message: string) {
  Alert.alert("Success", message);
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
    schema: plannedActivityScheduleFormSchema,
    defaultValues: {
      scheduled_date: preselectedDate || toDateOnlyString(new Date()),
      notes: null,
      activity_plan_id: resolvedActivityPlanId,
      training_plan_id: trainingPlanId || null,
    },
  });

  const [showConstraintDetails, setShowConstraintDetails] = useState(false);
  const [startsAt, setStartsAt] = useState(new Date());
  const [allDay, setAllDay] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const scheduledDateString = form.watch("scheduled_date");
  const scheduledDateForApi = scheduledDateString || toDateOnlyString(new Date());
  const currentActivityPlanId = form.watch("activity_plan_id");

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
      setShowDatePicker(false);
      setShowTimePicker(false);
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
      form.setValue("notes", existingActivity.notes || null);
      setAllDay(!!existingActivity.all_day);
      setStartsAt(parseEventDateForEditor(existingActivity));
    }
  }, [existingActivity, form]);

  useEffect(() => {
    if (!isEditMode) {
      setStartsAt(toPickerDate(scheduledDateForApi));
      setAllDay(false);
    }
  }, [isEditMode, scheduledDateForApi]);

  const queryClient = useQueryClient();
  const existingActivityIsRecurring = isRecurringEvent(existingActivity);

  const createMutation = api.events.create.useMutation();

  const updateMutation = api.events.update.useMutation();

  const handleMutationSuccess = async (message: string) => {
    await refreshScheduleWithCallbacks({
      queryClient,
      callbacks: onSuccess ? [onSuccess] : [],
    });
    onClose();
    setTimeout(() => {
      alertSuccess(message);
    }, 300);
  };

  const submitEditWithScope = async (
    data: PlannedActivityScheduleFormOutput,
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
          all_day: allDay,
          timezone: "UTC",
          starts_at: allDay ? buildAllDayStartIso(startsAt) : startsAt.toISOString(),
        },
      });

      await handleMutationSuccess("Activity updated!");
    } catch (error) {
      setRootFormError(form, error, "Failed to update activity. Please try again.");
    }
  };

  const promptForEditScope = (onSelect: (scope: "single" | "future" | "series") => void) => {
    Alert.alert("Recurring Schedule", "Choose how much of this series to update.", [
      { text: "Cancel", style: "cancel" },
      { text: "This event only", onPress: () => onSelect("single") },
      { text: "This and future events", onPress: () => onSelect("future") },
      { text: "Entire series", onPress: () => onSelect("series") },
    ]);
  };

  const onSubmit = async (data: PlannedActivityScheduleFormOutput) => {
    if (isEditMode) {
      if (existingActivityIsRecurring && !editScope) {
        promptForEditScope((scope) => {
          void submitEditWithScope(data, scope);
        });
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

  const submitForm = useZodFormSubmit<PlannedActivityScheduleFormOutput>({
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background" testID="schedule-modal">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
          <View className="flex-1">
            <Text className="text-xl font-bold">
              {isEditMode ? "Update Schedule" : "Schedule Activity"}
            </Text>
            {!isLoading && displayPlan && (
              <Text className="text-sm text-muted-foreground mt-0.5">{displayPlan.name}</Text>
            )}
          </View>
          <Pressable
            onPress={onClose}
            className="p-2 rounded-full bg-muted"
            disabled={isSubmitting}
            hitSlop={12}
          >
            <Icon as={X} size={24} className="text-muted-foreground" />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={true}>
          <View className="p-4 gap-4">
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
                    <View className="flex-row items-start gap-3">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Text className="text-xl">
                          {getActivityTypeIcon(displayPlan.activity_category)}
                        </Text>
                      </View>
                      <View className="flex-1 gap-1">
                        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Selected activity
                        </Text>
                        <Text className="text-lg font-semibold text-foreground">{displayPlan.name}</Text>
                        {displayPlan.description && (
                          <Text
                            className="text-sm leading-5 text-muted-foreground"
                            numberOfLines={3}
                          >
                            {displayPlan.description}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View className="rounded-xl border border-border bg-background px-3 py-3">
                      <View className="gap-1">
                        <Text className="text-sm font-medium text-foreground">Activity preview</Text>
                        <Text className="text-sm text-muted-foreground">
                          Review the session shape before you save the activity.
                        </Text>
                      </View>
                      <View className="mt-3" testID="schedule-preview-details">
                        <ActivityPlanContentPreview compact plan={displayPlan} route={displayRoute} />
                      </View>
                    </View>
                  </CardContent>
                </Card>

                <Form {...form}>
                  {isEditMode ? (
                    <View className="gap-3">
                      <View className="gap-2">
                        <Text className="text-sm font-medium text-foreground">Scheduled Date</Text>
                        <TouchableOpacity
                          accessibilityHint="Choose the day for this activity"
                          className="rounded-xl border border-border bg-card px-3 py-3"
                          disabled={isSubmitting}
                          onPress={() => setShowDatePicker(true)}
                          testID="scheduled-date-button"
                        >
                          <Text className="text-sm text-foreground">
                            {format(startsAt, "EEEE, MMM d, yyyy")}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-3">
                        <View className="flex-1 pr-3">
                          <Text className="text-sm font-medium text-foreground">All day</Text>
                          <Text className="text-xs text-muted-foreground">
                            Turn this on when the event does not need a start time.
                          </Text>
                        </View>
                        <Switch
                          checked={allDay}
                          disabled={isSubmitting}
                          onCheckedChange={setAllDay}
                          testID="schedule-all-day-toggle"
                        />
                      </View>

                      {!allDay ? (
                        <View className="gap-2">
                          <Text className="text-sm font-medium text-foreground">Start Time</Text>
                          <TouchableOpacity
                            className="rounded-xl border border-border bg-card px-3 py-3"
                            disabled={isSubmitting}
                            onPress={() => setShowTimePicker(true)}
                            testID="scheduled-time-button"
                          >
                            <Text className="text-sm text-foreground">
                              {format(startsAt, "h:mm a")}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <FormDateInputField
                      accessibilityHint="Choose when this activity should be scheduled"
                      control={form.control}
                      disabled={isSubmitting}
                      label="Scheduled Date"
                      minimumDate={new Date()}
                      name="scheduled_date"
                      placeholder="Choose a date"
                      testId="scheduled-date-field"
                    />
                  )}
                </Form>

                {/* Constraint Validation Summary */}
                {trainingPlanId && validationSummary && (
                  <View>
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

                      {showConstraintDetails && (
                        <View className="mt-3" testID="schedule-constraints-details">
                          <ConstraintValidator
                            validation={validation ?? null}
                            isLoading={validationLoading}
                          />
                        </View>
                      )}
                    </View>
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
        </ScrollView>

        {/* Footer Actions */}
        <View className="px-4 py-4 border-t border-border bg-background">
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

          {/* Helper text */}
          {displayPlan && trainingPlanId && validationSummary && (
            <Text className="text-xs text-muted-foreground text-center mt-2">
              {validationSummary.title}
            </Text>
          )}
        </View>
      </View>

      {isEditMode && showDatePicker ? (
        <DateTimePicker
          display="default"
          mode="date"
          onChange={(_, selected) => {
            setShowDatePicker(false);
            if (!selected) {
              return;
            }

            const next = new Date(startsAt);
            next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            setStartsAt(next);
            form.setValue("scheduled_date", toDateOnlyString(next), { shouldDirty: true });
          }}
          testID="schedule-date-picker"
          value={startsAt}
        />
      ) : null}

      {isEditMode && showTimePicker ? (
        <DateTimePicker
          display="default"
          mode="time"
          onChange={(_, selected) => {
            setShowTimePicker(false);
            if (!selected) {
              return;
            }

            const next = new Date(startsAt);
            next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            setStartsAt(next);
          }}
          testID="schedule-time-picker"
          value={startsAt}
        />
      ) : null}
    </Modal>
  );
}
