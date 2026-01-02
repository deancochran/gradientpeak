import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { FitnessProjectionChart } from "@/components/charts/FitnessProjectionChart";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import {
  Calendar,
  Target,
  TrendingUp,
  Activity,
  Settings,
} from "lucide-react-native";
import React, { useState, useMemo } from "react";
import { View, ScrollView, Alert } from "react-native";
import type {
  WizardPeriodizedInput,
  TrainingPlan as TrainingPlanType,
} from "@repo/core";
import { wizardInputToPlan } from "@repo/core";

export default function TrainingPlanReview() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const utils = trpc.useUtils();

  // Parse wizard data from params
  const wizardInput = useMemo(() => {
    if (params.wizardData && typeof params.wizardData === "string") {
      return JSON.parse(params.wizardData) as WizardPeriodizedInput;
    }
    return null;
  }, [params.wizardData]);

  // Generate training plan from wizard input
  const [planGenerationError, setPlanGenerationError] = useState<string | null>(
    null,
  );

  const generatedPlan = useMemo(() => {
    if (!wizardInput) return null;
    try {
      setPlanGenerationError(null);
      return wizardInputToPlan(wizardInput);
    } catch (error) {
      console.error("Failed to generate plan:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to generate training plan from your inputs";
      setPlanGenerationError(errorMessage);
      return null;
    }
  }, [wizardInput]);

  const [planName, setPlanName] = useState(
    generatedPlan?.name || "My Training Plan",
  );
  const [planDescription, setPlanDescription] = useState(
    generatedPlan?.description || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create mutation
  const createPlanMutation = useReliableMutation(trpc.trainingPlans.create, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Success", "Your training plan has been created!", [
        {
          text: "View Plan",
          onPress: () => {
            router.replace("/training-plan" as any);
          },
        },
      ]);
    },
    onError: (error) => {
      let errorMessage = "Failed to create training plan.";

      // Try to extract meaningful error messages from the error
      if (error.message) {
        if (error.message.includes("Invalid training plan structure")) {
          errorMessage =
            "The training plan configuration is invalid. Please go back and check your inputs.";
        } else if (error.message.includes("validation")) {
          errorMessage =
            "Your training plan has validation errors. Please review your goal date, fitness level, and weekly availability.";
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert("Unable to Create Plan", errorMessage, [{ text: "OK" }]);
      setIsSubmitting(false);
    },
  });

  const handleCreatePlan = async () => {
    if (!generatedPlan) {
      Alert.alert("Error", "No plan data available");
      return;
    }

    setIsSubmitting(true);

    try {
      await createPlanMutation.mutateAsync({
        name: planName,
        description: planDescription || undefined,
        structure: generatedPlan,
      });
    } catch (error) {
      console.error("Failed to create plan:", error);
    }
  };

  const handleAdjust = () => {
    // Navigate back to wizard with current data
    Alert.alert("Edit Plan", "Go back to the wizard to make changes?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Edit",
        onPress: () => router.back(),
      },
    ]);
  };

  if (!wizardInput) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-4">
        <Text className="text-destructive text-center text-lg font-semibold mb-2">
          No Plan Data Available
        </Text>
        <Text className="text-muted-foreground text-center mb-4">
          Please go back and complete the wizard to create your training plan.
        </Text>
        <Button onPress={() => router.back()} className="mt-4">
          <Text>Go Back to Wizard</Text>
        </Button>
      </View>
    );
  }

  if (!generatedPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-4">
        <Text className="text-destructive text-center text-lg font-semibold mb-2">
          Unable to Generate Plan
        </Text>
        <Text className="text-muted-foreground text-center mb-4">
          {planGenerationError ||
            "There was an error creating your training plan. Please check your inputs and try again."}
        </Text>
        <Button onPress={() => router.back()} className="mt-4">
          <Text>Go Back to Wizard</Text>
        </Button>
      </View>
    );
  }

  // Extract plan details
  const primaryGoal = wizardInput.goals[0];
  const blocks =
    generatedPlan.plan_type === "periodized" ? generatedPlan.blocks : [];
  const fitnessProgression =
    generatedPlan.plan_type === "periodized"
      ? generatedPlan.fitness_progression
      : null;
  const constraints =
    generatedPlan.plan_type === "periodized"
      ? generatedPlan.constraints
      : generatedPlan.plan_type === "maintenance"
        ? generatedPlan.constraints
        : undefined;

  // Calculate plan summary stats
  const totalWeeks =
    blocks.length > 0
      ? Math.ceil(
          (new Date(blocks[blocks.length - 1]!.end_date).getTime() -
            new Date(blocks[0]!.start_date).getTime()) /
            (7 * 24 * 60 * 60 * 1000),
        )
      : 0;

  const avgWeeklyTSS =
    blocks.length > 0
      ? Math.round(
          blocks.reduce(
            (sum, block) => sum + (block.target_weekly_tss_range?.max || 0),
            0,
          ) / blocks.length,
        )
      : 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Review Your Plan",
          headerShown: true,
        }}
      />

      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        {/* Plan Name & Description */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Details</CardTitle>
            <CardDescription>Give your plan a name</CardDescription>
          </CardHeader>
          <CardContent>
            <View className="gap-4">
              <View className="gap-2">
                <Label nativeID="plan-name">Plan Name</Label>
                <Input
                  placeholder="e.g., Marathon Training Spring 2025"
                  value={planName}
                  onChangeText={setPlanName}
                  aria-labelledby="plan-name"
                />
              </View>

              <View className="gap-2">
                <Label nativeID="plan-description">
                  Description (Optional)
                </Label>
                <Input
                  placeholder="Add notes about this plan..."
                  value={planDescription}
                  onChangeText={setPlanDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 80 }}
                  aria-labelledby="plan-description"
                />
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <View className="flex-row gap-2">
          {/* Goal Summary */}
          <Card className="flex-1">
            <CardContent className="p-4 items-center">
              <Target size={24} className="text-primary mb-2" />
              <Text className="text-xs text-muted-foreground mb-1">
                Goal Event
              </Text>
              <Text className="font-semibold text-center" numberOfLines={2}>
                {primaryGoal?.name}
              </Text>
              <Text className="text-xs text-muted-foreground mt-1">
                {primaryGoal?.target_date &&
                  new Date(primaryGoal.target_date).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
              </Text>
            </CardContent>
          </Card>

          {/* Duration Summary */}
          <Card className="flex-1">
            <CardContent className="p-4 items-center">
              <Calendar size={24} className="text-primary mb-2" />
              <Text className="text-xs text-muted-foreground mb-1">
                Duration
              </Text>
              <Text className="font-semibold text-2xl">{totalWeeks}</Text>
              <Text className="text-xs text-muted-foreground">weeks</Text>
            </CardContent>
          </Card>
        </View>

        <View className="flex-row gap-2">
          {/* Fitness Summary */}
          <Card className="flex-1">
            <CardContent className="p-4 items-center">
              <TrendingUp size={24} className="text-primary mb-2" />
              <Text className="text-xs text-muted-foreground mb-1">
                CTL Range
              </Text>
              <Text className="font-semibold">
                {fitnessProgression?.starting_ctl || 0} →{" "}
                {fitnessProgression?.target_ctl_at_peak || 0}
              </Text>
              <Text className="text-xs text-muted-foreground mt-1">
                Peak Fitness
              </Text>
            </CardContent>
          </Card>

          {/* Load Summary */}
          <Card className="flex-1">
            <CardContent className="p-4 items-center">
              <Activity size={24} className="text-primary mb-2" />
              <Text className="text-xs text-muted-foreground mb-1">
                Avg Weekly
              </Text>
              <Text className="font-semibold">{avgWeeklyTSS}</Text>
              <Text className="text-xs text-muted-foreground">TSS</Text>
            </CardContent>
          </Card>
        </View>

        {/* Fitness Projection Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Fitness Progression</CardTitle>
            <CardDescription>
              Your projected CTL over the training period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FitnessProjectionChart
              blocks={blocks}
              fitnessProgression={fitnessProgression || undefined}
            />
          </CardContent>
        </Card>

        {/* Blocks Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Training Blocks</CardTitle>
            <CardDescription>{blocks.length} phases planned</CardDescription>
          </CardHeader>
          <CardContent>
            <View className="gap-2">
              {blocks.map((block, index) => (
                <View
                  key={block.id}
                  className="flex-row items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <View className="flex-1">
                    <Text className="font-semibold capitalize">
                      {block.phase} {index + 1}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {new Date(block.start_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      -{" "}
                      {new Date(block.end_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-semibold text-primary">
                      {block.target_weekly_tss_range?.max || 0}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      TSS/week
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Constraints Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Training Constraints</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-2">
              {constraints?.max_hours_per_week && (
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Max hours/week:</Text>
                  <Text className="font-medium">
                    {constraints.max_hours_per_week}h
                  </Text>
                </View>
              )}
              {constraints?.max_sessions_per_week && (
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">
                    Max sessions/week:
                  </Text>
                  <Text className="font-medium">
                    {constraints.max_sessions_per_week}
                  </Text>
                </View>
              )}
              {constraints?.min_rest_days_per_week !== undefined && (
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">
                    Min rest days/week:
                  </Text>
                  <Text className="font-medium">
                    {constraints.min_rest_days_per_week}
                  </Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>

        {/* Spacing for footer */}
        <View className="h-4" />
      </ScrollView>

      {/* Sticky Footer */}
      <View className="border-t border-border bg-card px-4 py-3">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            onPress={handleAdjust}
            disabled={isSubmitting}
            className="flex-1"
          >
            <Settings size={20} className="text-foreground" />
            <Text>Adjust</Text>
          </Button>

          <Button
            onPress={handleCreatePlan}
            disabled={isSubmitting || !planName.trim()}
            className="flex-1"
          >
            <Text>{isSubmitting ? "Creating..." : "Create Plan"}</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
