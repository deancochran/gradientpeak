import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendar, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";

const scheduleSchema = z.object({
  activityPlanId: z.string().min(1, "Select a plan"),
  scheduledDate: z.date(),
  notes: z.string().optional(),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;

export default function ScheduleActivityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const plannedActivityId = params.activityId as string;
  const preselectedPlanId = params.planId as string;
  const isEditMode = !!plannedActivityId;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ScheduleFormData>({
    defaultValues: {
      scheduledDate: new Date(),
      notes: "",
      activityPlanId: preselectedPlanId || "",
    },
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  const scheduledDate = watch("scheduledDate");
  const activityPlanId = watch("activityPlanId");

  // Fetch available plans
  const { data: plansData, isLoading: loadingPlans } =
    trpc.activityPlans.list.useQuery({
      includeOwnOnly: true,
      includeSamples: true,
      limit: 20,
    });

  const plans = plansData?.items || [];

  // Fetch existing activity if editing
  const { data: existingActivity } = trpc.plannedActivities.getById.useQuery(
    { id: plannedActivityId },
    { enabled: isEditMode },
  );

  // Fetch plan details when preselected or changed
  const { data: planDetails } = trpc.activityPlans.getById.useQuery(
    { id: activityPlanId },
    { enabled: !!activityPlanId },
  );

  useEffect(() => {
    if (existingActivity) {
      setValue("activityPlanId", existingActivity.activity_plan.id);
      setValue("scheduledDate", new Date(existingActivity.scheduled_date));
      setValue("notes", existingActivity.notes || "");
      setSelectedPlan(existingActivity.activity_plan);
    }
  }, [existingActivity, setValue]);

  useEffect(() => {
    if (planDetails) {
      setSelectedPlan(planDetails);
    }
  }, [planDetails]);

  useEffect(() => {
    if (preselectedPlanId && plans.length > 0) {
      const plan = plans.find((p) => p.id === preselectedPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setValue("activityPlanId", plan.id);
      }
    }
  }, [preselectedPlanId, plans, setValue]);

  const utils = trpc.useUtils();

  const createMutation = trpc.plannedActivities.create.useMutation({
    onSuccess: () => {
      utils.plannedActivities.list.invalidate();
      utils.plannedActivities.getToday.invalidate();
      utils.plannedActivities.getWeekCount.invalidate();
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", error.message);
    },
  });

  const updateMutation = trpc.plannedActivities.update.useMutation({
    onSuccess: () => {
      utils.plannedActivities.list.invalidate();
      utils.plannedActivities.getToday.invalidate();
      utils.plannedActivities.getById.invalidate({ id: plannedActivityId });
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", error.message);
    },
  });

  const onSubmit = (data: ScheduleFormData) => {
    if (isEditMode) {
      updateMutation.mutate({
        id: plannedActivityId,
        activity_plan_id: data.activityPlanId,
        scheduled_date: data.scheduledDate.toISOString(),
        notes: data.notes || null,
      });
    } else {
      createMutation.mutate({
        activity_plan_id: data.activityPlanId,
        scheduled_date: data.scheduledDate.toISOString(),
        notes: data.notes || null,
      });
    }
  };

  const handleCreateNewPlan = () => {
    router.push("/plan/create_activity_plan" as any);
  };

  const handleSelectPlan = (plan: any) => {
    setSelectedPlan(plan);
    setValue("activityPlanId", plan.id);
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setValue("scheduledDate", date);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="p-4">
        <Card>
          <CardHeader>
            <CardTitle>Activity Details</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            {/* Plan Selector */}
            <View>
              <Text className="mb-2 font-semibold text-base">
                Select Workout Plan
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
                  <Button variant="outline" onPress={handleCreateNewPlan}>
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
                      {plan.activity_type && (
                        <Text
                          className="text-xs text-muted-foreground capitalize"
                          numberOfLines={1}
                        >
                          {plan.activity_type.replace(/_/g, " ")}
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

              {errors.activityPlanId && (
                <Text className="text-destructive mt-2 text-sm">
                  {errors.activityPlanId.message}
                </Text>
              )}
            </View>

            {/* Create New Plan Button */}
            {plans.length > 0 && (
              <Button variant="outline" onPress={handleCreateNewPlan}>
                <Icon as={Plus} size={20} className="mr-2" />
                <Text>Create New Plan</Text>
              </Button>
            )}

            {/* Selected Plan Details */}
            {selectedPlan && (
              <Card className="bg-muted/50">
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
            <View>
              <Text className="mb-2 font-semibold text-base">
                Scheduled Date
              </Text>
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
              {errors.scheduledDate && (
                <Text className="text-destructive mt-2 text-sm">
                  {errors.scheduledDate.message}
                </Text>
              )}
            </View>

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
                    value={value}
                    onChangeText={onChange}
                    placeholder="Add any notes about this workout..."
                    className="min-h-[100px]"
                  />
                )}
              />
            </View>

            {/* Submit Button */}
            <Button
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting || !selectedPlan}
              className="mt-2"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" className="mr-2" />
              ) : null}
              <Text className="text-primary-foreground font-semibold">
                {isEditMode ? "Update Schedule" : "Schedule Activity"}
              </Text>
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  );
}
