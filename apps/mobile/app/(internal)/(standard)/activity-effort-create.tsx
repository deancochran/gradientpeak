import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormBoundedNumberField,
  FormControl,
  FormField,
  FormIntegerStepperField,
  FormItem,
  FormLabel,
  FormMessage,
  FormTextField,
} from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { applyServerFormErrors, showErrorAlert } from "@/lib/utils/formErrors";

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
    onSubmit: async (data) => {
      try {
        await createMutation.mutateAsync(data);
        await utils.activityEfforts.invalidate();
        Alert.alert("Success", "Effort created successfully");
        router.back();
      } catch (error) {
        if (applyServerFormErrors(form, error)) {
          return;
        }

        throw error;
      }
    },
  });

  useEffect(() => {
    if (submitForm.submitError) {
      showErrorAlert(submitForm.submitError, "Failed to create effort");
    }
  }, [submitForm.submitError]);

  const categories = ["run", "bike", "swim", "strength", "other"] as const;
  const effortTypes = ["power", "speed"] as const;
  const isSubmitting = submitForm.isSubmitting || createMutation.isPending;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      keyboardShouldPersistTaps="handled"
    >
      <Form {...form}>
        <View className="gap-6">
          <FormField
            control={form.control}
            name="activity_category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Category</FormLabel>
                <FormControl>
                  <View className="flex-row flex-wrap gap-2">
                    {categories.map((category) => (
                      <Button
                        key={category}
                        variant={field.value === category ? "default" : "outline"}
                        onPress={() => field.onChange(category)}
                        className="flex-1 min-w-[30%]"
                        disabled={isSubmitting}
                      >
                        <Text
                          className={
                            field.value === category
                              ? "text-primary-foreground capitalize"
                              : "text-foreground capitalize"
                          }
                        >
                          {category}
                        </Text>
                      </Button>
                    ))}
                  </View>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="effort_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effort Type</FormLabel>
                <FormControl>
                  <View className="flex-row gap-2">
                    {effortTypes.map((effortType) => (
                      <Button
                        key={effortType}
                        variant={field.value === effortType ? "default" : "outline"}
                        onPress={() => field.onChange(effortType)}
                        className="flex-1"
                        disabled={isSubmitting}
                      >
                        <Text
                          className={
                            field.value === effortType
                              ? "text-primary-foreground capitalize"
                              : "text-foreground capitalize"
                          }
                        >
                          {effortType}
                        </Text>
                      </Button>
                    ))}
                  </View>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
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
