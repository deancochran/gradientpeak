import { ErrorBoundary, ModalErrorFallback } from "@/components/ErrorBoundary";
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
import { Calendar, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

interface ScheduleActivityModalProps {
  isVisible: boolean;
  onClose: () => void;
  preselectedDate?: Date;
  preselectedPlanId?: string;
  plannedActivityId?: string; // For edit mode
}

function ScheduleActivityModalContent({
  isVisible,
  onClose,
  preselectedDate,
  preselectedPlanId,
  plannedActivityId,
}: ScheduleActivityModalProps) {
  const isEditMode = !!plannedActivityId;
  const utils = trpc.useUtils();

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
      scheduled_date: (preselectedDate || new Date()).toISOString(),
      notes: null,
      activity_plan_id: preselectedPlanId || "",
      training_plan_id: null,
    },
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  const scheduledDateString = watch("scheduled_date");
  const scheduledDate =
    scheduledDateString && !isNaN(Date.parse(scheduledDateString))
      ? new Date(scheduledDateString)
      : new Date();
  const activityPlanId = watch("activity_plan_id");

  // Fetch available plans
  const { data: plansData, isLoading: loadingPlans } =
    trpc.activityPlans.list.useQuery(
      {
        includeOwnOnly: true,
        includeSamples: true,
        limit: 20,
      },
      { enabled: isVisible },
    );

  const plans = plansData?.items || [];

  // Fetch existing activity if editing
  const { data: existingActivity } = trpc.plannedActivities.getById.useQuery(
    { id: plannedActivityId! },
    { enabled: isEditMode && !!plannedActivityId },
  );

  // Fetch plan details
  const { data: planDetails } = trpc.activityPlans.getById.useQuery(
    { id: activityPlanId },
    { enabled: !!activityPlanId },
  );

  // Reset form when modal opens
  useEffect(() => {
    if (isVisible && !isEditMode) {
      reset({
        scheduled_date: (preselectedDate || new Date()).toISOString(),
        notes: null,
        activity_plan_id: preselectedPlanId || "",
        training_plan_id: null,
      });
      setSelectedPlan(null);
    }
  }, [isVisible, isEditMode, preselectedDate, preselectedPlanId, reset]);

  // Load existing activity data
  useEffect(() => {
    if (existingActivity) {
      setValue("activity_plan_id", existingActivity.activity_plan.id);
      setValue("scheduled_date", existingActivity.scheduled_date);
      setValue("notes", existingActivity.notes || null);
      setSelectedPlan(existingActivity.activity_plan);
    }
  }, [existingActivity, setValue]);

  // Update selected plan when details load
  useEffect(() => {
    if (planDetails) {
      setSelectedPlan(planDetails);
    }
  }, [planDetails]);

  // Preselect plan if provided
  useEffect(() => {
    if (preselectedPlanId && plans.length > 0 && !selectedPlan) {
      const plan = plans.find((p) => p.id === preselectedPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setValue("activity_plan_id", plan.id);
      }
    }
  }, [preselectedPlanId, plans, selectedPlan, setValue]);

  const createMutation = useReliableMutation(trpc.plannedActivities.create, {
    invalidate: [utils.plannedActivities, utils.trainingPlans],
    success: "Activity scheduled!",
    onSuccess: () => {
      onClose();
      reset();
    },
  });

  const updateMutation = useReliableMutation(trpc.plannedActivities.update, {
    invalidate: [utils.plannedActivities, utils.trainingPlans],
    success: "Activity updated!",
    onSuccess: () => {
      onClose();
      reset();
    },
  });

  const onSubmit = (data: PlannedActivityScheduleFormData) => {
    if (isEditMode) {
      updateMutation.mutate({
        id: plannedActivityId!,
        activity_plan_id: data.activity_plan_id,
        scheduled_date: data.scheduled_date,
        notes: data.notes || undefined,
      });
    } else {
      createMutation.mutate({
        activity_plan_id: data.activity_plan_id,
        scheduled_date: data.scheduled_date,
        notes: data.notes || undefined,
      });
    }
  };

  const handleSelectPlan = (plan: any) => {
    setSelectedPlan(plan);
    setValue("activity_plan_id", plan.id);
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setValue("scheduled_date", date.toISOString());
    }
  };

  const handleClose = () => {
    if (!createMutation.isPending && !updateMutation.isPending) {
      onClose();
      reset();
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      transparent={false}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-12 pb-4 border-b border-border bg-card">
          <Text className="text-xl font-bold">
            {isEditMode ? "Reschedule Activity" : "Schedule Activity"}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.7}
            className="w-10 h-10 items-center justify-center"
            disabled={isSubmitting}
          >
            <Icon as={X} size={24} className="text-muted-foreground" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView className="flex-1" contentContainerClassName="p-4">
          {/* Plan Selector */}
          <View className="mb-4">
            <Text className="mb-2 font-semibold text-base">
              Select Activity Plan
            </Text>

            {loadingPlans ? (
              <View className="py-8 items-center">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-muted-foreground mt-2">
                  Loading plans...
                </Text>
              </View>
            ) : plans.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-sm text-muted-foreground mb-3">
                  No plans available
                </Text>
                <Button variant="outline" onPress={() => {}}>
                  <Icon as={Plus} size={20} className="mr-2" />
                  <Text>Create Your First Plan</Text>
                </Button>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="gap-3"
                contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
              >
                {plans.map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    onPress={() => handleSelectPlan(plan)}
                    className={`p-4 rounded-lg border-2 min-w-[200px] ${
                      selectedPlan?.id === plan.id
                        ? "bg-primary/10 border-primary"
                        : "bg-muted border-transparent"
                    }`}
                  >
                    <Text
                      className={`font-semibold mb-1 ${
                        selectedPlan?.id === plan.id
                          ? "text-primary"
                          : "text-foreground"
                      }`}
                      numberOfLines={1}
                    >
                      {plan.name}
                    </Text>
                    {plan.activity_category && (
                      <Text
                        className="text-xs text-muted-foreground capitalize"
                        numberOfLines={1}
                      >
                        {plan.activity_category.replace(/_/g, " ")}
                      </Text>
                    )}
                    {plan.estimated_duration && (
                      <Text className="text-xs text-muted-foreground mt-1">
                        {plan.estimated_duration} min
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {errors.activity_plan_id && (
              <Text className="text-destructive mt-2 text-sm">
                {errors.activity_plan_id.message}
              </Text>
            )}
          </View>

          {/* Selected Plan Details */}
          {selectedPlan && (
            <Card className="bg-muted/50 mb-4">
              <CardContent className="p-3">
                <Text className="text-sm font-medium mb-1">
                  {selectedPlan.name}
                </Text>
                {selectedPlan.description && (
                  <Text
                    className="text-xs text-muted-foreground"
                    numberOfLines={2}
                  >
                    {selectedPlan.description}
                  </Text>
                )}
                <View className="flex-row gap-3 mt-2">
                  {selectedPlan.estimated_duration && (
                    <Text className="text-xs text-muted-foreground">
                      ⏱️ {selectedPlan.estimated_duration} min
                    </Text>
                  )}
                  {selectedPlan.estimated_tss && (
                    <Text className="text-xs text-muted-foreground">
                      ⚡ {selectedPlan.estimated_tss} TSS
                    </Text>
                  )}
                </View>
              </CardContent>
            </Card>
          )}

          {/* Date Picker */}
          <View className="mb-4">
            <Text className="mb-2 font-semibold text-base">Scheduled Date</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)}>
              <View className="flex-row items-center gap-3 p-4 rounded-lg bg-muted border border-border">
                <Icon as={Calendar} size={20} className="text-foreground" />
                <Text className="flex-1 text-base">
                  {format(scheduledDate, "EEEE, MMMM d, yyyy")}
                </Text>
              </View>
            </TouchableOpacity>
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

          {/* Notes */}
          <View className="mb-4">
            <Text className="mb-2 font-semibold text-base">
              Notes (optional)
            </Text>
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <Textarea
                  value={value || ""}
                  onChangeText={onChange}
                  placeholder="Add any notes about this activity..."
                  className="min-h-[100px]"
                />
              )}
            />
          </View>

          {/* Submit Button */}
          <Button
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || !selectedPlan}
            size="lg"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" className="mr-2" />
            ) : null}
            <Text className="text-primary-foreground font-semibold">
              {isEditMode ? "Update Schedule" : "Schedule Activity"}
            </Text>
          </Button>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ScheduleActivityModal(props: ScheduleActivityModalProps) {
  return (
    <ErrorBoundary fallback={ModalErrorFallback}>
      <ScheduleActivityModalContent {...props} />
    </ErrorBoundary>
  );
}
