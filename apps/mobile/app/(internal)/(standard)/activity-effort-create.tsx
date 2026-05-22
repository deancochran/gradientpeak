import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormBoundedNumberField,
  FormIntegerStepperField,
  FormSegmentedSelectField,
  FormTextField,
} from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const effortSchema = z.object({
  activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
  effort_type: z.enum(["power", "speed"]),
  duration_seconds: z.number().int().positive("Duration must be positive"),
  value: z.number().positive("Value must be positive"),
  unit: z.string().min(1, "Unit is required"),
  recorded_at: z.string(),
});

type FormValues = z.infer<typeof effortSchema>;

function ActivityEffortCreate() {
  const router = useRouter();
  const utils = api.useUtils();

  const form = useZodForm({
    schema: effortSchema,
    defaultValues: {
      activity_category: "run",
      effort_type: "power",
      duration_seconds: 60,
      value: 0,
      unit: "W",
      recorded_at: new Date().toISOString(),
    },
  });

  const createMutation = api.activityEfforts.create.useMutation();
  const submitForm = useZodFormSubmit<FormValues>({
    form,
    shouldRethrow: false,
    onSubmit: async (data) => {
      await createMutation.mutateAsync(data);
      await Promise.all([
        utils.activityEfforts.invalidate(),
        utils.activities.invalidate(),
        utils.events.invalidate(),
        utils.trainingPlans.invalidate(),
      ]);
      Alert.alert("Success", "Effort created successfully");
      router.back();
    },
    onError: (error) =>
      handleSubmitFormError(form, error, { alertTitle: "Failed to create effort" }),
  });

  const isSubmitting = submitForm.isSubmitting || createMutation.isPending;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      keyboardShouldPersistTaps="handled"
    >
      <Form {...form}>
        <View className="gap-6">
          <FormSegmentedSelectField
            control={form.control}
            disabled={isSubmitting}
            label="Activity Category"
            name="activity_category"
            options={[
              { label: "Run", value: "run" },
              { label: "Bike", value: "bike" },
              { label: "Swim", value: "swim" },
              { label: "Strength", value: "strength" },
              { label: "Other", value: "other" },
            ]}
            testId="activity-category-segments"
          />

          <FormSegmentedSelectField
            control={form.control}
            disabled={isSubmitting}
            label="Effort Type"
            name="effort_type"
            options={[
              { label: "Power", value: "power" },
              { label: "Speed", value: "speed" },
            ]}
            testId="effort-type-segments"
          />

          <FormIntegerStepperField
            control={form.control}
            description="Use whole seconds for the effort duration."
            label="Duration (seconds)"
            min={1}
            max={7200}
            name="duration_seconds"
            step={5}
            testId="duration-seconds-stepper"
          />

          <FormBoundedNumberField
            control={form.control}
            decimals={1}
            label="Value"
            min={0}
            name="value"
            placeholder="e.g. 300"
            testId="effort-value-input"
          />

          <FormTextField
            autoCapitalize="none"
            control={form.control}
            label="Unit"
            name="unit"
            placeholder="e.g. W or m/s"
            testId="unit-input"
          />
        </View>
      </Form>

      <Button className="mt-4" onPress={submitForm.handleSubmit} disabled={isSubmitting}>
        <Text className={isSubmitting ? "text-muted-foreground" : "text-primary-foreground"}>
          {isSubmitting ? "Saving..." : "Save Effort"}
        </Text>
      </Button>
    </ScrollView>
  );
}

export default function ActivityEffortCreateWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityEffortCreate />
    </ErrorBoundary>
  );
}
