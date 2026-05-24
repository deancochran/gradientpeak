import type {
  AthleteTrainingSettings,
  AthleteTrainingSettingsFormInput,
} from "@repo/core/schemas/settings/profile_settings";
import {
  athleteTrainingSettingsFormSchema,
  defaultAthletePreferenceProfile,
  getManualBaselineCtlWarning,
  toAthleteTrainingSettingsFormValues,
} from "@repo/core/schemas/settings/profile_settings";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormDateInputField,
  FormIntegerStepperField,
  FormPercentSliderField,
  FormSwitchField,
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Stack } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { TrainingPreferencesProjectionPreview } from "@/components/settings/TrainingPreferencesProjectionPreview";
import { api } from "@/lib/api";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

type PreferencesTabKey =
  | "preferences"
  | "schedule"
  | "training-style"
  | "recovery"
  | "goal-strategy"
  | "baseline-fitness";

type TrainingPreferencesValues = AthleteTrainingSettings | AthleteTrainingSettingsFormInput;

type PreferencePresetKey = "custom" | "conservative" | "balanced" | "performance";

const preferenceTabs: Array<{ key: PreferencesTabKey; label: string }> = [
  { key: "preferences", label: "Preferences" },
  { key: "schedule", label: "Schedule" },
  { key: "training-style", label: "Training style" },
  { key: "recovery", label: "Recovery" },
  { key: "goal-strategy", label: "Goal strategy" },
  { key: "baseline-fitness", label: "Baseline fitness" },
];

const preferencePresets: Array<{
  key: Exclude<PreferencePresetKey, "custom">;
  label: string;
  description: string;
  values: Pick<
    AthleteTrainingSettingsFormInput["training_style"],
    "progression_pace" | "week_pattern_preference"
  > &
    Pick<
      AthleteTrainingSettingsFormInput["recovery_preferences"],
      "recovery_priority" | "systemic_fatigue_tolerance"
    > &
    Pick<
      AthleteTrainingSettingsFormInput["goal_strategy_preferences"],
      "target_surplus_preference"
    >;
}> = [
  {
    key: "conservative",
    label: "Safer",
    description: "Protect recovery and keep progression steady.",
    values: {
      progression_pace: 0.35,
      week_pattern_preference: 0.35,
      recovery_priority: 0.75,
      systemic_fatigue_tolerance: 0.35,
      target_surplus_preference: 0.15,
    },
  },
  {
    key: "balanced",
    label: "Balanced",
    description: "Use the default tradeoff between progress and recovery.",
    values: {
      progression_pace: 0.5,
      week_pattern_preference: 0.5,
      recovery_priority: 0.6,
      systemic_fatigue_tolerance: 0.5,
      target_surplus_preference: 0.25,
    },
  },
  {
    key: "performance",
    label: "Push harder",
    description: "Allow faster progression when the projection stays safe.",
    values: {
      progression_pace: 0.72,
      week_pattern_preference: 0.65,
      recovery_priority: 0.45,
      systemic_fatigue_tolerance: 0.68,
      target_surplus_preference: 0.45,
    },
  },
];

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

function getPreferenceDirectionSummary(draft: AthleteTrainingSettingsFormInput) {
  const progression = draft.training_style.progression_pace;
  const recovery = draft.recovery_preferences.recovery_priority;
  const surplus = draft.goal_strategy_preferences.target_surplus_preference;

  if (recovery >= 0.7 && progression <= 0.45) {
    return "Safer progression";
  }

  if (progression >= 0.65 || surplus >= 0.4) {
    return "Performance leaning";
  }

  return "Balanced setup";
}

function getSelectedPreferencePreset(draft: AthleteTrainingSettingsFormInput): PreferencePresetKey {
  const matchedPreset = preferencePresets.find((preset) => {
    return (
      draft.training_style.progression_pace === preset.values.progression_pace &&
      draft.training_style.week_pattern_preference === preset.values.week_pattern_preference &&
      draft.recovery_preferences.recovery_priority === preset.values.recovery_priority &&
      draft.recovery_preferences.systemic_fatigue_tolerance ===
        preset.values.systemic_fatigue_tolerance &&
      draft.goal_strategy_preferences.target_surplus_preference ===
        preset.values.target_surplus_preference
    );
  });

  return matchedPreset?.key ?? "custom";
}

