import { AppHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useSmartSuggestions } from "@/lib/hooks/useSmartSuggestions";
import { trpc } from "@/lib/trpc";
import {
  ADJUSTMENT_PRESETS,
  getAdjustmentSummary,
} from "@/lib/utils/training-adjustments";
import { useRouter } from "expo-router";
import { ChevronRight, Settings2, Sparkles } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function TrainingPlanAdjustScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get training plan and status
  const { data: plan, isLoading: loadingPlan } =
    trpc.trainingPlans.get.useQuery();
  const { data: status } = trpc.trainingPlans.getCurrentStatus.useQuery(
    undefined,
    {
      enabled: !!plan,
    },
  );

  // Get weekly summaries for smart suggestions
  const { data: weeklySummaries } =
    trpc.trainingPlans.getWeeklySummary.useQuery(
      {
        training_plan_id: plan?.id || "",
        weeks_back: 4,
      },
      {
        enabled: !!plan?.id,
      },
    );

  // Calculate smart suggestions
  const smartSuggestion = useSmartSuggestions({
    plan,
    status,
    weeklySummaries,
  });

  // Apply adjustment mutation
  const applyAdjustmentMutation = useReliableMutation(
    trpc.trainingPlans.applyQuickAdjustment,
    {
      invalidate: [utils.trainingPlans],
      onSuccess: () => {
        Alert.alert("Success", "Training plan adjusted successfully", [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]);
      },
      onError: (error) => {
        Alert.alert(
          "Adjustment Failed",
          error.message || "Failed to adjust plan",
        );
      },
    },
  );

  const handleApplySuggestion = () => {
    if (!smartSuggestion || !plan) return;

    const changes = getAdjustmentSummary(
      plan.structure,
      smartSuggestion.adjustedStructure,
    );

    Alert.alert(
      "Apply Smart Suggestion?",
      `This will make the following changes:\n\n${changes.join("\n")}\n\nYou can always adjust again later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: async () => {
            await applyAdjustmentMutation.mutateAsync({
              id: plan.id,
              adjustedStructure: smartSuggestion.adjustedStructure,
            });
          },
        },
      ],
    );
  };

  const handleApplyPreset = (type: string) => {
    if (!plan) return;

    const preset = ADJUSTMENT_PRESETS.find((p) => p.type === type);
    if (!preset) return;

    const adjustedStructure = preset.calculate(plan.structure);
    const changes = getAdjustmentSummary(plan.structure, adjustedStructure);

    Alert.alert(
      `${preset.label}?`,
      `This will make the following changes:\n\n${changes.join("\n")}\n\nYou can always adjust again later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: async () => {
            await applyAdjustmentMutation.mutateAsync({
              id: plan.id,
              adjustedStructure,
            });
          },
        },
      ],
    );
  };

  // Loading state
  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Adjust Plan" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">Loading plan...</Text>
        </View>
      </View>
    );
  }

  // No plan state
  if (!plan) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Adjust Plan" />
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-xl font-semibold mb-2">No Active Plan</Text>
          <Text className="text-muted-foreground text-center">
            Create or activate a training plan to adjust it
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Adjust Plan" />

      <ScrollView className="flex-1">
        <View className="p-4 gap-4">
          {/* Current Plan Info */}
          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-2">
                <Text className="text-lg font-semibold">{plan.name}</Text>
                {plan.description && (
                  <Text className="text-sm text-muted-foreground">
                    {plan.description}
                  </Text>
                )}

                {status && (
                  <View className="flex-row gap-3 mt-3">
                    <View className="flex-1 bg-muted/50 rounded-lg p-3">
                      <Text className="text-xs text-muted-foreground mb-1">
                        Fitness (CTL)
                      </Text>
                      <Text className="text-lg font-semibold">
                        {status.ctl}
                      </Text>
                    </View>
                    <View className="flex-1 bg-muted/50 rounded-lg p-3">
                      <Text className="text-xs text-muted-foreground mb-1">
                        Adherence
                      </Text>
                      <Text className="text-lg font-semibold">
                        {status.weekProgress
                          ? Math.round(
                              (status.weekProgress.completedActivities /
                                (status.weekProgress.totalPlannedActivities ||
                                  1)) *
                                100,
                            )
                          : 0}
                        %
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>

          {/* Smart Suggestion */}
          {smartSuggestion && (
            <Card
              className={`border-2 ${
                smartSuggestion.severity === "alert"
                  ? "border-destructive/50"
                  : "border-primary/50"
              }`}
            >
              <CardHeader>
                <View className="flex-row items-center">
                  <Icon as={Sparkles} size={20} className="text-primary mr-2" />
                  <CardTitle>Smart Suggestion</CardTitle>
                </View>
              </CardHeader>
              <CardContent>
                <View className="gap-3">
                  <View>
                    <Text className="font-semibold mb-2">
                      {smartSuggestion.title}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {smartSuggestion.description}
                    </Text>
                  </View>

                  <Button
                    onPress={handleApplySuggestion}
                    disabled={applyAdjustmentMutation.isPending}
                  >
                    {applyAdjustmentMutation.isPending ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-primary-foreground font-semibold">
                        Apply Suggestion
                      </Text>
                    )}
                  </Button>
                </View>
              </CardContent>
            </Card>
          )}

          {/* Quick Adjustments */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <View className="gap-3">
                {ADJUSTMENT_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.type}
                    onPress={() => handleApplyPreset(preset.type)}
                    disabled={applyAdjustmentMutation.isPending}
                    className="flex-row items-center p-4 bg-muted/50 rounded-lg active:bg-muted"
                    activeOpacity={0.7}
                  >
                    <View className="w-12 h-12 items-center justify-center bg-background rounded-full mr-3">
                      <Text className="text-2xl">{preset.icon}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold mb-1">{preset.label}</Text>
                      <Text className="text-sm text-muted-foreground">
                        {preset.description}
                      </Text>
                    </View>
                    <Icon
                      as={ChevronRight}
                      size={20}
                      className="text-muted-foreground"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </CardContent>
          </Card>

          {/* Advanced Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Advanced</CardTitle>
            </CardHeader>
            <CardContent>
              <TouchableOpacity
                onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)}
                className="flex-row items-center justify-between p-4 bg-muted/50 rounded-lg active:bg-muted"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center">
                  <Icon
                    as={Settings2}
                    size={20}
                    className="text-primary mr-3"
                  />
                  <Text className="font-semibold">Custom Adjustment</Text>
                </View>
                <Icon
                  as={ChevronRight}
                  size={20}
                  className="text-muted-foreground"
                />
              </TouchableOpacity>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
