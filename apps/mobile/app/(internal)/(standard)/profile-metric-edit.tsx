import {
  addProfileMetricValueRangeIssue,
  getProfileMetricDefinition,
  isActivityDerivedThresholdMetricType,
  type ProfileMetricType,
  profileMetricToInputDescriptor,
  profileMetricTypeSchema,
} from "@repo/core/athlete-inputs";
import {
  Form,
  FormBoundedNumberField,
  FormDateTimeField,
  FormTextareaField,
  FormWeightInputField,
} from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { skipToken } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { type Control, Controller } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { profileMetricSections } from "@/lib/profile-metrics/trends";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const profileMetricEditSchema = z
  .object({
    metric_type: profileMetricTypeSchema,
    value: z.number({ message: "Value is required" }).finite(),
    recorded_at: z.string().min(1, "Recorded date is required"),
    notes: z.string().max(1000, "Notes must be less than 1000 characters").nullable(),
  })
  .superRefine(addProfileMetricValueRangeIssue);

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

  if (metricType === "threshold_pace_seconds_per_km" || metricType === "css_seconds_per_100m") {
    const unitLabel = metricType === "threshold_pace_seconds_per_km" ? "/km" : "/100m";
    return (
      <Controller
        control={control}
        name="value"
        render={({ field, fieldState }) => (
          <PaceSecondsField
            error={fieldState.error?.message}
            formControl={control}
            helperText={
              metricType === "threshold_pace_seconds_per_km"
                ? "Enter pace between 2:00 and 20:00."
                : "Enter pace between 0:45 and 10:00."
            }
            id="profile-metric-value"
            label={descriptor.label}
            onBlur={field.onBlur}
            onChangeSeconds={field.onChange}
            required
            testId="profile-metric-value"
            unitLabel={unitLabel}
            valueSeconds={typeof field.value === "number" ? field.value : null}
          />
        )}
      />
    );
  }

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
  const { id, metricType, recordedAt, value } = useLocalSearchParams<{
    id?: string;
    metricType?: string;
    recordedAt?: string;
    value?: string;
  }>();
  const isEditMode = Boolean(id);
  const overrideMetricTypeResult = profileMetricTypeSchema.safeParse(metricType);
  const initialMetricType = overrideMetricTypeResult.success
    ? isActivityDerivedThresholdMetricType(overrideMetricTypeResult.data)
      ? "weight_kg"
      : overrideMetricTypeResult.data
    : "weight_kg";
  const initialValue = Number(value);
  const router = useRouter();
  const { user } = useAuth();
  const utils = api.useUtils();

  const { data: metric, isLoading } = api.profileMetrics.getById.useQuery(id ? { id } : skipToken);
  const createMutation = api.profileMetrics.create.useMutation();
  const updateMutation = api.profileMetrics.update.useMutation();

  const form = useZodForm({
    schema: profileMetricEditSchema,
    defaultValues: {
      metric_type: initialMetricType,
      value: Number.isFinite(initialValue)
        ? initialValue
        : getProfileMetricDefinition(initialMetricType).defaultValue,
      recorded_at: toDateTimeInputValue(recordedAt ?? null),
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

  if (metric && isActivityDerivedThresholdMetricType(metric.metric_type as ProfileMetricType)) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
        <Stack.Screen options={{ title: "Calculated threshold" }} />
        <Text className="text-center text-lg font-semibold text-foreground">
          Read-only threshold
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          This value is calculated from trusted recorded activity evidence and cannot be edited.
        </Text>
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
            {isEditMode ? (
              <View className="gap-1">
                <Text className="text-sm font-medium text-foreground">Metric</Text>
                <Text className="text-base text-foreground" testID="profile-metric-type-static">
                  {getProfileMetricDefinition(selectedMetricType).label}
                </Text>
              </View>
            ) : (
              <Controller
                control={form.control}
                name="metric_type"
                render={({ field }) => (
                  <View className="gap-2">
                    <Label nativeID="profile-metric-type-label">
                      <Text className="text-sm font-medium text-foreground">Metric</Text>
                    </Label>
                    <Select
                      value={{
                        label: getProfileMetricDefinition(field.value).label,
                        value: field.value,
                      }}
                      onValueChange={(option) => {
                        if (option?.value && option.value !== field.value) {
                          field.onChange(option.value as ProfileMetricType);
                        }
                      }}
                    >
                      <SelectTrigger
                        accessibilityHint="Opens metric options grouped by category"
                        accessibilityLabel="Metric"
                        disabled={isSaving}
                        testId="profile-metric-type-trigger"
                      >
                        <SelectValue placeholder="Select a metric" />
                      </SelectTrigger>
                      <SelectContent>
                        <NativeSelectScrollView>
                          {profileMetricSections.map((section) => (
                            <SelectGroup key={section.id}>
                              <SelectLabel>{section.title}</SelectLabel>
                              {section.metricTypes
                                .filter(
                                  (metricType) => !isActivityDerivedThresholdMetricType(metricType),
                                )
                                .map((metricType) => {
                                  const definition = getProfileMetricDefinition(metricType);
                                  return (
                                    <SelectItem
                                      key={metricType}
                                      label={definition.label}
                                      testID={`profile-metric-type-${metricType}`}
                                      value={metricType}
                                    >
                                      {definition.label}
                                    </SelectItem>
                                  );
                                })}
                            </SelectGroup>
                          ))}
                        </NativeSelectScrollView>
                      </SelectContent>
                    </Select>
                    <Text className="text-xs text-muted-foreground">
                      Choose the measurement you want to record.
                    </Text>
                  </View>
                )}
              />
            )}
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
