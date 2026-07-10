import {
  type ActivityEffortCategory,
  type ActivityEffortType,
  activityEffortDefinitions,
  activityEffortToInputDescriptor,
  formatEffortDuration,
  getActivityEffortDefinition,
  getActivityEffortDefinitionsForCategory,
  getDefaultActivityEffortDefinition,
  paceSecondsFromSpeedMetersPerSecond,
  speedMetersPerSecondFromDistanceAndElapsedSeconds,
  speedMetersPerSecondFromPace,
} from "@repo/core/athlete-inputs";
import { parseHmsToSeconds, parseMmSsToSeconds } from "@repo/core/utils/fitness-inputs";
import { DurationInput } from "@repo/ui/components/duration-input";
import {
  Form,
  FormBoundedNumberField,
  FormNumberField,
  FormSegmentedSelectField,
} from "@repo/ui/components/form";
import { PaceInput } from "@repo/ui/components/pace-input";
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
  speed_entry_mode: z.enum(["direct", "pace", "distance_elapsed"]),
  distance_meters: z.number().positive().optional(),
  elapsed_duration: z.string(),
});

type FormValues = z.infer<typeof effortSchema>;

type ActivityEffortSubmission = Pick<
  FormValues,
  "activity_category" | "effort_type" | "duration_seconds" | "value" | "recorded_at"
>;

export function prepareActivityEffortSubmission(
  data: FormValues,
  pace: string,
): { effort?: ActivityEffortSubmission; error?: string } {
  const base = {
    activity_category: data.activity_category,
    effort_type: data.effort_type,
    duration_seconds: data.duration_seconds,
    value: data.value,
    recorded_at: data.recorded_at,
  };

  if (data.effort_type !== "speed" || data.speed_entry_mode === "direct") {
    return { effort: base };
  }

  if (data.speed_entry_mode === "pace") {
    const paceSeconds = parseMmSsToSeconds(pace);
    const speed =
      paceSeconds == null
        ? null
        : speedMetersPerSecondFromPace({ paceSeconds, distanceUnitMeters: 1000 });
    if (speed == null) return { error: "Enter a valid pace." };
    return { effort: { ...base, value: speed } };
  }

  const elapsedSeconds = parseHmsToSeconds(data.elapsed_duration);
  if (
    elapsedSeconds == null ||
    elapsedSeconds <= 0 ||
    data.distance_meters == null ||
    data.distance_meters <= 0
  ) {
    return { error: "Enter a valid distance and elapsed time." };
  }
  const speed = speedMetersPerSecondFromDistanceAndElapsedSeconds({
    distanceMeters: data.distance_meters,
    elapsedSeconds,
  });
  if (speed == null) return { error: "Enter a valid distance and elapsed time." };
  return { effort: { ...base, duration_seconds: elapsedSeconds, value: speed } };
}

const categoryOptions = Array.from(
  new Map(
    activityEffortDefinitions.map((definition) => [
      definition.activityCategory,
      definition.activityCategory,
    ]),
  ).values(),
).map((category) => ({
  label: category.charAt(0).toUpperCase() + category.slice(1),
  value: category,
}));

