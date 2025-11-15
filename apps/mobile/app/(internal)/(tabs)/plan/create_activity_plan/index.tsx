import { ActivityTypeSelector } from "@/components/ActivityPlan/ActivityTypeSelector";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateAverageIF,
  calculateTotalDuration,
  calculateTotalTSS,
  flattenPlanSteps,
  getDefaultUserSettings,
} from "@repo/core";
import { router } from "expo-router";
import { ChevronRight, Edit3, Save } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";

// Form schema for activity plan details
const activityPlanFormSchema = z.object({
  name: z.string().min(1, "Activity name is required"),
  description: z.string().optional(),
  activity_type: z.enum([
    "outdoor_run",
    "outdoor_bike",
    "indoor_treadmill",
    "indoor_bike_trainer",
    "indoor_strength",
    "indoor_swim",
  ]),
  estimated_duration: z.number().min(1, "Duration must be at least 1 minute"),
  estimated_tss: z.number().optional(),
});

type ActivityPlanFormData = z.infer<typeof activityPlanFormSchema>;

/**
 * Format duration in milliseconds to readable string
 */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}min`
    : `${hours}h`;
}

export default function CreateActivityPlanScreen() {
  // For now, we'll use local state. In a real app, this would be global state or URL params
  const [structure] = useState<{ steps: any[] }>({ steps: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ActivityPlanFormData>({
    defaultValues: {
      name: "",
      description: "",
      activity_type: "outdoor_run",
      estimated_duration: 30,
      estimated_tss: 0,
    },
  });

  const activityType = form.watch("activity_type");
  const steps = useMemo(() => structure.steps || [], [structure.steps]);

  // Calculate metrics from structure
  const metrics = useMemo(() => {
    const flatSteps = flattenPlanSteps(steps);
    const durationMs = calculateTotalDuration(flatSteps);

    // Get default user settings for TSS/IF calculations
    const userSettings = getDefaultUserSettings(activityType);
    const totalTSS = calculateTotalTSS(steps, userSettings);
    const averageIF = calculateAverageIF(steps, userSettings);

    return {
      stepCount: flatSteps.length,
      duration: durationMs,
      durationFormatted: formatDuration(durationMs),
      tss: totalTSS,
      if: averageIF,
    };
  }, [steps, activityType]);

  // Update estimated duration based on structure
  React.useEffect(() => {
    if (metrics.duration > 0) {
      const estimatedMinutes = Math.round(metrics.duration / 60000);
      form.setValue("estimated_duration", estimatedMinutes);
    }
  }, [metrics.duration, form]);

  // Update estimated TSS based on structure
  React.useEffect(() => {
    if (metrics.tss > 0) {
      form.setValue("estimated_tss", Math.round(metrics.tss));
    }
  }, [metrics.tss, form]);

  /**
   * Handle navigating to structure editor
   */
  const handleEditStructure = () => {
    const currentValues = form.getValues();

    // Navigate to structure page with current form data
    router.push({
      pathname: "/plan/create_activity_plan/structure" as any,
      params: {
        activityType: currentValues.activity_type,
        structureData: JSON.stringify(structure),
      },
    });
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (data: ActivityPlanFormData) => {
    setIsSubmitting(true);

    try {
      const finalData = {
        ...data,
        structure,
        estimated_duration:
          Math.round(metrics.duration / 60000) || data.estimated_duration,
        estimated_tss: Math.round(metrics.tss) || data.estimated_tss || 0,
      };

      // TODO: Save to database via API/tRPC
      console.log("Saving activity plan:", finalData);

      // Show success message
      Alert.alert("Success", "Activity plan saved successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error("Error saving activity plan:", error);
      Alert.alert("Error", "Failed to save activity plan. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Main Form */}
          <Form {...form}>
            <View className="gap-6">
              {/* Activity Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activity Name</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        placeholder="e.g., Morning Run, Interval Training"
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Activity Type */}
              <FormField
                control={form.control}
                name="activity_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activity Type</FormLabel>
                    <FormControl>
                      <ActivityTypeSelector
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Duration */}
              <FormField
                control={form.control}
                name="estimated_duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value?.toString() || ""}
                        onChangeText={(text) => {
                          const num = parseInt(text);
                          if (!isNaN(num)) field.onChange(num);
                        }}
                        keyboardType="numeric"
                        placeholder="30"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        value={field.value || ""}
                        onChangeText={field.onChange}
                        placeholder="Add notes about this activity plan..."
                        className="min-h-[80px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </View>
          </Form>

          {/* Metrics Overview */}
          <Card className="mt-6">
            <CardContent className="p-4">
              <Text className="font-semibold mb-3">Overview</Text>
              <View className="flex-row gap-2 mb-3">
                <View className="flex-1 bg-muted rounded-lg p-3">
                  <Text className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Duration
                  </Text>
                  <Text className="text-lg font-semibold">
                    {metrics.durationFormatted ||
                      `${form.watch("estimated_duration")}min`}
                  </Text>
                </View>
                <View className="flex-1 bg-muted rounded-lg p-3">
                  <Text className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Steps
                  </Text>
                  <Text className="text-lg font-semibold">
                    {metrics.stepCount}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1 bg-muted rounded-lg p-3">
                  <Text className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    TSS
                  </Text>
                  <Text className="text-lg font-semibold">
                    {Math.round(metrics.tss) ||
                      form.watch("estimated_tss") ||
                      0}
                  </Text>
                </View>
                <View className="flex-1 bg-muted rounded-lg p-3">
                  <Text className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    IF
                  </Text>
                  <Text className="text-lg font-semibold">
                    {metrics.if.toFixed(2)}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Structure Preview */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="font-semibold">Activity Structure</Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={handleEditStructure}
                  className="flex-row items-center gap-2"
                >
                  <Icon as={Edit3} size={14} className="text-primary" />
                  <Text className="text-sm">Edit Structure</Text>
                  <Icon
                    as={ChevronRight}
                    size={14}
                    className="text-muted-foreground"
                  />
                </Button>
              </View>

              {steps.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-muted-foreground text-center mb-2">
                    No structure defined
                  </Text>
                  <Text className="text-sm text-muted-foreground text-center mb-4">
                    Tap Edit Structure to add steps and intervals
                  </Text>
                  <Button
                    variant="default"
                    onPress={handleEditStructure}
                    className="px-6"
                  >
                    <Text className="text-primary-foreground">Get Started</Text>
                  </Button>
                </View>
              ) : (
                <View>
                  <TimelineChart
                    structure={structure}
                    height={100}
                    onStepPress={handleEditStructure}
                  />
                  <View className="mt-3 p-3 bg-muted rounded-lg">
                    <Text className="text-sm text-muted-foreground text-center">
                      Tap timeline or Edit Structure to modify steps
                    </Text>
                  </View>
                </View>
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      {/* Footer with Save Button */}
      <View className="border-t border-border bg-card p-4">
        <Button
          onPress={form.handleSubmit(handleSubmit)}
          disabled={isSubmitting}
          className="w-full"
        >
          <Icon as={Save} size={16} className="text-primary-foreground mr-2" />
          <Text className="text-primary-foreground">
            {isSubmitting ? "Saving..." : "Save Activity Plan"}
          </Text>
        </Button>
      </View>
    </View>
  );
}
