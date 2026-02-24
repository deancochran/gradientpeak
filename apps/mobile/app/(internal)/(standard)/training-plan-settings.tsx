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
import { AlertCircle, Edit3, Save, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

  // UI state
  const [isEditingBasic, setIsEditingBasic] = useState(false);

  // Basic info edit state
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");

  // Initialize edit fields when plan loads
  React.useEffect(() => {
    if (plan && !isEditingBasic) {
      setEditedName(plan.name);
      setEditedDescription(plan.description || "");
    }
  }, [plan, isEditingBasic]);

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView className="flex-1">
        <View className="p-4 gap-4">
          {/* Plan Lifecycle Card */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Lifecycle</CardTitle>
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

          {/* Training Plan Structure */}
          <Card>
            <CardHeader>
              <CardTitle>Training Plan Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-4">
                <Text className="text-sm text-muted-foreground">
                  Use the shared composer to update goals, availability,
                  constraints, and projection tuning.
                </Text>
                <Button
                  onPress={() =>
                    router.push({
                      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
                      params: { id: plan.id },
                    })
                  }
                >
                  <Text className="text-primary-foreground font-semibold">
                    Edit Structure
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
