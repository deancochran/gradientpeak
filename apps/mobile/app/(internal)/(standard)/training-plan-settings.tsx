import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Edit3,
  Save,
  Trash2,
  Settings2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  TouchableOpacity,
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
  const [isEditingStructure, setIsEditingStructure] = useState(false);

  // Basic info edit state
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");

  // Structure edit state
  const [editedWeeklyTSSMin, setEditedWeeklyTSSMin] = useState("");
  const [editedWeeklyTSSMax, setEditedWeeklyTSSMax] = useState("");
  const [editedActivitiesPerWeek, setEditedActivitiesPerWeek] = useState("");
  const [editedMaxConsecutiveDays, setEditedMaxConsecutiveDays] = useState("");
  const [editedMinRestDays, setEditedMinRestDays] = useState("");
  const [editedStartingCTL, setEditedStartingCTL] = useState("");
  const [editedTargetCTL, setEditedTargetCTL] = useState("");
  const [editedTargetDate, setEditedTargetDate] = useState("");

  // Initialize edit fields when plan loads
  React.useEffect(() => {
    if (plan && !isEditingBasic) {
      setEditedName(plan.name);
      setEditedDescription(plan.description || "");
    }
  }, [plan, isEditingBasic]);

  // Initialize structure fields when plan loads
  React.useEffect(() => {
    if (plan && !isEditingStructure) {
      const structure = plan.structure as any;
      setEditedWeeklyTSSMin(String(structure?.target_weekly_tss_min || ""));
      setEditedWeeklyTSSMax(String(structure?.target_weekly_tss_max || ""));
      setEditedActivitiesPerWeek(
        String(structure?.target_activities_per_week || ""),
      );
      setEditedMaxConsecutiveDays(
        String(structure?.max_consecutive_days || ""),
      );
      setEditedMinRestDays(String(structure?.min_rest_days_per_week || ""));
      setEditedStartingCTL(
        String(structure?.periodization_template?.starting_ctl || ""),
      );
      setEditedTargetCTL(
        String(structure?.periodization_template?.target_ctl || ""),
      );
      setEditedTargetDate(structure?.periodization_template?.target_date || "");
    }
  }, [plan, isEditingStructure]);

  // Update mutation
  const updateMutation = useReliableMutation(trpc.trainingPlans.update, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Success", "Training plan updated successfully");
      setIsEditingBasic(false);
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

  // Handle save structure
  const handleSaveStructure = async () => {
    if (!plan) return;

    // Validate inputs
    const weeklyTSSMin = parseInt(editedWeeklyTSSMin);
    const weeklyTSSMax = parseInt(editedWeeklyTSSMax);
    const activitiesPerWeek = parseInt(editedActivitiesPerWeek);
    const maxConsecutiveDays = parseInt(editedMaxConsecutiveDays);
    const minRestDays = parseInt(editedMinRestDays);

    if (isNaN(weeklyTSSMin) || weeklyTSSMin < 0) {
      Alert.alert(
        "Invalid Input",
        "Minimum weekly TSS must be a positive number",
      );
      return;
    }
    if (isNaN(weeklyTSSMax) || weeklyTSSMax < weeklyTSSMin) {
      Alert.alert(
        "Invalid Input",
        "Maximum weekly TSS must be greater than or equal to minimum",
      );
      return;
    }
    if (
      isNaN(activitiesPerWeek) ||
      activitiesPerWeek < 1 ||
      activitiesPerWeek > 7
    ) {
      Alert.alert(
        "Invalid Input",
        "Activities per week must be between 1 and 7",
      );
      return;
    }
    if (
      isNaN(maxConsecutiveDays) ||
      maxConsecutiveDays < 1 ||
      maxConsecutiveDays > 7
    ) {
      Alert.alert(
        "Invalid Input",
        "Max consecutive days must be between 1 and 7",
      );
      return;
    }
    if (isNaN(minRestDays) || minRestDays < 0 || minRestDays > 7) {
      Alert.alert("Invalid Input", "Min rest days must be between 0 and 7");
      return;
    }

    // Get current structure and update it
    const currentStructure = plan.structure as any;
    const updatedStructure = {
      ...currentStructure,
      target_weekly_tss_min: weeklyTSSMin,
      target_weekly_tss_max: weeklyTSSMax,
      target_activities_per_week: activitiesPerWeek,
      max_consecutive_days: maxConsecutiveDays,
      min_rest_days_per_week: minRestDays,
    };

    // Update periodization if fields are provided
    if (editedStartingCTL || editedTargetCTL || editedTargetDate) {
      const startingCTL = parseInt(editedStartingCTL);
      const targetCTL = parseInt(editedTargetCTL);

      if (editedStartingCTL && (isNaN(startingCTL) || startingCTL < 0)) {
        Alert.alert("Invalid Input", "Starting CTL must be a positive number");
        return;
      }
      if (editedTargetCTL && (isNaN(targetCTL) || targetCTL < 0)) {
        Alert.alert("Invalid Input", "Target CTL must be a positive number");
        return;
      }
      if (editedTargetDate && new Date(editedTargetDate) <= new Date()) {
        Alert.alert("Invalid Input", "Target date must be in the future");
        return;
      }

      updatedStructure.periodization_template = {
        ...currentStructure.periodization_template,
        ...(editedStartingCTL && { starting_ctl: startingCTL }),
        ...(editedTargetCTL && { target_ctl: targetCTL }),
        ...(editedTargetDate && { target_date: editedTargetDate }),
      };
    }

    await updateMutation.mutateAsync({
      id: plan.id,
      structure: updatedStructure,
    });
    setIsEditingStructure(false);
  };

  // Handle activate/deactivate
  const handleToggleActive = async () => {
    if (!plan) return;

    const newActiveState = !plan.is_active;

    Alert.alert(
      newActiveState ? "Set as Active Plan?" : "Deactivate Plan?",
      newActiveState
        ? "This plan will become your active training plan. Any other active plan will be deactivated."
        : "This plan will be deactivated. You can reactivate it anytime from the plans list.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newActiveState ? "Set Active" : "Deactivate",
          onPress: async () => {
            await updateMutation.mutateAsync({
              id: plan.id,
              is_active: newActiveState,
            });
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
      "This action cannot be undone. All planned activities associated with this training plan will also be deleted.",
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

  // Handle cancel structure edit
  const handleCancelStructureEdit = () => {
    setIsEditingStructure(false);
    if (plan) {
      const structure = plan.structure as any;
      setEditedWeeklyTSSMin(String(structure?.target_weekly_tss_min || ""));
      setEditedWeeklyTSSMax(String(structure?.target_weekly_tss_max || ""));
      setEditedActivitiesPerWeek(
        String(structure?.target_activities_per_week || ""),
      );
      setEditedMaxConsecutiveDays(
        String(structure?.max_consecutive_days || ""),
      );
      setEditedMinRestDays(String(structure?.min_rest_days_per_week || ""));
      setEditedStartingCTL(
        String(structure?.periodization_template?.starting_ctl || ""),
      );
      setEditedTargetCTL(
        String(structure?.periodization_template?.target_ctl || ""),
      );
      setEditedTargetDate(structure?.periodization_template?.target_date || "");
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
        <Button onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.WIZARD)}>
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
                      {plan.is_active ? "Active" : "Inactive"}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {plan.is_active
                        ? "This is your active training plan. It guides your current training and tracks metrics."
                        : "This plan is inactive. Set it as active to use it for training guidance."}
                    </Text>
                  </View>
                  <Switch
                    checked={plan.is_active}
                    onCheckedChange={handleToggleActive}
                    disabled={updateMutation.isPending}
                  />
                </View>

                {status && plan.is_active && (
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

          {/* Training Plan Structure Card */}
          <Card>
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <CardTitle>Training Plan Structure</CardTitle>
                {!isEditingStructure && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setIsEditingStructure(true)}
                  >
                    <Icon as={Edit3} size={16} className="text-primary" />
                  </Button>
                )}
              </View>
            </CardHeader>
            <CardContent>
              <View className="gap-4">
                {/* Weekly TSS Range */}
                <View>
                  <Label>Weekly TSS Range</Label>
                  {isEditingStructure ? (
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Input
                          value={editedWeeklyTSSMin}
                          onChangeText={setEditedWeeklyTSSMin}
                          placeholder="Min"
                          keyboardType="numeric"
                        />
                      </View>
                      <View className="flex-1">
                        <Input
                          value={editedWeeklyTSSMax}
                          onChangeText={setEditedWeeklyTSSMax}
                          placeholder="Max"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.target_weekly_tss_min || 0} -{" "}
                      {(plan.structure as any)?.target_weekly_tss_max || 0}
                    </Text>
                  )}
                </View>

                {/* Activities per Week */}
                <View>
                  <Label>Activities per Week</Label>
                  {isEditingStructure ? (
                    <Input
                      value={editedActivitiesPerWeek}
                      onChangeText={setEditedActivitiesPerWeek}
                      placeholder="Enter number"
                      keyboardType="numeric"
                    />
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.target_activities_per_week || 0}
                    </Text>
                  )}
                </View>

                {/* Max Consecutive Days */}
                <View>
                  <Label>Max Consecutive Training Days</Label>
                  {isEditingStructure ? (
                    <Input
                      value={editedMaxConsecutiveDays}
                      onChangeText={setEditedMaxConsecutiveDays}
                      placeholder="Enter number"
                      keyboardType="numeric"
                    />
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.max_consecutive_days || 0}
                    </Text>
                  )}
                </View>

                {/* Min Rest Days */}
                <View>
                  <Label>Min Rest Days per Week</Label>
                  {isEditingStructure ? (
                    <Input
                      value={editedMinRestDays}
                      onChangeText={setEditedMinRestDays}
                      placeholder="Enter number"
                      keyboardType="numeric"
                    />
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.min_rest_days_per_week || 0}
                    </Text>
                  )}
                </View>

                <View className="h-px bg-border my-2" />

                {/* Periodization Section */}
                <Text className="text-sm font-semibold text-muted-foreground">
                  Periodization (Optional)
                </Text>

                {/* Starting CTL */}
                <View>
                  <Label>Starting CTL</Label>
                  {isEditingStructure ? (
                    <Input
                      value={editedStartingCTL}
                      onChangeText={setEditedStartingCTL}
                      placeholder="Enter starting CTL"
                      keyboardType="numeric"
                    />
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.periodization_template
                        ?.starting_ctl || "Not set"}
                    </Text>
                  )}
                </View>

                {/* Target CTL */}
                <View>
                  <Label>Target CTL</Label>
                  {isEditingStructure ? (
                    <Input
                      value={editedTargetCTL}
                      onChangeText={setEditedTargetCTL}
                      placeholder="Enter target CTL"
                      keyboardType="numeric"
                    />
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.periodization_template
                        ?.target_ctl || "Not set"}
                    </Text>
                  )}
                </View>

                {/* Target Date */}
                <View>
                  <Label>Target Date</Label>
                  {isEditingStructure ? (
                    <Input
                      value={editedTargetDate}
                      onChangeText={setEditedTargetDate}
                      placeholder="YYYY-MM-DD"
                    />
                  ) : (
                    <Text className="text-base">
                      {(plan.structure as any)?.periodization_template
                        ?.target_date
                        ? new Date(
                            (plan.structure as any).periodization_template
                              .target_date,
                          ).toLocaleDateString()
                        : "Not set"}
                    </Text>
                  )}
                </View>

                {/* Save/Cancel buttons */}
                {isEditingStructure && (
                  <View className="flex-row gap-3 mt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onPress={handleCancelStructureEdit}
                    >
                      <Text className="text-foreground">Cancel</Text>
                    </Button>
                    <Button
                      className="flex-1"
                      onPress={handleSaveStructure}
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

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-3">
                <Text className="text-sm text-muted-foreground mb-2">
                  Deleting your training plan will permanently remove all
                  training structure and all associated planned activities. This
                  action cannot be undone.
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
    </KeyboardAvoidingView>
  );
}
