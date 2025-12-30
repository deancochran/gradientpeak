import {
  AdvancedConfigSheet,
  AdvancedConfigData,
} from "@/components/training-plan/AdvancedConfigSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Edit3,
  Save,
  Settings2,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  View,
} from "react-native";

export default function TrainingPlanSettings() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get training plan
  const {
    data: plan,
    isLoading: loadingPlan,
    refetch: refetchPlan,
  } = trpc.trainingPlans.get.useQuery();

  // Get current status
  const { data: status } = trpc.trainingPlans.getCurrentStatus.useQuery(
    undefined,
    {
      enabled: !!plan,
    },
  );

  // UI state
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Basic info edit state
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");

  // Pause state (stored in is_active field)
  const [isPaused, setIsPaused] = useState(false);

  // Initialize edit fields when plan loads
  React.useEffect(() => {
    if (plan && !isEditingBasic) {
      setEditedName(plan.name);
      setEditedDescription(plan.description || "");
      setIsPaused(!plan.is_active);
    }
  }, [plan, isEditingBasic]);

  // Update mutation
  const updateMutation = useReliableMutation(trpc.trainingPlans.update, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Success", "Training plan updated successfully");
      setIsEditingBasic(false);
      setShowAdvancedConfig(false);
      refetchPlan();
    },
    onError: (error) => {
      Alert.alert("Update Failed", error.message || "Failed to update plan");
    },
  });

  // Delete mutation
  const deleteMutation = useReliableMutation(trpc.trainingPlans.delete, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Plan Deleted", "Your training plan has been deleted", [
        {
          text: "OK",
          onPress: () => router.replace(ROUTES.PLAN.INDEX),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Delete Failed", error.message || "Failed to delete plan");
    },
  });

  // Handle save basic info
  const handleSaveBasicInfo = async () => {
    if (!plan) return;

    if (!editedName.trim()) {
      Alert.alert("Invalid Input", "Plan name cannot be empty");
      return;
    }

    await updateMutation.mutateAsync({
      id: plan.id,
      name: editedName.trim(),
      description: editedDescription.trim() || null,
    });
  };

  // Handle save advanced config
  const handleSaveAdvancedConfig = async (data: AdvancedConfigData) => {
    if (!plan) return;

    const structure = plan.structure as any;

    await updateMutation.mutateAsync({
      id: plan.id,
      structure: {
        ...structure,
        target_weekly_tss_min: data.target_weekly_tss_min,
        target_weekly_tss_max: data.target_weekly_tss_max,
        target_activities_per_week: data.target_activities_per_week,
        max_consecutive_days: data.max_consecutive_days,
        min_rest_days_per_week: data.min_rest_days_per_week,
        periodization_template: data.periodization_template,
      },
    });
  };

  // Handle pause/resume
  const handleTogglePause = async () => {
    if (!plan) return;

    const newPauseState = !isPaused;

    Alert.alert(
      newPauseState ? "Pause Training Plan?" : "Resume Training Plan?",
      newPauseState
        ? "Your plan will be paused. Activities will remain scheduled but won't count toward progress."
        : "Your plan will be resumed. New activities can be scheduled.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newPauseState ? "Pause" : "Resume",
          onPress: async () => {
            await updateMutation.mutateAsync({
              id: plan.id,
              is_active: !newPauseState,
            });
            setIsPaused(newPauseState);
          },
        },
      ],
    );
  };

  // Handle delete
  const handleDelete = () => {
    if (!plan) return;

    Alert.alert(
      "Delete Training Plan?",
      "This action cannot be undone. All scheduled activities will remain but won't be linked to a plan.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteMutation.mutateAsync({ id: plan.id });
          },
        },
      ],
    );
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditingBasic(false);
    if (plan) {
      setEditedName(plan.name);
      setEditedDescription(plan.description || "");
    }
  };

  // Loading state
  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading settings...</Text>
      </View>
    );
  }

  // No plan state
  if (!plan) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6">
        <Icon
          as={AlertCircle}
          size={64}
          className="text-muted-foreground mb-4"
        />
        <Text className="text-xl font-semibold mb-2">No Training Plan</Text>
        <Text className="text-muted-foreground text-center mb-6">
          Create a training plan to access settings
        </Text>
        <Button onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE)}>
          <Text className="text-primary-foreground font-semibold">
            Create Plan
          </Text>
        </Button>
      </View>
    );
  }

  const structure = plan.structure as any;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView className="flex-1">
        <View className="p-4 gap-4">
          {/* Plan Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Status</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-semibold mb-1">
                      {isPaused ? "Paused" : "Active"}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {isPaused
                        ? "Plan is paused. Activities won't count toward progress."
                        : "Plan is active. Track your fitness and complete scheduled activities."}
                    </Text>
                  </View>
                  <Switch
                    checked={!isPaused}
                    onCheckedChange={handleTogglePause}
                    disabled={updateMutation.isPending}
                  />
                </View>

                {status && (
                  <>
                    <View className="h-px bg-border" />
                    <View className="flex-row items-center justify-between">
                      <Text className="text-muted-foreground">
                        Current Fitness (CTL)
                      </Text>
                      <Text className="font-semibold">{status.ctl}</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-muted-foreground">
                        Weekly Adherence
                      </Text>
                      <Text className="font-semibold">
                        {status.weekProgress?.completedActivities || 0} /{" "}
                        {status.weekProgress?.totalPlannedActivities || 0}{" "}
                        activities
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </CardContent>
          </Card>

          {/* Basic Information Card */}
          <Card>
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <CardTitle>Basic Information</CardTitle>
                {!isEditingBasic && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setIsEditingBasic(true)}
                  >
                    <Icon as={Edit3} size={16} className="text-primary" />
                  </Button>
                )}
              </View>
            </CardHeader>
            <CardContent>
              <View className="gap-4">
                <View>
                  <Label>Plan Name</Label>
                  {isEditingBasic ? (
                    <Input
                      value={editedName}
                      onChangeText={setEditedName}
                      placeholder="Enter plan name"
                    />
                  ) : (
                    <Text className="text-base">{plan.name}</Text>
                  )}
                </View>

                <View>
                  <Label>Description (Optional)</Label>
                  {isEditingBasic ? (
                    <Textarea
                      value={editedDescription}
                      onChangeText={setEditedDescription}
                      placeholder="Enter plan description"
                      numberOfLines={3}
                    />
                  ) : (
                    <Text className="text-base text-muted-foreground">
                      {plan.description || "No description"}
                    </Text>
                  )}
                </View>

                <View>
                  <Label>Created</Label>
                  <Text className="text-base">
                    {new Date(plan.created_at).toLocaleDateString()}
                  </Text>
                </View>

                {/* Save/Cancel buttons */}
                {isEditingBasic && (
                  <View className="flex-row gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onPress={handleCancelEdit}
                    >
                      <Text className="text-foreground">Cancel</Text>
                    </Button>
                    <Button
                      className="flex-1"
                      onPress={handleSaveBasicInfo}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <>
                          <Icon
                            as={Save}
                            size={18}
                            className="text-primary-foreground mr-2"
                          />
                          <Text className="text-primary-foreground font-semibold">
                            Save
                          </Text>
                        </>
                      )}
                    </Button>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>

          {/* Advanced Training Configuration Card */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>Training Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-4">
                <Text className="text-sm text-muted-foreground">
                  Configure weekly targets, recovery rules, and periodization
                  settings to customize your training plan.
                </Text>

                {/* Quick preview of current settings */}
                <View className="gap-2 p-3 bg-muted/50 rounded-lg">
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-muted-foreground">
                      Weekly TSS:
                    </Text>
                    <Text className="text-sm font-medium">
                      {structure.target_weekly_tss_min} -{" "}
                      {structure.target_weekly_tss_max}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-muted-foreground">
                      Activities/week:
                    </Text>
                    <Text className="text-sm font-medium">
                      {structure.target_activities_per_week}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-muted-foreground">
                      Rest days/week:
                    </Text>
                    <Text className="text-sm font-medium">
                      {structure.min_rest_days_per_week}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-muted-foreground">
                      Periodization:
                    </Text>
                    <Text className="text-sm font-medium">
                      {structure.periodization_template
                        ? "Enabled"
                        : "Disabled"}
                    </Text>
                  </View>
                </View>

                <Button
                  onPress={() => setShowAdvancedConfig(true)}
                  className="flex-row gap-2"
                >
                  <Icon
                    as={Settings2}
                    size={18}
                    className="text-primary-foreground"
                  />
                  <Text className="text-primary-foreground font-semibold">
                    Advanced Configuration
                  </Text>
                </Button>
              </View>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground mb-2">
                  Deleting your plan will remove all training structure.
                  Scheduled activities will remain but won't be linked to a
                  plan.
                </Text>
                <Button
                  variant="destructive"
                  onPress={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Icon as={Trash2} size={18} className="text-white mr-2" />
                      <Text className="text-white font-semibold">
                        Delete Training Plan
                      </Text>
                    </>
                  )}
                </Button>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      {/* Advanced Config Sheet */}
      <AdvancedConfigSheet
        visible={showAdvancedConfig}
        onClose={() => setShowAdvancedConfig(false)}
        initialData={{
          target_weekly_tss_min: structure.target_weekly_tss_min,
          target_weekly_tss_max: structure.target_weekly_tss_max,
          target_activities_per_week: structure.target_activities_per_week,
          max_consecutive_days: structure.max_consecutive_days,
          min_rest_days_per_week: structure.min_rest_days_per_week,
          periodization_template: structure.periodization_template,
        }}
        onSave={handleSaveAdvancedConfig}
        isSaving={updateMutation.isPending}
      />
    </KeyboardAvoidingView>
  );
}
