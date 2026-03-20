import React from "react";
import { View, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useFormMutation } from "@/lib/hooks/useFormMutation";
import { Text } from "@repo/ui/components/text";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";

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

  const form = useForm<FormValues>({
    resolver: zodResolver(effortSchema),
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

      <View className="gap-2">
        <Label nativeID="durationLabel">Duration (seconds)</Label>
        <Controller
          control={form.control}
          name="duration_seconds"
          render={({ field }) => (
            <Input
              value={field.value?.toString() || ""}
              onChangeText={(val) => {
                const parsed = parseInt(val, 10);
                field.onChange(isNaN(parsed) ? 0 : parsed);
              }}
              keyboardType="numeric"
              placeholder="e.g. 60"
            />
          )}
        />
        {form.formState.errors.duration_seconds && (
          <Text className="text-destructive text-sm">
            {form.formState.errors.duration_seconds.message}
          </Text>
        )}
      </View>

      <View className="gap-2">
        <Label nativeID="valueLabel">Value</Label>
        <Controller
          control={form.control}
          name="value"
          render={({ field }) => (
            <Input
              value={field.value?.toString() || ""}
              onChangeText={(val) => {
                const parsed = parseFloat(val);
                field.onChange(isNaN(parsed) ? 0 : parsed);
              }}
              keyboardType="numeric"
              placeholder="e.g. 300"
            />
          )}
        />
        {form.formState.errors.value && (
          <Text className="text-destructive text-sm">
            {form.formState.errors.value.message}
          </Text>
        )}
      </View>

      <View className="gap-2">
        <Label nativeID="unitLabel">Unit</Label>
        <Controller
          control={form.control}
          name="unit"
          render={({ field }) => (
            <Input
              value={field.value}
              onChangeText={field.onChange}
              placeholder="e.g. W or m/s"
              autoCapitalize="none"
            />
          )}
        />
        {form.formState.errors.unit && (
          <Text className="text-destructive text-sm">
            {form.formState.errors.unit.message}
          </Text>
        )}
      </View>

      <Button
        className="mt-4"
        onPress={form.handleSubmit((data) => mutation.mutate(data))}
        disabled={mutation.isLoading}
      >
        <Text
          className={
            mutation.isLoading
              ? "text-muted-foreground"
              : "text-primary-foreground"
          }
        >
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