export default function TrainingPreferencesScreen() {
  const utils = api.useUtils();
  const settingsQuery = useProfileSettings();
  const activePlanQuery = api.trainingPlans.getActivePlan.useQuery(undefined);
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("preferences");
  const [showAdvancedBaselineControls, setShowAdvancedBaselineControls] = useState(false);

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
  const deferredDraft = useDeferredValue(draft);

  const upsertMutation = api.profileSettings.upsert.useMutation();
  const submitForm = useZodFormSubmit<AthleteTrainingSettings>({
    form,
    shouldRethrow: false,
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
        utils.trainingPlans.invalidate(),
        settingsQuery.refetch(),
      ]);
      form.reset(createTrainingPreferencesFormDefaults(settings));
    },
    onError: (error) =>
      handleSubmitFormError(form, error, { alertTitle: "Failed to save preferences" }),
  });

  const hasUnsavedChanges = form.formState.isDirty;
  const isSaving = submitForm.isSubmitting || upsertMutation.isPending;

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
      issues.push("Weekly time budget must be at least as long as your longest activity.");
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
          ? "A single activity cannot be longer than the full weekly time budget."
          : undefined,
      maxWeeklyDurationError:
        typeof maxSingleSessionDuration === "number" &&
        typeof maxWeeklyDuration === "number" &&
        maxSingleSessionDuration > maxWeeklyDuration
          ? "Increase this budget or shorten the longest activity."
          : undefined,
    };
  }, [draft]);

  const saveDisabled =
    !settingsQuery.profileId ||
    !hasUnsavedChanges ||
    scheduleValidation.issues.length > 0 ||
    isSaving;
  const saveButtonState = submitForm.getSubmitButtonState({
    disabled: saveDisabled,
    label: "Save",
    submittingLabel: "Saving...",
  });

  const preferenceDirectionSummary = useMemo(() => getPreferenceDirectionSummary(draft), [draft]);
  const selectedPreferencePreset = useMemo(() => getSelectedPreferencePreset(draft), [draft]);
  const manualBaselineCtlWarning = draft.baseline_fitness?.is_enabled
    ? getManualBaselineCtlWarning(draft.baseline_fitness.override_ctl)
    : null;

  const applyPreferencePreset = useCallback(
    (presetKey: Exclude<PreferencePresetKey, "custom">) => {
      const preset = preferencePresets.find((item) => item.key === presetKey);
      if (!preset) {
        return;
      }

      form.setValue("training_style.progression_pace", preset.values.progression_pace, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue(
        "training_style.week_pattern_preference",
        preset.values.week_pattern_preference,
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
      form.setValue("recovery_preferences.recovery_priority", preset.values.recovery_priority, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue(
        "recovery_preferences.systemic_fatigue_tolerance",
        preset.values.systemic_fatigue_tolerance,
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
      form.setValue(
        "goal_strategy_preferences.target_surplus_preference",
        preset.values.target_surplus_preference,
        {
          shouldDirty: true,
          shouldValidate: true,
        },
      );
    },
    [form],
  );

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
      <Stack.Screen
        options={{
          headerRight: () => (
            <View className="flex-row items-center gap-1">
              <Button
                disabled={!hasUnsavedChanges || isSaving}
                onPress={() => form.reset(formDefaults)}
                size="sm"
                variant="ghost"
              >
                <Text className="text-sm font-semibold text-muted-foreground">Reset</Text>
              </Button>
              <LoadingButton
                disabled={saveButtonState.disabled}
                loading={isSaving || saveButtonState.loading}
                loadingLabel={saveButtonState.loadingLabel}
                loadingTextClassName="text-primary"
                onPress={submitForm.handleSubmit}
                size="sm"
                variant="ghost"
                testID="training-preferences-save-button"
              >
                <Text className="text-sm font-semibold text-primary">{saveButtonState.label}</Text>
              </LoadingButton>
            </View>
          ),
        }}
      />
      <Form {...form}>
        <ScrollView className="flex-1" contentContainerClassName="p-3 gap-3">
          <TrainingPreferencesProjectionPreview
            draft={deferredDraft}
            planId={activePlanQuery.data?.id}
          />

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
                  className={`border-b-2 px-1.5 py-1.5 ${isActive ? "border-primary" : "border-transparent"}`}
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

          <View className="gap-3 rounded-xl border border-border bg-card p-3">
            {activeTab === "preferences" ? (
              <>
                <Text className="text-sm font-semibold text-foreground">
                  {preferenceDirectionSummary}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <View
                    className={`rounded-md border px-2 py-1.5 ${
                      selectedPreferencePreset === "custom"
                        ? "border-primary bg-primary"
                        : "border-border bg-muted/20"
                    }`}
                    testID="training-preferences-preset-custom"
                  >
                    <Text
                      className={`text-center text-xs font-semibold ${
                        selectedPreferencePreset === "custom"
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }`}
                    >
                      Custom
                    </Text>
                  </View>
                  {preferencePresets.map((preset) => {
                    const isSelected = selectedPreferencePreset === preset.key;
                    return (
                      <Pressable
                        key={preset.key}
                        onPress={() => applyPreferencePreset(preset.key)}
                        className={`rounded-md border px-2 py-1.5 ${
                          isSelected ? "border-primary bg-primary" : "border-border bg-muted/20"
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel={`Apply ${preset.label} training preference preset`}
                        testID={`training-preferences-preset-${preset.key}`}
                      >
                        <Text
                          className={`text-center text-xs font-semibold ${
                            isSelected ? "text-primary-foreground" : "text-foreground"
                          }`}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {activeTab === "schedule" ? (
              <>
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
                  label="Longest activity (minutes)"
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
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Progression pace"
                  max={100}
                  min={0}
                  name="training_style.progression_pace"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-progression-pace"
                  valueMode="fraction"
                />
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Week pattern"
                  max={100}
                  min={0}
                  name="training_style.week_pattern_preference"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-week-pattern"
                  valueMode="fraction"
                />
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Strength integration priority"
                  max={100}
                  min={0}
                  name="training_style.strength_integration_priority"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-strength-integration"
                  valueMode="fraction"
                />
              </>
            ) : null}

            {activeTab === "recovery" ? (
              <>
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Recovery priority"
                  max={100}
                  min={0}
                  name="recovery_preferences.recovery_priority"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-recovery-priority"
                  valueMode="fraction"
                />
                <FormIntegerStepperField
                  control={form.control}
                  label="Recovery days after a goal"
                  max={21}
                  min={0}
                  name="recovery_preferences.post_goal_recovery_days"
                  testId="preferences-recovery-days"
                />
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Systemic fatigue tolerance"
                  max={100}
                  min={0}
                  name="recovery_preferences.systemic_fatigue_tolerance"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-systemic-fatigue"
                  valueMode="fraction"
                />
              </>
            ) : null}

            {activeTab === "goal-strategy" ? (
              <>
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Target surplus preference"
                  max={100}
                  min={0}
                  name="goal_strategy_preferences.target_surplus_preference"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-target-surplus"
                  valueMode="fraction"
                />
                <FormPercentSliderField
                  control={form.control}
                  decimals={0}
                  label="Taper style"
                  max={100}
                  min={0}
                  name="goal_strategy_preferences.taper_style_preference"
                  showNumericInput={false}
                  step={1}
                  testId="preferences-taper-style"
                  valueMode="fraction"
                />
              </>
            ) : null}

            {activeTab === "baseline-fitness" ? (
              <>
                <FormSwitchField
                  control={form.control}
                  label="Enable Manual Baseline"
                  name="baseline_fitness.is_enabled"
                  switchLabel="Enable manual baseline"
                  testId="preferences-baseline-enabled"
                />
                {draft.baseline_fitness?.is_enabled ? (
                  <>
                    <FormIntegerStepperField
                      control={form.control}
                      label="CTL"
                      max={250}
                      min={0}
                      name="baseline_fitness.override_ctl"
                      testId="preferences-baseline-ctl"
                    />
                    {manualBaselineCtlWarning ? (
                      <View
                        className="rounded-2xl border border-border bg-muted/20 px-3 py-2"
                        testID="preferences-baseline-ctl-warning"
                      >
                        <Text className="text-xs leading-5 text-muted-foreground">
                          {manualBaselineCtlWarning}
                        </Text>
                      </View>
                    ) : null}
                    <FormIntegerStepperField
                      control={form.control}
                      label="ATL"
                      max={250}
                      min={0}
                      name="baseline_fitness.override_atl"
                      testId="preferences-baseline-atl"
                    />
                    <FormDateInputField
                      clearable
                      control={form.control}
                      label="Baseline date"
                      name="baseline_fitness.override_date"
                      pickerPresentation="modal"
                      testId="preferences-baseline-date"
                    />
                    <View className="mt-1 rounded-md border border-border bg-muted/20 px-3 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => setShowAdvancedBaselineControls((value) => !value)}
                        testID="preferences-toggle-advanced-ramp"
                      >
                        <Text>
                          {showAdvancedBaselineControls ? "Hide ramp controls" : "Fine tune ramps"}
                        </Text>
                      </Button>
                    </View>
                    {showAdvancedBaselineControls ? (
                      <>
                        <FormIntegerStepperField
                          control={form.control}
                          label="Max weekly TSS ramp %"
                          max={40}
                          min={1}
                          name="baseline_fitness.max_weekly_tss_ramp_pct"
                          testId="preferences-ramp-tss-pct"
                        />
                        <FormIntegerStepperField
                          control={form.control}
                          label="Max CTL ramp/week"
                          max={12}
                          min={1}
                          name="baseline_fitness.max_ctl_ramp_per_week"
                          testId="preferences-ramp-ctl"
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </ScrollView>
      </Form>
    </View>
  );
}
