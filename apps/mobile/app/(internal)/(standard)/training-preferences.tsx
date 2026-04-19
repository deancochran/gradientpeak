import type {
  AthleteTrainingSettings,
  AthleteTrainingSettingsFormInput,
} from "@repo/core/schemas/settings/profile_settings";
import {
  athleteTrainingSettingsFormSchema,
  defaultAthletePreferenceProfile,
  toAthleteTrainingSettingsFormValues,
} from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormDateInputField,
  FormDescription,
  FormField,
  FormIntegerStepperField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSwitchField,
} from "@repo/ui/components/form";
import { PercentSliderInput } from "@repo/ui/components/percent-slider-input";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import React, { useEffect, useMemo, useState } from "react";
import {
  type Control,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
  useWatch,
} from "react-hook-form";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { TrainingPreferencesProjectionPreview } from "@/components/settings/TrainingPreferencesProjectionPreview";
import { api } from "@/lib/api";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";

type PreferencesTabKey =
  | "schedule"
  | "training-style"
  | "recovery"
  | "goal-strategy"
  | "baseline-fitness";

type TrainingPreferencesValues = AthleteTrainingSettings | AthleteTrainingSettingsFormInput;

const preferenceTabs: Array<{ key: PreferencesTabKey; label: string }> = [
  { key: "schedule", label: "Schedule" },
  { key: "training-style", label: "Training style" },
  { key: "recovery", label: "Recovery" },
  { key: "goal-strategy", label: "Goal strategy" },
  { key: "baseline-fitness", label: "Baseline fitness" },
];

function toFractionFromPercent(value: number, decimals = 2) {
  return Number((value / 100).toFixed(decimals));
}