function formatPace(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const wholeSeconds = Math.round(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

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
      speed_entry_mode: "direct",
      distance_meters: 1000,
      elapsed_duration: "0:20:00",
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
  const previousDefinitionIdRef = React.useRef(effortDefinition.id);
  const speedEntryMode = form.watch("speed_entry_mode");
  const [pace, setPace] = React.useState(() =>
    formatPace(
      paceSecondsFromSpeedMetersPerSecond({ speedMetersPerSecond: 4, distanceUnitMeters: 1000 }),
    ),
  );

  React.useEffect(() => {
    if (effortDefinitions.some((definition) => definition.effortType === selectedEffortType))
      return;
    const nextDefinition =
      effortDefinitions[0] ?? getDefaultActivityEffortDefinition(selectedCategory);
    previousDefinitionIdRef.current = nextDefinition.id;
    form.setValue("effort_type", nextDefinition.effortType, { shouldValidate: true });
    form.setValue("duration_seconds", nextDefinition.defaultDurationSeconds, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("value", nextDefinition.defaultValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [effortDefinitions, form, selectedCategory, selectedEffortType]);

  React.useEffect(() => {
    if (previousDefinitionIdRef.current === effortDefinition.id) return;
    previousDefinitionIdRef.current = effortDefinition.id;
    form.setValue("duration_seconds", effortDefinition.defaultDurationSeconds, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("value", effortDefinition.defaultValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [effortDefinition, form]);

  React.useEffect(() => {
    if (selectedEffortType !== "speed" || speedEntryMode !== "pace") return;
    setPace(
      formatPace(
        paceSecondsFromSpeedMetersPerSecond({
          speedMetersPerSecond: form.getValues("value"),
          distanceUnitMeters: 1000,
        }),
      ),
    );
  }, [form, selectedEffortType, speedEntryMode]);

  const createMutation = api.activityEfforts.create.useMutation();
  const submitForm = useZodFormSubmit<FormValues>({
    form,
    shouldRethrow: false,
    onSubmit: async (data) => {
      const submission = prepareActivityEffortSubmission(data, pace);
      if (!submission.effort) {
        form.setError("root", { message: submission.error ?? "Fix the effort inputs." });
        return;
      }
      await createMutation.mutateAsync(submission.effort);
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
              options={categoryOptions}
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

            {!(selectedEffortType === "speed" && speedEntryMode === "distance_elapsed") ? (
              <FormSegmentedSelectField
                control={form.control}
                disabled={isSubmitting}
                label="Duration"
                name="duration_seconds"
                options={effortDefinition.durationPresets.map((duration) => ({
                  label: formatEffortDuration(duration),
                  value: String(duration),
                }))}
                parseValue={(value) => Number(value)}
                testId="duration-preset-segments"
              />
            ) : null}

            {selectedEffortType === "speed" ? (
              <>
                <FormSegmentedSelectField
                  control={form.control}
                  disabled={isSubmitting}
                  label="Speed entry"
                  name="speed_entry_mode"
                  options={[
                    { label: "Speed", value: "direct" },
                    { label: "Pace", value: "pace" },
                    { label: "Distance + time", value: "distance_elapsed" },
                  ]}
                  testId="speed-entry-mode-segments"
                />

                {speedEntryMode === "direct" ? (
                  <FormBoundedNumberField
                    control={form.control}
                    disabled={isSubmitting}
                    decimals={valueDescriptor.decimals}
                    description="Enter speed in meters per second."
                    label="Speed"
                    max={valueDescriptor.max}
                    min={valueDescriptor.min}
                    name="value"
                    placeholder="4.5"
                    testId="effort-value-input"
                    unitLabel="m/s"
                  />
                ) : null}

                {speedEntryMode === "pace" ? (
                  <View pointerEvents={isSubmitting ? "none" : "auto"}>
                    <PaceInput
                      id="effort-pace-input"
                      label="Pace"
                      onChange={setPace}
                      onPaceSecondsChange={() => undefined}
                      value={pace}
                    />
                  </View>
                ) : null}

                {speedEntryMode === "distance_elapsed" ? (
                  <View className="gap-4">
                    <FormNumberField
                      control={form.control}
                      disabled={isSubmitting}
                      label="Distance (meters)"
                      min={1}
                      name="distance_meters"
                      placeholder="1000"
                      testId="effort-distance-input"
                    />
                    <View pointerEvents={isSubmitting ? "none" : "auto"}>
                      <DurationInput
                        id="effort-elapsed-duration-input"
                        label="Elapsed time"
                        onChange={(value) =>
                          form.setValue("elapsed_duration", value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        onDurationSecondsChange={() => undefined}
                        value={form.watch("elapsed_duration")}
                      />
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <FormBoundedNumberField
                control={form.control}
                disabled={isSubmitting}
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
            )}
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
