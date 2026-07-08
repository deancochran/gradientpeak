import { validateTrainingDoseLimitsConsistency } from "@repo/core";
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
import { Form } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { ActivityIndicator, View } from "react-native";
import { TrainingPreferencesProjectionPreview } from "@/components/settings/TrainingPreferencesProjectionPreview";
import {
  AvailabilitySection,
  type WeekdayKey,
} from "@/components/settings/training-preferences/sections/AvailabilitySection";
import { BaselineFitnessSection } from "@/components/settings/training-preferences/sections/BaselineFitnessSection";
import { GoalStrategySection } from "@/components/settings/training-preferences/sections/GoalStrategySection";
import {
  type PreferencePresetKey,
  PreferencesOverviewSection,
} from "@/components/settings/training-preferences/sections/PreferencesOverviewSection";
import { RecoverySection } from "@/components/settings/training-preferences/sections/RecoverySection";
import {
  ScheduleSection,
  type SportOverrideKey,
} from "@/components/settings/training-preferences/sections/ScheduleSection";
import { TrainingStyleSection } from "@/components/settings/training-preferences/sections/TrainingStyleSection";
import { TrainingPreferencesBottomSheet } from "@/components/settings/training-preferences/TrainingPreferencesBottomSheet";
import { TrainingPreferencesContent } from "@/components/settings/training-preferences/TrainingPreferencesContent";
import {
  type PreferencesTabKey,
  TrainingPreferencesTabs,
} from "@/components/settings/training-preferences/TrainingPreferencesTabs";
import { api } from "@/lib/api";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

type TrainingPreferencesValues = AthleteTrainingSettings | AthleteTrainingSettingsFormInput;

const defaultAvailabilityWindow = {
  start_minute_of_day: 360,
  end_minute_of_day: 540,
};

const defaultSportDoseOverride = {
  min_sessions_per_week: 0,
  max_sessions_per_week: 3,
  max_single_session_duration_minutes: 120,
  max_weekly_duration_minutes: 240,
};

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

type TrainingPreferencesEditorProps = {
  mode?: "global" | "plan-local";
  onClose?: () => void;
  showLauncher?: boolean;
  visible?: boolean;
};

const planLocalVisibleTabs: PreferencesTabKey[] = ["schedule"];

