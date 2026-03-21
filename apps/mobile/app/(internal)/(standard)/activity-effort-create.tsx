import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormBoundedNumberField,
  FormIntegerStepperField,
  FormTextField,
} from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import React from "react";
import { Controller } from "react-hook-form";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { useFormMutation } from "@/lib/hooks/useFormMutation";
import { trpc } from "@/lib/trpc";

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

  const createMutation = trpc.activityEfforts.create.useMutation();

  const mutation = useFormMutation({
    mutationFn: async (data: FormValues) => {
      return createMutation.mutateAsync(data);
    },
    form,
    invalidateQueries: [["activityEfforts"]],
    successMessage: "Effort created successfully",
    onSuccess: () => {
      router.back();
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create effort");
    },
  });

  const categories = ["run", "bike", "swim", "strength", "other"] as const;
  const effortTypes = ["power", "speed"] as const;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2">
        <Label nativeID="categoryLabel">Activity Category</Label>
        <Controller
          control={form.control}
          name="activity_category"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-2">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={field.value === cat ? "default" : "outline"}
                  onPress={() => field.onChange(cat)}
                  className="flex-1 min-w-[30%]"
                >
                  <Text
                    className={
                      field.value === cat
                        ? "text-primary-foreground capitalize"
                        : "text-foreground capitalize"
                    }
                  >
                    {cat}
                  </Text>
                </Button>
              ))}
            </View>
          )}
        />
        {form.formState.errors.activity_category && (
          <Text className="text-destructive text-sm mt-1">
            {form.formState.errors.activity_category.message}
          </Text>
        )}
      </View>

      <View className="gap-2">
        <Label nativeID="typeLabel">Effort Type</Label>
        <Controller
          control={form.control}
          name="effort_type"
          render={({ field }) => (
            <View className="flex-row gap-2">
              {effortTypes.map((t) => (
                <Button
                  key={t}
                  variant={field.value === t ? "default" : "outline"}
                  onPress={() => field.onChange(t)}
                  className="flex-1"
                >
                  <Text
                    className={
                      field.value === t
                        ? "text-primary-foreground capitalize"
                        : "text-foreground capitalize"
                    }
                  >
                    {t}
                  </Text>
                </Button>
              ))}
            </View>
          )}
        />
        {form.formState.errors.effort_type && (
          <Text className="text-destructive text-sm mt-1">
            {form.formState.errors.effort_type.message}
          </Text>
        )}
      </View>

      <Form {...form}>
        <View className="gap-6">
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

      <Button
        className="mt-4"
        onPress={form.handleSubmit((data) => mutation.mutate(data))}
        disabled={mutation.isLoading}
      >
        <Text className={mutation.isLoading ? "text-muted-foreground" : "text-primary-foreground"}>
          {mutation.isLoading ? "Saving..." : "Save Effort"}
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
