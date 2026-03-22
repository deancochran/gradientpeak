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
import { Form, FormDateInputField, FormTextareaField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, ChevronDown, ChevronUp, Clock, TrendingUp, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { trpc } from "@/lib/trpc";
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

export function ScheduleActivityModal({
  visible,
  onClose,
  onSuccess,
  activityPlanId,
  activityPlan,
  eventId,
  preselectedDate,
  trainingPlanId,
  editScope = "single",
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

  const [showPlanPreviewDetails, setShowPlanPreviewDetails] = useState(false);
  const [showConstraintDetails, setShowConstraintDetails] = useState(false);

  const scheduledDateString = form.watch("scheduled_date");
  const scheduledDateForApi = scheduledDateString || toDateOnlyString(new Date());
  const currentActivityPlanId = form.watch("activity_plan_id");

  // Fetch existing activity if editing
  const { data: existingActivity, isLoading: loadingExistingActivity } =
    trpc.events.getById.useQuery({ id: eventId! }, { enabled: isEditMode && visible });

  // Fetch plan details (only if we have an ID, not a template)
  const { data: planDetails, isLoading: loadingPlan } = trpc.activityPlans.getById.useQuery(
    { id: currentActivityPlanId },
    { enabled: !!currentActivityPlanId && visible && !isTemplate },
  );

  // Use template if provided, otherwise use fetched plan
  const displayPlan = isTemplate ? activityPlan : planDetails;

  // Validate constraints in real-time (when training plan provided)
  const {
    data: validation,
    isLoading: validationLoading,
    error: validationError,
  } = trpc.events.validateConstraints.useQuery(
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
      setShowPlanPreviewDetails(false);
      setShowConstraintDetails(false);
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
    }
  }, [existingActivity, form]);

  const queryClient = useQueryClient();

  const createMutation = trpc.events.create.useMutation({
    onSuccess: async () => {
      await refreshScheduleViews(queryClient);
      await onSuccess?.();
      onClose();
      setTimeout(() => {
        alertSuccess("Activity scheduled!");
      }, 300);
    },
  });

  const updateMutation = trpc.events.update.useMutation({
    onSuccess: async () => {
      await refreshScheduleViews(queryClient);
      await onSuccess?.();
      onClose();
      setTimeout(() => {
        alertSuccess("Activity updated!");
      }, 300);
    },
  });

  const onSubmit = (data: PlannedActivityScheduleFormOutput) => {
    if (isEditMode) {
      updateMutation.mutate({
        id: eventId,
        activity_plan_id: data.activity_plan_id,
        scheduled_date: data.scheduled_date,
        notes: data.notes || undefined,
        scope: editScope,
      });
    } else {
      createMutation.mutate({
        activity_plan_id: data.activity_plan_id,
        scheduled_date: data.scheduled_date,
        notes: data.notes || undefined,
        training_plan_id: data.training_plan_id || undefined,
      });
    }
  };

  const submitForm = useZodFormSubmit<PlannedActivityScheduleFormOutput>({
    form,
    onSubmit,
  });

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

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

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
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
      <View className="flex-1 bg-background">
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
                  <CardContent className="p-4">
                    <View className="flex-row items-start mb-3">
                      <View className="mr-3 items-center justify-center w-12 h-12 rounded-full bg-muted">
                        <Text className="text-2xl">
                          {getActivityTypeIcon(displayPlan.activity_category)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-lg">{displayPlan.name}</Text>
                        {displayPlan.description && (
                          <Text
                            className="text-sm text-muted-foreground mt-1"
                            numberOfLines={showPlanPreviewDetails ? undefined : 2}
                          >
                            {displayPlan.description}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View className="flex-row flex-wrap gap-4 mb-3">
                      {displayPlan.estimated_duration && (
                        <View className="flex-row items-center gap-1.5">
                          <Icon as={Clock} size={16} className="text-muted-foreground" />
                          <Text className="text-sm font-medium">
                            {formatDuration(displayPlan.estimated_duration)}
                          </Text>
                        </View>
                      )}
                      {displayPlan.estimated_tss && (
                        <View className="flex-row items-center gap-1.5">
                          <Icon as={TrendingUp} size={16} className="text-muted-foreground" />
                          <Text className="text-sm font-medium">
                            {Math.round(displayPlan.estimated_tss)} TSS
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="rounded-xl border border-border bg-background px-3 py-3">
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1 gap-1">
                          <Text className="text-sm font-medium text-foreground">
                            Workout preview
                          </Text>
                          <Text className="text-sm text-muted-foreground">
                            Keep the schedule flow light by reviewing the structure only when
                            needed.
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setShowPlanPreviewDetails((current) => !current)}
                          className="flex-row items-center gap-1 rounded-full border border-border bg-card px-3 py-2"
                          disabled={isSubmitting}
                          testID="schedule-preview-toggle"
                        >
                          <Text className="text-xs font-semibold text-foreground">
                            {showPlanPreviewDetails ? "Hide" : "Show"}
                          </Text>
                          <Icon
                            as={showPlanPreviewDetails ? ChevronUp : ChevronDown}
                            size={14}
                            className="text-foreground"
                          />
                        </Pressable>
                      </View>

                      {showPlanPreviewDetails && (
                        <View className="mt-3 gap-3" testID="schedule-preview-details">
                          {displayPlan.structure?.intervals &&
                          displayPlan.structure.intervals.length > 0 ? (
                            <View className="rounded-lg overflow-hidden">
                              <Text className="text-xs text-muted-foreground mb-2">
                                Intensity Profile
                              </Text>
                              <TimelineChart
                                structure={displayPlan.structure}
                                height={80}
                                compact={true}
                              />
                            </View>
                          ) : null}
                          {!displayPlan.structure?.intervals?.length ? (
                            <Text className="text-sm text-muted-foreground">
                              No detailed structure preview is available for this plan.
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </CardContent>
                </Card>

                <Form {...form}>
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
                    description="Optional details to help you remember context when you review this workout later."
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
                {(createMutation.error || updateMutation.error) && (
                  <View className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <Text className="text-destructive font-medium">
                      Failed to {isEditMode ? "update" : "schedule"} activity
                    </Text>
                    <Text className="text-destructive/80 text-sm mt-1">
                      {(createMutation.error || updateMutation.error)?.message ||
                        "Please try again"}
                    </Text>
                  </View>
                )}
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
            <Button variant="outline" onPress={onClose} disabled={isSubmitting} className="flex-1">
              <Text>Cancel</Text>
            </Button>
            <Button
              onPress={submitForm.handleSubmit}
              disabled={!canSchedule || submitForm.isSubmitting}
              className="flex-1"
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
    </Modal>
  );
}
