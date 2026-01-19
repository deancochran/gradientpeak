/**
 * ScheduleActivityModal - Simplified Activity Scheduling Component
 *
 * ## Purpose
 * A focused modal for scheduling a specific activity plan. The plan must be
 * pre-selected before opening this modal, keeping the UX simple and focused.
 *
 * ## Design Philosophy
 * - User browses plans first (library, detail page, etc.)
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
 * ### Schedule from Library/Detail Page
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
 *   plannedActivityId={activityId}
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

import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  plannedActivityScheduleFormSchema,
  type PlannedActivityScheduleFormData,
} from "@repo/core";
import { format } from "date-fns";
import { Calendar, Clock, TrendingUp, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { ConstraintValidator } from "./training-plan/modals/components/ConstraintValidator";

interface ScheduleActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;

  // Either provide activityPlanId (database ID), activityPlan (template object), or plannedActivityId (edit)
  activityPlanId?: string;
  activityPlan?: any; // Template object from discover/samples
  plannedActivityId?: string;

  // Optional pre-selected date
  preselectedDate?: string;

  // Training plan context (for constraint validation)
  trainingPlanId?: string;
}

export function ScheduleActivityModal({
  visible,
  onClose,
  onSuccess,
  activityPlanId,
  activityPlan,
  plannedActivityId,
  preselectedDate,
  trainingPlanId,
}: ScheduleActivityModalProps) {
  const isEditMode = !!plannedActivityId;
  const isTemplate = !!activityPlan && !activityPlanId;

  // Validation: Must have either activityPlanId, activityPlan, or plannedActivityId
  if (!activityPlanId && !activityPlan && !plannedActivityId) {
    throw new Error(
      "ScheduleActivityModal requires either activityPlanId, activityPlan, or plannedActivityId",
    );
  }

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PlannedActivityScheduleFormData>({
    resolver: zodResolver(plannedActivityScheduleFormSchema),
    defaultValues: {
      scheduled_date: preselectedDate || new Date().toISOString(),
      notes: null,
      activity_plan_id: activityPlanId || "",
      training_plan_id: trainingPlanId || null,
    },
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const scheduledDateString = watch("scheduled_date");
  const scheduledDate =
    scheduledDateString && !isNaN(Date.parse(scheduledDateString))
      ? new Date(scheduledDateString)
      : new Date();
  const currentActivityPlanId = watch("activity_plan_id");

  // Fetch existing activity if editing
  const { data: existingActivity, isLoading: loadingExistingActivity } =
    trpc.plannedActivities.getById.useQuery(
      { id: plannedActivityId! },
      { enabled: isEditMode && visible },
    );

  // Fetch plan details (only if we have an ID, not a template)
  const { data: planDetails, isLoading: loadingPlan } =
    trpc.activityPlans.getById.useQuery(
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
  } = trpc.plannedActivities.validateConstraints.useQuery(
    {
      training_plan_id: trainingPlanId!,
      scheduled_date: scheduledDateString,
      activity_plan_id: currentActivityPlanId,
    },
    {
      enabled: visible && !!trainingPlanId && !!currentActivityPlanId,
    },
  );

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!visible) {
      reset();
    }
  }, [visible, reset]);

  // Load existing activity data (edit mode)
  useEffect(() => {
    if (existingActivity && existingActivity.activity_plan) {
      setValue("activity_plan_id", existingActivity.activity_plan.id);
      setValue("scheduled_date", existingActivity.scheduled_date);
      setValue("notes", existingActivity.notes || null);
    }
  }, [existingActivity, setValue]);

  const utils = trpc.useUtils();

  const createMutation = useReliableMutation(trpc.plannedActivities.create, {
    invalidate: [utils.plannedActivities],
    success: "Activity scheduled!",
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
  });

  const updateMutation = useReliableMutation(trpc.plannedActivities.update, {
    invalidate: [utils.plannedActivities],
    success: "Activity updated!",
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
  });

  const onSubmit = (data: PlannedActivityScheduleFormData) => {
    if (isEditMode) {
      updateMutation.mutate({
        id: plannedActivityId,
        activity_plan_id: data.activity_plan_id,
        scheduled_date: data.scheduled_date,
        notes: data.notes || undefined,
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

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setValue("scheduled_date", date.toISOString());
    }
  };

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
  const canSchedule =
    !isLoading &&
    displayPlan &&
    (!trainingPlanId || validation?.canSchedule !== false) &&
    !isSubmitting;

  if (!visible) return null;

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
              <Text className="text-sm text-muted-foreground mt-0.5">
                {displayPlan.name}
              </Text>
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
                {/* Activity Plan Preview Card */}
                <Card>
                  <CardContent className="p-4">
                    {/* Header Row */}
                    <View className="flex-row items-start mb-3">
                      <View className="mr-3 items-center justify-center w-12 h-12 rounded-full bg-muted">
                        <Text className="text-2xl">
                          {getActivityTypeIcon(displayPlan.activity_category)}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-lg">
                          {displayPlan.name}
                        </Text>
                        {displayPlan.description && (
                          <Text
                            className="text-sm text-muted-foreground mt-1"
                            numberOfLines={2}
                          >
                            {displayPlan.description}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Metrics Row */}
                    <View className="flex-row gap-4 mb-3">
                      {displayPlan.estimated_duration && (
                        <View className="flex-row items-center gap-1.5">
                          <Icon
                            as={Clock}
                            size={16}
                            className="text-muted-foreground"
                          />
                          <Text className="text-sm font-medium">
                            {formatDuration(displayPlan.estimated_duration)}
                          </Text>
                        </View>
                      )}
                      {displayPlan.estimated_tss && (
                        <View className="flex-row items-center gap-1.5">
                          <Icon
                            as={TrendingUp}
                            size={16}
                            className="text-muted-foreground"
                          />
                          <Text className="text-sm font-medium">
                            {Math.round(displayPlan.estimated_tss)} TSS
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Intensity Profile Chart */}
                    {displayPlan.structure?.intervals &&
                      displayPlan.structure.intervals.length > 0 && (
                        <View className="mt-2 rounded-lg overflow-hidden">
                          <Text className="text-xs text-muted-foreground mb-2">
                            Intensity Profile
                          </Text>
                          <TimelineChart
                            structure={displayPlan.structure}
                            height={80}
                            compact={true}
                          />
                        </View>
                      )}
                  </CardContent>
                </Card>

                {/* Date Picker */}
                <View>
                  <Text className="mb-2 font-semibold text-base">
                    Scheduled Date
                  </Text>
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    disabled={isSubmitting}
                  >
                    <View className="flex-row items-center gap-3 p-4 rounded-lg bg-muted border border-border">
                      <Icon
                        as={Calendar}
                        size={20}
                        className="text-foreground"
                      />
                      <Text className="flex-1 text-base">
                        {format(scheduledDate, "EEEE, MMMM d, yyyy")}
                      </Text>
                    </View>
                  </Pressable>
                  {showDatePicker && (
                    <DateTimePicker
                      value={scheduledDate}
                      mode="date"
                      display="default"
                      onChange={handleDateChange}
                      minimumDate={new Date()}
                    />
                  )}
                  {errors.scheduled_date && (
                    <Text className="text-destructive mt-2 text-sm">
                      {errors.scheduled_date.message}
                    </Text>
                  )}
                </View>

                {/* Constraint Validation (when training plan provided) */}
                {trainingPlanId && (
                  <View>
                    {validationError && (
                      <View className="p-4 bg-destructive/10 rounded-lg mb-4">
                        <Text className="text-destructive">
                          Failed to validate constraints. Please try again.
                        </Text>
                      </View>
                    )}

                    <ConstraintValidator
                      validation={validation ?? null}
                      isLoading={validationLoading}
                    />
                  </View>
                )}

                {/* Notes */}
                <View>
                  <Text className="mb-2 font-semibold text-base">
                    Notes (optional)
                  </Text>
                  <Controller
                    control={control}
                    name="notes"
                    render={({ field: { onChange, value } }) => (
                      <Textarea
                        value={value ?? ""}
                        onChangeText={onChange}
                        placeholder="Add any notes about this activity..."
                        className="min-h-[100px]"
                        editable={!isSubmitting}
                      />
                    )}
                  />
                </View>

                {/* Error Messages */}
                {(createMutation.error || updateMutation.error) && (
                  <View className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <Text className="text-destructive font-medium">
                      Failed to {isEditMode ? "update" : "schedule"} activity
                    </Text>
                    <Text className="text-destructive/80 text-sm mt-1">
                      {(createMutation.error || updateMutation.error)
                        ?.message || "Please try again"}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View className="py-8 items-center">
                <Text className="text-destructive">
                  Failed to load activity details
                </Text>
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
            >
              <Text>Cancel</Text>
            </Button>
            <Button
              onPress={handleSubmit(onSubmit)}
              disabled={!canSchedule}
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
          {displayPlan && trainingPlanId && validation && (
            <Text className="text-xs text-muted-foreground text-center mt-2">
              {!validation.canSchedule
                ? "⚠️ This will override constraint violations"
                : validation.hasWarnings
                  ? "⚠️ Close to constraint limits"
                  : "✓ Ready to schedule"}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
