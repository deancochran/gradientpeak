import {
  getProfileMetricDefinition,
  type ProfileMetricType,
  profileMetricToInputDescriptor,
  profileMetricTypeSchema,
  profileMetricTypes,
} from "@repo/core/athlete-inputs";
import {
  Form,
  FormBoundedNumberField,
  FormDateTimeField,
  FormSegmentedSelectField,
  FormTextareaField,
  FormWeightInputField,
} from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { skipToken } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import type { Control } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const profileMetricEditSchema = z.object({
  metric_type: profileMetricTypeSchema,
  value: z.number({ message: "Value is required" }).finite(),
  recorded_at: z.string().min(1, "Recorded date is required"),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").nullable(),
});

type ProfileMetricEditForm = z.infer<typeof profileMetricEditSchema>;

function toDateTimeInputValue(value: string | Date | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toSubmitDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function MetricValueField({
  control,
  metricType,
}: {
  control: Control<ProfileMetricEditForm>;
  metricType: ProfileMetricType;
}) {
  const descriptor = profileMetricToInputDescriptor(getProfileMetricDefinition(metricType));
  const description = `Enter ${descriptor.label.toLowerCase()} between ${descriptor.min} and ${descriptor.max}${descriptor.unit !== "scale" ? ` ${descriptor.unit}` : ""}.`;

  if (descriptor.inputKind === "weight") {
    return (
      <FormWeightInputField
        control={control}
        description={description}
        label={descriptor.label}
        name="value"
        placeholder="70.0"
        testId="profile-metric-value"
        unit="kg"
      />
    );
  }

  return (
    <FormBoundedNumberField
      control={control}
      decimals={descriptor.decimals}
      description={description}
      label={descriptor.label}
      max={descriptor.max}
      min={descriptor.min}
      name="value"
      placeholder={descriptor.inputKind === "scale" ? "5" : undefined}
      testId="profile-metric-value"
      unitLabel={descriptor.unit === "scale" ? undefined : descriptor.unit}
    />
  );
}

function ProfileMetricEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const router = useRouter();
  const { user } = useAuth();
  const utils = api.useUtils();

  const { data: metric, isLoading } = api.profileMetrics.getById.useQuery(id ? { id } : skipToken);
  const createMutation = api.profileMetrics.create.useMutation();
  const updateMutation = api.profileMetrics.update.useMutation();

  const form = useZodForm({
    schema: profileMetricEditSchema,
    defaultValues: {
      metric_type: "weight_kg",
      value: getProfileMetricDefinition("weight_kg").defaultValue,
      recorded_at: toDateTimeInputValue(null),
      notes: null,
    },
  });
  const selectedMetricType = form.watch("metric_type");
  const previousMetricTypeRef = React.useRef<ProfileMetricType>(selectedMetricType);

  React.useEffect(() => {
    if (!metric) return;
    form.reset({
      metric_type: metric.metric_type as ProfileMetricType,
      value: Number(metric.value),
      recorded_at: toDateTimeInputValue(metric.recorded_at),
      notes: metric.notes ?? null,
    });
  }, [form, metric]);

  React.useEffect(() => {
    if (isEditMode) return;
    if (previousMetricTypeRef.current === selectedMetricType) return;
    previousMetricTypeRef.current = selectedMetricType;
    form.setValue("value", getProfileMetricDefinition(selectedMetricType).defaultValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, isEditMode, selectedMetricType]);

  const submitForm = useZodFormSubmit<ProfileMetricEditForm>({
    form,
    shouldRethrow: false,
    onSubmit: async (data) => {
      if (isEditMode && id) {
        await updateMutation.mutateAsync({
          id,
          value: data.value,
          recorded_at: toSubmitDateTime(data.recorded_at),
          notes: data.notes || null,
        });
      } else {
        if (!user?.id) throw new Error("Sign in before adding profile metrics");
        await createMutation.mutateAsync({
          profile_id: user.id,
          metric_type: data.metric_type,
          value: data.value,
          recorded_at: toSubmitDateTime(data.recorded_at),
          notes: data.notes || null,
        });
      }
      await utils.profileMetrics.invalidate();
      router.back();
    },
    onError: (error) =>
      handleSubmitFormError(form, error, { alertTitle: "Failed to save profile metric" }),
  });

  const isSaving = submitForm.isSubmitting || createMutation.isPending || updateMutation.isPending;
  const saveButtonState = submitForm.getSubmitButtonState({
    disabled: isSaving,
    label: "Save",
    submittingLabel: "Saving...",
  });

  if (isEditMode && isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message="Loading metric..." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
      testID="profile-metric-edit-screen"
    >
      <Stack.Screen
        options={{
          title: isEditMode ? "Edit metric" : "Add metric",
          headerRight: () => (
            <Text
              accessibilityRole="button"
              className={
                isSaving
                  ? "text-sm font-semibold text-muted-foreground"
                  : "text-sm font-semibold text-primary"
              }
              onPress={isSaving ? undefined : submitForm.handleSubmit}
            >
              {saveButtonState.label}
            </Text>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <Form {...form}>
          <View className="gap-5">
            <FormSegmentedSelectField
              control={form.control}
              disabled={isEditMode || isSaving}
              label="Metric"
              name="metric_type"
              options={profileMetricTypes.map((metricType) => ({
                label: getProfileMetricDefinition(metricType).label,
                value: metricType,
              }))}
              testId="profile-metric-type"
            />
            <MetricValueField control={form.control} metricType={selectedMetricType} />
            <FormDateTimeField
              control={form.control}
              dateLabel="Recorded date"
              label="Recorded"
              name="recorded_at"
              testId="profile-metric-recorded-at"
              timeLabel="Recorded time"
            />
            <FormTextareaField
              control={form.control}
              label="Notes"
              name="notes"
              numberOfLines={3}
              parseValue={(value) => value || null}
              placeholder="Optional note"
            />
          </View>
        </Form>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ProfileMetricEditScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ProfileMetricEditScreen />
    </ErrorBoundary>
  );
}
