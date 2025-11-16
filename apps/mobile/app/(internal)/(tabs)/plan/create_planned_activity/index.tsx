import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  Bike,
  Calendar,
  Check,
  Clock,
  Dumbbell,
  Footprints,
  Plus,
  Search,
  Waves,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { z } from "zod";

const scheduleSchema = z.object({
  activityPlanId: z.string().uuid().min(1, "Select a activity plan"),
  scheduledDate: z.string(),
  notes: z.string().max(500).optional(),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;

const ACTIVITY_CONFIGS = {
  outdoor_run: {
    name: "Outdoor Run",
    icon: Footprints,
    color: "text-blue-600",
  },
  outdoor_bike: { name: "Outdoor Bike", icon: Bike, color: "text-green-600" },
  indoor_treadmill: {
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    icon: Bike,
    color: "text-orange-600",
  },
  indoor_strength: {
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
  },
  indoor_swim: { name: "Swimming", icon: Waves, color: "text-cyan-600" },
  other: { name: "Other", icon: Activity, color: "text-gray-600" },
};

const getTomorrowISO = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

export default function SchedulePlannedActivityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { planId, activityId } = params;

  const [formData, setFormData] = useState<ScheduleFormData>({
    activityPlanId: (planId as string) || "",
    scheduledDate: getTomorrowISO(),
    notes: "",
  });

  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditMode = !!activityId;

  // Queries
  const { data: existingActivity } = trpc.plannedActivities.getById.useQuery(
    { id: activityId as string },
    { enabled: isEditMode },
  );

  const { data: preSelectedPlan } = trpc.activityPlans.getById.useQuery(
    { id: planId as string },
    { enabled: !!planId && !isEditMode },
  );

  const { data: availablePlans, isLoading: isLoadingPlans } =
    trpc.activityPlans.list.useQuery({
      includeOwnOnly: true,
      includeSamples: true,
    });

  // Get utils for query invalidation
  const utils = trpc.useUtils();

  // Mutations
  const createMutation = trpc.plannedActivities.create.useMutation({
    onSuccess: async () => {
      // Invalidate ALL related queries to ensure calendar updates
      await utils.plannedActivities.list.invalidate();
      await utils.plannedActivities.listByWeek.invalidate();
      await utils.plannedActivities.getToday.invalidate();
      await utils.plannedActivities.getWeekCount.invalidate();
      await utils.trainingPlans.getCurrentStatus.invalidate();

      Alert.alert("Success", "Activity scheduled!");
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to schedule activity");
    },
  });

  const updateMutation = trpc.plannedActivities.update.useMutation({
    onSuccess: async () => {
      // Invalidate queries after update as well
      await utils.plannedActivities.list.invalidate();
      await utils.plannedActivities.listByWeek.invalidate();
      await utils.plannedActivities.getToday.invalidate();
      await utils.plannedActivities.getWeekCount.invalidate();
      await utils.trainingPlans.getCurrentStatus.invalidate();

      Alert.alert("Success", "Activity rescheduled!");
      router.back();
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to reschedule activity");
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Load existing activity
  useEffect(() => {
    if (existingActivity) {
      setFormData({
        activityPlanId: existingActivity.activity_plan.id,
        scheduledDate: existingActivity.scheduled_date,
        notes: existingActivity.notes || "",
      });
      setSelectedPlan(existingActivity.activity_plan);
    }
  }, [existingActivity]);

  // Set pre-selected plan
  useEffect(() => {
    if (preSelectedPlan && !isEditMode) {
      setSelectedPlan(preSelectedPlan);
    }
  }, [preSelectedPlan, isEditMode]);

  // Find plan from ID
  useEffect(() => {
    if (formData.activityPlanId && availablePlans && !selectedPlan) {
      const plan = availablePlans.find((p) => p.id === formData.activityPlanId);
      if (plan) setSelectedPlan(plan);
    }
  }, [formData.activityPlanId, availablePlans, selectedPlan]);

  const validateForm = useCallback(() => {
    try {
      scheduleSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: activityId as string,
          scheduled_date: formData.scheduledDate,
          notes: formData.notes,
        });
      } else {
        await createMutation.mutateAsync({
          activity_plan_id: formData.activityPlanId,
          scheduled_date: formData.scheduledDate,
          notes: formData.notes,
        });
      }
    } catch (error) {
      console.error("Failed to save:", error);
    }
  }, [
    validateForm,
    isEditMode,
    activityId,
    formData,
    updateMutation,
    createMutation,
  ]);

  const handlePlanSelect = useCallback((plan: any) => {
    setSelectedPlan(plan);
    setFormData((prev) => ({ ...prev, activityPlanId: plan.id }));
    setShowPlanPicker(false);
    setErrors((prev) => ({ ...prev, activityPlanId: "" }));
  }, []);

  const handleDateChange = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        setFormData((prev) => ({ ...prev, scheduledDate: date.toISOString() }));
      }
    } catch (error) {
      console.error("Invalid date:", error);
    }
  }, []);

  const handleCreateNewPlan = useCallback(() => {
    router.push("/(internal)/(tabs)/plan/create_activity_plan");
  }, [router]);

  const togglePlanPicker = useCallback(() => {
    setShowPlanPicker((prev) => !prev);
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const formatTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, []);

  const dateInputValue = useMemo(
    () =>
      new Date(formData.scheduledDate)
        .toISOString()
        .slice(0, 16)
        .replace("T", " "),
    [formData.scheduledDate],
  );

  const pageTitle = isEditMode ? "Reschedule Activity" : "Schedule Activity";
  const submitLabel = isEditMode ? "Reschedule" : "Schedule";

  const renderPlanCard = useCallback((plan: any, isCompact = false) => {
    const config =
      ACTIVITY_CONFIGS[plan.activity_type as keyof typeof ACTIVITY_CONFIGS] ||
      ACTIVITY_CONFIGS.other;

    return (
      <View className="flex flex-row items-start">
        <View className={`${isCompact ? "mr-2" : "mr-3"} mt-1`}>
          <View
            className={`${isCompact ? "w-9 h-9" : "w-10 h-10"} rounded-full bg-muted flex items-center justify-center`}
          >
            <Icon
              as={config.icon}
              size={isCompact ? 18 : 20}
              className={config.color}
            />
          </View>
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className={`font-semibold ${isCompact ? "text-sm" : ""}`}
            numberOfLines={1}
          >
            {plan.name}
          </Text>
          <Text className="text-sm text-muted-foreground mb-1">
            {config.name}
          </Text>
          <View className="flex flex-row gap-3">
            {plan.estimated_duration && (
              <View className="flex flex-row items-center">
                <Icon as={Clock} size={14} className="text-muted-foreground" />
                <Text className="text-xs text-muted-foreground ml-1">
                  {plan.estimated_duration}m
                </Text>
              </View>
            )}
            {plan.estimated_tss && (
              <Text className="text-xs text-muted-foreground">
                TSS {plan.estimated_tss}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  }, []);

  const renderPlanPickerItem = useCallback(
    (plan: any) => {
      const config =
        ACTIVITY_CONFIGS[plan.activity_type as keyof typeof ACTIVITY_CONFIGS] ||
        ACTIVITY_CONFIGS.other;
      const isSelected = selectedPlan?.id === plan.id;

      return (
        <TouchableOpacity
          key={plan.id}
          onPress={() => handlePlanSelect(plan)}
          className={`border rounded-lg p-3 ${
            isSelected ? "border-primary bg-primary/5" : "border-border"
          }`}
          activeOpacity={0.7}
        >
          <View className="flex flex-row items-start">
            <View className="mr-3 mt-0.5">
              <View className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <Icon as={config.icon} size={18} className={config.color} />
              </View>
            </View>
            <View className="flex-1 min-w-0">
              <View className="flex flex-row items-center justify-between gap-2">
                <Text className="font-semibold flex-1" numberOfLines={1}>
                  {plan.name}
                </Text>
                {isSelected && (
                  <Icon as={Check} size={18} className="text-primary" />
                )}
              </View>
              <Text className="text-sm text-muted-foreground mb-1">
                {config.name}
              </Text>
              <View className="flex flex-row gap-3">
                {plan.estimated_duration && (
                  <Text className="text-xs text-muted-foreground">
                    {plan.estimated_duration}m
                  </Text>
                )}
                {plan.estimated_tss && (
                  <Text className="text-xs text-muted-foreground">
                    TSS {plan.estimated_tss}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [selectedPlan, handlePlanSelect],
  );

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-5 pb-8">
        {/* Header */}
        <View>
          <Text className="text-2xl font-bold">{pageTitle}</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            {isEditMode ? "Update your activity" : "Plan your training session"}
          </Text>
        </View>

        {/* Plan Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Plan *</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPlan ? (
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground">
                  Select a activity plan to schedule
                </Text>
                <Button onPress={togglePlanPicker} variant="outline">
                  <Icon as={Search} size={16} className="text-foreground" />
                  <Text>Select Plan</Text>
                </Button>
                <Button onPress={handleCreateNewPlan} variant="outline">
                  <Icon as={Plus} size={16} className="text-foreground" />
                  <Text>Create New</Text>
                </Button>
                {errors.activityPlanId && (
                  <Text className="text-destructive text-xs">
                    {errors.activityPlanId}
                  </Text>
                )}
              </View>
            ) : (
              <View className="gap-3">
                <View className="bg-muted/30 rounded-lg p-3">
                  {renderPlanCard(selectedPlan)}
                </View>
                {!isEditMode && (
                  <Button
                    onPress={togglePlanPicker}
                    variant="outline"
                    size="sm"
                  >
                    <Text>Change Plan</Text>
                  </Button>
                )}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Date & Time */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="bg-muted/30 rounded-lg p-3">
              <View className="flex flex-row items-center gap-2 mb-1">
                <Icon
                  as={Calendar}
                  size={18}
                  className="text-muted-foreground"
                />
                <Text className="font-medium text-sm">Current Schedule</Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {formatDate(formData.scheduledDate)} at{" "}
                {formatTime(formData.scheduledDate)}
              </Text>
            </View>

            <View>
              <Input
                placeholder="YYYY-MM-DD HH:MM"
                onChangeText={(text) => {
                  const isoString = text.replace(" ", "T") + ":00.000Z";
                  handleDateChange(isoString);
                }}
                defaultValue={dateInputValue}
              />
              <Text className="text-xs text-muted-foreground mt-1">
                Format: YYYY-MM-DD HH:MM (e.g., 2024-01-15 14:30)
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add notes about this session..."
              value={formData.notes}
              onChangeText={(text) =>
                setFormData((prev) => ({ ...prev, notes: text }))
              }
              className="min-h-[70px]"
              maxLength={500}
            />
            <Text className="text-xs text-muted-foreground mt-1">
              {formData.notes?.length || 0}/500
            </Text>
          </CardContent>
        </Card>

        {/* Actions */}
        <View className="flex flex-row gap-3">
          <Button
            variant="outline"
            onPress={() => router.back()}
            className="flex-1"
            disabled={isSubmitting}
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            onPress={handleSubmit}
            className="flex-1"
            disabled={isSubmitting || !selectedPlan}
          >
            <Text className="text-primary-foreground">
              {isSubmitting ? "Saving..." : submitLabel}
            </Text>
          </Button>
        </View>
      </View>

      {/* Plan Picker Modal */}
      <Modal
        visible={showPlanPicker}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-background">
          {/* Header */}
          <View className="flex flex-row items-center justify-between p-4 border-b border-border">
            <Text className="text-lg font-semibold">Select Plan</Text>
            <TouchableOpacity
              onPress={togglePlanPicker}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon as={X} size={24} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>

          {/* Create New */}
          <View className="p-4 border-b border-border">
            <TouchableOpacity
              onPress={handleCreateNewPlan}
              className="bg-primary/10 rounded-lg p-3"
              activeOpacity={0.7}
            >
              <View className="flex flex-row items-center justify-center gap-2">
                <Icon as={Plus} size={20} className="text-primary" />
                <Text className="text-primary font-semibold">
                  Create New Plan
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Plans List */}
          <ScrollView className="flex-1">
            {isLoadingPlans ? (
              <View className="flex-1 flex items-center justify-center p-8">
                <ActivityIndicator size="large" />
                <Text className="text-muted-foreground mt-2">
                  Loading plans...
                </Text>
              </View>
            ) : !availablePlans || availablePlans.length === 0 ? (
              <View className="flex-1 flex items-center justify-center p-8">
                <Text className="text-lg font-semibold mb-2">No Plans</Text>
                <Text className="text-sm text-muted-foreground text-center mb-4">
                  Create your first activity plan to get started
                </Text>
                <Button onPress={handleCreateNewPlan}>
                  <Icon
                    as={Plus}
                    size={16}
                    className="text-primary-foreground"
                  />
                  <Text className="text-primary-foreground">Create Plan</Text>
                </Button>
              </View>
            ) : (
              <View className="p-4 gap-2">
                {availablePlans.map(renderPlanPickerItem)}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}