function formatMinutes(minutes?: number) {
  if (!minutes || minutes <= 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainder} min`;
}

function createTrainingPreferencesFormDefaults(
  settings: AthleteTrainingSettings,
): AthleteTrainingSettingsFormInput {
  const normalized = toAthleteTrainingSettingsFormValues(settings);

  return {
    ...normalized,
    baseline_fitness: normalized.baseline_fitness ?? {
      ...defaultAthletePreferenceProfile.baseline_fitness,
    },
  };
}

type PercentSliderFormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  decimals?: number;
  description?: string;
  fallbackValue?: number;
  id: string;
  label: string;
  name: TName;
};

function PercentSliderFormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  decimals = 0,
  description,
  fallbackValue = 0.5,
  id,
  label,
  name,
}: PercentSliderFormFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <PercentSliderInput
              decimals={decimals}
              error={fieldState.error?.message}
              helperText={description}
              id={id}
              label={label}
              max={100}
              min={0}
              onChange={(value) => {
                field.onChange(toFractionFromPercent(value) as FieldPathValue<TFieldValues, TName>);
              }}
              step={1}
              value={(typeof field.value === "number" ? field.value : fallbackValue) * 100}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default function TrainingPreferencesScreen() {
  const utils = api.useUtils();
  const settingsQuery = useProfileSettings();
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("schedule");

  const formDefaults = useMemo(
    () => createTrainingPreferencesFormDefaults(settingsQuery.settings),
    [settingsQuery.settings],
  );

  const form = useZodForm({
    schema: athleteTrainingSettingsFormSchema,
    defaultValues: formDefaults,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    form.reset(formDefaults);
  }, [form, formDefaults]);

  const draft = (useWatch({ control: form.control }) ??
    form.getValues()) as AthleteTrainingSettingsFormInput;

  const upsertMutation = api.profileSettings.upsert.useMutation();
  const submitForm = useZodFormSubmit<AthleteTrainingSettings>({
    form,
    onSubmit: async (settings) => {
      if (!settingsQuery.profileId) {
        return;
      }

      await upsertMutation.mutateAsync({
        profile_id: settingsQuery.profileId,
        settings,
      });

      await Promise.all([
        utils.profileSettings.getForProfile.invalidate(),
        settingsQuery.refetch(),
      ]);
      form.reset(createTrainingPreferencesFormDefaults(settings));
    },
  });

  const hasUnsavedChanges = form.formState.isDirty;

  const scheduleValidation = useMemo(() => {
    const minSessions = draft.dose_limits.min_sessions_per_week ?? 0;
    const maxSessions = draft.dose_limits.max_sessions_per_week ?? 0;
    const maxSingleSessionDuration = draft.dose_limits.max_single_session_duration_minutes;
    const maxWeeklyDuration = draft.dose_limits.max_weekly_duration_minutes;

    const issues: string[] = [];

    if (minSessions > maxSessions) {
      issues.push("Fewest sessions per week cannot be higher than most sessions per week.");
    }

    if (
      typeof maxSingleSessionDuration === "number" &&
      typeof maxWeeklyDuration === "number" &&
      maxSingleSessionDuration > maxWeeklyDuration
    ) {
      issues.push("Weekly time budget must be at least as long as your longest workout.");
    }

    return {
      issues,
      minSessionsError:
        minSessions > maxSessions
          ? "Choose a floor that stays at or below your weekly maximum."
          : undefined,
      maxSessionsError:
        minSessions > maxSessions
          ? "Raise this above the weekly minimum or lower the minimum."
          : undefined,
      maxSingleSessionError:
        typeof maxSingleSessionDuration === "number" &&
        typeof maxWeeklyDuration === "number" &&
        maxSingleSessionDuration > maxWeeklyDuration
          ? "A single workout cannot be longer than the full weekly time budget."
          : undefined,
      maxWeeklyDurationError:
        typeof maxSingleSessionDuration === "number" &&
        typeof maxWeeklyDuration === "number" &&
        maxSingleSessionDuration > maxWeeklyDuration
          ? "Increase this budget or shorten the longest workout."
          : undefined,
    };
  }, [draft]);

  const scheduleSnapshot = useMemo(() => {
    const minSessions = draft.dose_limits.min_sessions_per_week ?? 0;
    const maxSessions = draft.dose_limits.max_sessions_per_week ?? 0;
    const weeklyBudget = formatMinutes(draft.dose_limits.max_weekly_duration_minutes);
    const longestWorkout = formatMinutes(draft.dose_limits.max_single_session_duration_minutes);

    return `${minSessions}-${maxSessions} sessions per week, ${weeklyBudget ?? "no weekly cap"}, longest workout ${longestWorkout ?? "not set"}.`;
  }, [draft.dose_limits]);

  if (settingsQuery.isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="training-preferences-loading"
      >
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-sm text-muted-foreground">Loading preferences...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="training-preferences-screen">
      <Form {...form}>
        <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
          <TrainingPreferencesProjectionPreview draft={draft} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 pr-2"
            accessibilityRole="tablist"
            accessibilityLabel="Training preference groups"
          >
            {preferenceTabs.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  testID={`training-preferences-tab-${tab.key}`}
                  className={`border-b-2 px-1.5 py-2 ${isActive ? "border-primary" : "border-transparent"}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    className={`text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Card>
            <CardContent className="gap-5">
              {activeTab === "schedule" ? (
                <>
                  <Text className="text-xs text-muted-foreground">
                    Set the weekly training floor, ceiling, and time budget the planner should
                    respect. Planner-only tuning stays out of this profile view.
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Current draft: {scheduleSnapshot}
                  </Text>
                  {scheduleValidation.issues.length > 0 ? (
                    <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                      <Text className="text-sm font-medium text-destructive">
                        Fix these schedule conflicts before saving.
                      </Text>
                      <Text className="mt-1 text-xs text-destructive">
                        {scheduleValidation.issues.join(" ")}
                      </Text>
                    </View>
                  ) : null}
                  <FormIntegerStepperField
                    control={form.control}
                    description="Set the lowest weekly frequency that still feels sustainable."
                    label="Fewest sessions per week"
                    max={14}
                    min={0}
                    name="dose_limits.min_sessions_per_week"
                    testId="preferences-min-sessions"
                  />
                  {scheduleValidation.minSessionsError ? (
                    <Text className="-mt-3 text-sm font-medium text-destructive">
                      {scheduleValidation.minSessionsError}
                    </Text>
                  ) : null}
                  <FormIntegerStepperField
                    control={form.control}
                    description="Set the upper limit the planner should never exceed."
                    label="Most sessions per week"
                    max={21}
                    min={0}
                    name="dose_limits.max_sessions_per_week"
                    testId="preferences-max-sessions"
                  />
                  {scheduleValidation.maxSessionsError ? (
                    <Text className="-mt-3 text-sm font-medium text-destructive">
                      {scheduleValidation.maxSessionsError}
                    </Text>
                  ) : null}
                  <FormIntegerStepperField
                    control={form.control}
                    description="Use the longest workout you can realistically absorb in one day."
                    label="Longest workout (minutes)"
                    max={600}
                    min={20}
                    name="dose_limits.max_single_session_duration_minutes"
                    testId="preferences-max-duration"
                  />
                  {scheduleValidation.maxSingleSessionError ? (
                    <Text className="-mt-3 text-sm font-medium text-destructive">
                      {scheduleValidation.maxSingleSessionError}
                    </Text>
                  ) : null}
                  <FormIntegerStepperField
                    control={form.control}
                    description="This should cover the whole week, including your longest workout."
                    label="Weekly time budget (minutes)"
                    max={10080}
                    min={30}
                    name="dose_limits.max_weekly_duration_minutes"
                    testId="preferences-max-weekly-duration"
                  />
                  {scheduleValidation.maxWeeklyDurationError ? (
                    <Text className="-mt-3 text-sm font-medium text-destructive">
                      {scheduleValidation.maxWeeklyDurationError}
                    </Text>
                  ) : null}
                </>
              ) : null}

              {activeTab === "training-style" ? (
                <>
                  <Text className="text-xs text-muted-foreground">
                    Training style is about progression and week feel, not bounded upside beyond the
                    goal target.
                  </Text>
                  <PercentSliderFormField
                    control={form.control}
                    description="Higher builds load faster from week to week."
                    id="preferences-progression-pace"
                    label="Progression pace"
                    name="training_style.progression_pace"
                  />
                  <PercentSliderFormField
                    control={form.control}
                    description="Lower stays steadier. Higher varies week shape more."
                    id="preferences-week-pattern"
                    label="Week pattern"
                    name="training_style.week_pattern_preference"
                  />
                  <PercentSliderFormField
                    control={form.control}
                    description="Higher gives strength work more weight when the planner balances endurance and supporting work."
                    fallbackValue={0.5}
                    id="preferences-strength-integration"
                    label="Strength integration priority"
                    name="training_style.strength_integration_priority"
                  />
                </>
              ) : null}

              {activeTab === "recovery" ? (
                <>
                  <PercentSliderFormField
                    control={form.control}
                    description="Higher protects easy days and recovery space more strongly."
                    id="preferences-recovery-priority"
                    label="Recovery priority"
                    name="recovery_preferences.recovery_priority"
                  />
                  <FormIntegerStepperField
                    control={form.control}
                    label="Recovery days after a goal"
                    max={21}
                    min={0}
                    name="recovery_preferences.post_goal_recovery_days"
                    testId="preferences-recovery-days"
                  />
                  <PercentSliderFormField
                    control={form.control}
                    description="Higher allows the planner to tolerate more systemic fatigue before reducing load progression."
                    fallbackValue={0.5}
                    id="preferences-systemic-fatigue"
                    label="Systemic fatigue tolerance"
                    name="recovery_preferences.systemic_fatigue_tolerance"
                  />
                </>
              ) : null}

              {activeTab === "goal-strategy" ? (
                <>
                  <Text className="text-xs text-muted-foreground">
                    Goal strategy changes how closely the planner hugs the stated target versus
                    aiming for bounded upside when confidence supports it. This stays separate from
                    progression pace and schedule limits.
                  </Text>
                  <PercentSliderFormField
                    control={form.control}
                    description="Higher asks the system to plan for a little more than the stated target when it is safe and well supported."
                    id="preferences-target-surplus"
                    label="Target surplus preference"
                    name="goal_strategy_preferences.target_surplus_preference"
                  />
                  <PercentSliderFormField
                    control={form.control}
                    description="Higher extends taper windows when the event and sport support it. Lower keeps the lead-in sharper and shorter."
                    fallbackValue={0.5}
                    id="preferences-taper-style"
                    label="Taper style"
                    name="goal_strategy_preferences.taper_style_preference"
                  />
                </>
              ) : null}

              {activeTab === "baseline-fitness" ? (
                <>
                  <Text className="text-xs text-muted-foreground">
                    Override your baseline fitness to unlock higher volume training plans without
                    historical data. This tells the system your current CTL (fitness) and ATL
                    (fatigue) so it doesn't cap your plan due to low historical load.
                  </Text>
                  <FormSwitchField
                    control={form.control}
                    description="Use override values instead of calculated from history"
                    label="Enable Manual Baseline"
                    name="baseline_fitness.is_enabled"
                    switchLabel="Enable manual baseline"
                    testId="preferences-baseline-enabled"
                  />
                  {draft.baseline_fitness?.is_enabled ? (
                    <>
                      <FormIntegerStepperField
                        control={form.control}
                        description="Your current fitness level (42-day average TSS)"
                        label="CTL (Chronic Training Load)"
                        max={250}
                        min={0}
                        name="baseline_fitness.override_ctl"
                        testId="preferences-baseline-ctl"
                      />
                      <FormIntegerStepperField
                        control={form.control}
                        description="Your current fatigue level (7-day average TSS)"
                        label="ATL (Acute Training Load)"
                        max={250}
                        min={0}
                        name="baseline_fitness.override_atl"
                        testId="preferences-baseline-atl"
                      />
                      <FormDateInputField
                        clearable
                        control={form.control}
                        description="When these values were valid (defaults to today)"
                        label="Baseline Date"
                        name="baseline_fitness.override_date"
                        pickerPresentation="modal"
                        testId="preferences-baseline-date"
                      />
                      <View className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                        <Text className="text-sm font-medium text-warning">
                          Advanced: Ramp Rate Settings
                        </Text>
                        <Text className="mt-1 text-xs text-muted-foreground">
                          Override the default weekly ramp caps. Higher values allow faster training
                          load progression but increase injury risk.
                        </Text>
                      </View>
                      <FormIntegerStepperField
                        control={form.control}
                        description="Maximum weekly TSS increase (default: 10%)"
                        label="Max Weekly TSS Ramp %"
                        max={40}
                        min={1}
                        name="baseline_fitness.max_weekly_tss_ramp_pct"
                        testId="preferences-ramp-tss-pct"
                      />
                      <FormIntegerStepperField
                        control={form.control}
                        description="Maximum CTL increase per week (default: 5)"
                        label="Max CTL Ramp Per Week"
                        max={12}
                        min={1}
                        name="baseline_fitness.max_ctl_ramp_per_week"
                        testId="preferences-ramp-ctl"
                      />
                      <View className="mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2">
                        <Text className="text-sm font-medium text-info">
                          Why Adjust Ramp Rates?
                        </Text>
                        <Text className="mt-1 text-xs text-muted-foreground">
                          If your plan's readiness score feels too low, it may be because the goal
                          requires more training load than the default ramp caps allow. Try
                          increasing the Max Weekly TSS Ramp % or Max CTL Ramp Per Week above to see
                          if that unlocks a higher readiness. Higher values allow faster progression
                          but increase injury risk.
                        </Text>
                      </View>
                      <View className="mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2">
                        <Text className="text-sm font-medium text-info">Example CTL Values</Text>
                        <Text className="mt-1 text-xs text-muted-foreground">
                          Recreatonal: 30-50 | Intermediate: 50-80 | Advanced: 80-120 | Elite: 120+
                        </Text>
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        </ScrollView>
      </Form>

      <View className="border-t border-border bg-background px-4 py-4">
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => form.reset(formDefaults)}
            disabled={!hasUnsavedChanges || submitForm.isSubmitting || upsertMutation.isPending}
          >
            <Text>Reset</Text>
          </Button>
          <Button
            className="flex-1"
            onPress={submitForm.handleSubmit}
            disabled={
              !settingsQuery.profileId ||
              !hasUnsavedChanges ||
              scheduleValidation.issues.length > 0 ||
              submitForm.isSubmitting ||
              upsertMutation.isPending
            }
            testID="training-preferences-save-button"
          >
            <Text className="text-primary-foreground">
              {submitForm.isSubmitting || upsertMutation.isPending
                ? "Saving..."
                : "Save Preferences"}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