export function TrainingPreferencesEditor({
  mode = "global",
  onClose,
  showLauncher = true,
  visible,
}: TrainingPreferencesEditorProps = {}) {
  const utils = api.useUtils();
  const settingsQuery = useProfileSettings();
  const activePlanQuery = api.trainingPlans.getActivePlan.useQuery(undefined);
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("preferences");
  const [isSheetVisible, setIsSheetVisible] = useState(true);
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

  useEffect(() => {
    if (mode === "plan-local" && !planLocalVisibleTabs.includes(activeTab)) {
      setActiveTab("schedule");
    }
  }, [activeTab, mode]);

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
    const validationIssues = validateTrainingDoseLimitsConsistency(draft.dose_limits);
    const issueMessages = validationIssues.map((issue) => issue.message);
    const hasIssue = (code: (typeof validationIssues)[number]["code"]) =>
      validationIssues.some((issue) => issue.code === code);
    const hasSessionRangeIssue = hasIssue("min_sessions_exceeds_max_sessions");
    const hasWeeklyBudgetIssue = hasIssue("single_session_exceeds_weekly_budget");

    return {
      issues: issueMessages,
      minSessionsError: hasSessionRangeIssue
        ? "Choose a floor that stays at or below your weekly maximum."
        : undefined,
      maxSessionsError: hasSessionRangeIssue
        ? "Raise this above the weekly minimum or lower the minimum."
        : undefined,
      maxSingleSessionError: hasWeeklyBudgetIssue
        ? "A single activity cannot be longer than the full weekly time budget."
        : undefined,
      maxWeeklyDurationError: hasWeeklyBudgetIssue
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
  const resolvedSheetVisible = visible ?? isSheetVisible;
  const sheetTitle = mode === "plan-local" ? "Plan preferences" : "Training preferences";
  const sheetDescription =
    mode === "plan-local"
      ? "Tune plan-local overrides for this training plan. Reset restores the values from when this sheet opened."
      : "Tune how GradientPeak plans your training. Reset restores the values from when this sheet opened.";
  const visibleTabs = mode === "plan-local" ? planLocalVisibleTabs : undefined;
  const closeSheet = useCallback(() => {
    if (visible === undefined) {
      setIsSheetVisible(false);
    }
    onClose?.();
  }, [onClose, visible]);

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
  const toggleHardRestDay = useCallback(
    (day: WeekdayKey) => {
      const currentDays = new Set(form.getValues("availability.hard_rest_days") ?? []);
      if (currentDays.has(day)) {
        currentDays.delete(day);
      } else {
        currentDays.add(day);
      }
      form.setValue("availability.hard_rest_days", Array.from(currentDays), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [form],
  );
  const toggleAvailabilityDay = useCallback(
    (day: WeekdayKey) => {
      const currentWindows = form.getValues("availability.weekly_windows") ?? [];
      const existingIndex = currentWindows.findIndex((item) => item.day === day);
      const nextWindows =
        existingIndex >= 0
          ? currentWindows.filter((item) => item.day !== day)
          : [
              ...currentWindows,
              {
                day,
                windows: [defaultAvailabilityWindow],
                max_sessions: 1,
              },
            ];

      form.setValue("availability.weekly_windows", nextWindows, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [form],
  );
  const toggleSportDoseOverride = useCallback(
    (sport: SportOverrideKey) => {
      const currentOverrides = form.getValues("dose_limits.sport_overrides") ?? {};
      const nextOverrides = { ...currentOverrides };
      if (nextOverrides[sport]) {
        delete nextOverrides[sport];
      } else {
        nextOverrides[sport] = defaultSportDoseOverride;
      }
      form.setValue("dose_limits.sport_overrides", nextOverrides, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
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
      {showLauncher ? (
        <View className="flex-1 items-center justify-center gap-3 px-5">
          <Text className="text-center text-xl font-semibold text-foreground">
            Training preferences
          </Text>
          <Text className="text-center text-sm leading-5 text-muted-foreground">
            Preferences now open in a bottom sheet so editing works consistently from the Plan tab,
            training plan creation, and settings surfaces.
          </Text>
          <Button onPress={() => setIsSheetVisible(true)} testID="training-preferences-open-sheet">
            <Text className="text-primary-foreground font-semibold">Edit preferences</Text>
          </Button>
        </View>
      ) : null}
      <Form {...form}>
        <TrainingPreferencesBottomSheet
          visible={resolvedSheetVisible}
          title={sheetTitle}
          description={sheetDescription}
          isResetDisabled={!hasUnsavedChanges}
          isSaveDisabled={saveButtonState.disabled}
          isSaving={isSaving || saveButtonState.loading}
          onClose={closeSheet}
          onReset={() => form.reset(formDefaults)}
          onSave={submitForm.handleSubmit}
          saveLabel={saveButtonState.label}
          saveLoadingLabel={saveButtonState.loadingLabel}
        >
          <TrainingPreferencesContent>
            <TrainingPreferencesProjectionPreview
              draft={deferredDraft}
              planId={activePlanQuery.data?.id}
            />

            <TrainingPreferencesTabs
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              visibleTabs={visibleTabs}
            />

            <View className="gap-3 rounded-xl border border-border bg-card p-3">
              {activeTab === "preferences" ? (
                <PreferencesOverviewSection
                  control={form.control}
                  onApplyPreset={applyPreferencePreset}
                  preferenceDirectionSummary={preferenceDirectionSummary}
                  presets={preferencePresets}
                  selectedPreferencePreset={selectedPreferencePreset}
                />
              ) : null}

              {activeTab === "availability" ? (
                <AvailabilitySection
                  availability={draft.availability}
                  control={form.control}
                  onToggleAvailabilityDay={toggleAvailabilityDay}
                  onToggleHardRestDay={toggleHardRestDay}
                />
              ) : null}

              {activeTab === "schedule" ? (
                <ScheduleSection
                  control={form.control}
                  doseLimits={draft.dose_limits}
                  onToggleSportDoseOverride={toggleSportDoseOverride}
                  scheduleValidation={scheduleValidation}
                />
              ) : null}

              {activeTab === "training-style" ? (
                <TrainingStyleSection control={form.control} />
              ) : null}

              {activeTab === "recovery" ? <RecoverySection control={form.control} /> : null}

              {activeTab === "goal-strategy" ? (
                <GoalStrategySection control={form.control} />
              ) : null}

              {activeTab === "baseline-fitness" ? (
                <BaselineFitnessSection
                  baselineFitness={draft.baseline_fitness}
                  control={form.control}
                  manualBaselineCtlWarning={manualBaselineCtlWarning}
                  onToggleAdvancedControls={() =>
                    setShowAdvancedBaselineControls((value) => !value)
                  }
                  showAdvancedControls={showAdvancedBaselineControls}
                />
              ) : null}
            </View>
          </TrainingPreferencesContent>
        </TrainingPreferencesBottomSheet>
      </Form>
    </View>
  );
}

export default function TrainingPreferencesScreen() {
  return <TrainingPreferencesEditor />;
}
