import {
  type ActivityEffortCategory,
  type ActivityEffortType,
  activityEffortToInputDescriptor,
  formatEffortDuration,
  getActivityEffortDefinition,
  getActivityEffortDefinitionsForCategory,
  getDefaultActivityEffortDefinition,
} from "@repo/core/athlete-inputs";
import { Form, FormBoundedNumberField, FormSegmentedSelectField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const effortSchema = z.object({
  activity_category: z.enum(["bike", "run", "swim"]),
  effort_type: z.enum(["power", "speed"]),
  duration_seconds: z.number().int().positive("Duration must be positive"),
  value: z.number().positive("Value must be positive"),
  recorded_at: z.string(),
});

type FormValues = z.infer<typeof effortSchema>;

function ActivityEffortCreate() {
  const router = useRouter();
  const utils = api.useUtils();

  const form = useZodForm({
    schema: effortSchema,
    defaultValues: {
      activity_category: "bike",
      effort_type: "power",
      duration_seconds: 1200,
      value: 250,
      recorded_at: new Date().toISOString(),
    },
  });
  const selectedCategory = form.watch("activity_category") as ActivityEffortCategory;
  const selectedEffortType = form.watch("effort_type") as ActivityEffortType;
  const effortDefinitions = React.useMemo(
    () => getActivityEffortDefinitionsForCategory(selectedCategory),
    [selectedCategory],
  );
  const effortDefinition =
    getActivityEffortDefinition({
      activityCategory: selectedCategory,
      effortType: selectedEffortType,
    }) ?? getDefaultActivityEffortDefinition(selectedCategory);
  const valueDescriptor = activityEffortToInputDescriptor(effortDefinition);

  React.useEffect(() => {
    if (effortDefinitions.some((definition) => definition.effortType === selectedEffortType))
      return;
    const nextDefinition =
      effortDefinitions[0] ?? getDefaultActivityEffortDefinition(selectedCategory);
    form.setValue("effort_type", nextDefinition.effortType);
    form.setValue("duration_seconds", nextDefinition.durationPresets[0] ?? 60);
  }, [effortDefinitions, form, selectedCategory, selectedEffortType]);

  const createMutation = api.activityEfforts.create.useMutation();
  const submitForm = useZodFormSubmit<FormValues>({
    form,
    shouldRethrow: false,
    onSubmit: async (data) => {
      const definition =
        getActivityEffortDefinition({
          activityCategory: data.activity_category,
          effortType: data.effort_type,
        }) ?? getDefaultActivityEffortDefinition(data.activity_category);

      await createMutation.mutateAsync({
        ...data,
        unit: definition.unit,
      });
      await Promise.all([
        utils.activityEfforts.invalidate(),
        utils.activities.invalidate(),
        utils.events.invalidate(),
        utils.trainingPlans.invalidate(),
      ]);
      router.back();
    },
    onError: (error) =>
      handleSubmitFormError(form, error, { alertTitle: "Failed to create effort" }),
  });

  const isSubmitting = submitForm.isSubmitting || createMutation.isPending;
  const saveButtonState = submitForm.getSubmitButtonState({
    disabled: isSubmitting,
    label: "Save",
    submittingLabel: "Saving...",
  });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Add effort",
          headerRight: () => (
            <Text
              accessibilityRole="button"
              className={
                isSubmitting
                  ? "text-sm font-semibold text-muted-foreground"
                  : "text-sm font-semibold text-primary"
              }
              onPress={isSubmitting ? undefined : submitForm.handleSubmit}
            >
              {saveButtonState.label}
            </Text>
          ),
        }}
      />
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
                { label: "Bike", value: "bike" },
                { label: "Run", value: "run" },
                { label: "Swim", value: "swim" },
              ]}
              testId="activity-category-segments"
            />

            <FormSegmentedSelectField
              control={form.control}
              disabled={isSubmitting}
              label="Effort Type"
              name="effort_type"
              options={effortDefinitions.map((definition) => ({
                label: definition.label.replace(/^\w+\s/, ""),
                value: definition.effortType,
              }))}
              testId="effort-type-segments"
            />

            <FormSegmentedSelectField
              control={form.control}
              label="Duration"
              name="duration_seconds"
              options={effortDefinition.durationPresets.map((duration) => ({
                label: formatEffortDuration(duration),
                value: String(duration),
              }))}
              parseValue={(value) => Number(value)}
              testId="duration-preset-segments"
            />

            <FormBoundedNumberField
              control={form.control}
              decimals={valueDescriptor.decimals}
              description={`${valueDescriptor.label} is saved as ${effortDefinition.unit}.`}
              label={valueDescriptor.label}
              max={valueDescriptor.max}
              min={valueDescriptor.min}
              name="value"
              placeholder={valueDescriptor.inputKind === "integer" ? "300" : "4.5"}
              testId="effort-value-input"
              unitLabel={effortDefinition.unit}
            />
          </View>
        </Form>
      </ScrollView>
    </View>
  );
}

export default function ActivityEffortCreateWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityEffortCreate />
    </ErrorBoundary>
  );
}
