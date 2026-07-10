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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { ActivityIndicator, View } from "react-native";
import { GlobalTrainingPreferenceCatalogSection } from "@/components/settings/training-preferences/GlobalTrainingPreferenceCatalogSection";
import {
  AvailabilitySection,
  type WeekdayKey,
} from "@/components/settings/training-preferences/sections/AvailabilitySection";
import { BaselineFitnessSection } from "@/components/settings/training-preferences/sections/BaselineFitnessSection";
import type { SportOverrideKey } from "@/components/settings/training-preferences/sections/ScheduleSection";
import { TrainingPreferencesBottomSheet } from "@/components/settings/training-preferences/TrainingPreferencesBottomSheet";
import { TrainingPreferencesContent } from "@/components/settings/training-preferences/TrainingPreferencesContent";
import { TrainingPreferencesPanel } from "@/components/settings/training-preferences/TrainingPreferencesPanel";
import {
  type PreferencesTabKey,
  TrainingPreferencesTabs,
} from "@/components/settings/training-preferences/TrainingPreferencesTabs";
import { api } from "@/lib/api";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

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

type TrainingPreferencesEditorProps = {
  mode?: "global" | "plan-local";
  onClose?: () => void;
  showLauncher?: boolean;
  visible?: boolean;
};

const planLocalVisibleTabs: PreferencesTabKey[] = [
  "schedule",
  "training-style",
  "recovery",
  "goal-strategy",
];

export function TrainingPreferencesEditor({
  mode = "global",
  onClose,
  showLauncher = true,
  visible,
}: TrainingPreferencesEditorProps = {}) {
  const utils = api.useUtils();
  const settingsQuery = useProfileSettings();
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
    label: "Save preferences",
    submittingLabel: "Saving...",
  });

  const manualBaselineCtlWarning = draft.baseline_fitness?.is_enabled
    ? getManualBaselineCtlWarning(draft.baseline_fitness.override_ctl)
    : null;
  const resolvedSheetVisible = visible ?? isSheetVisible;
  const sheetTitle = mode === "plan-local" ? "Plan preferences" : "Training preferences";
  const sheetDescription = undefined;
  const visibleTabs = mode === "plan-local" ? planLocalVisibleTabs : undefined;
  const sheetContentKey = [
    resolvedSheetVisible ? "open" : "closed",
    activeTab,
    showAdvancedBaselineControls ? "advanced-baseline" : "basic-baseline",
  ].join(":");
  const closeSheet = useCallback(() => {
    if (visible === undefined) {
      setIsSheetVisible(false);
    }
    onClose?.();
  }, [onClose, visible]);

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

  const sheet = (
    <Form {...form}>
      <TrainingPreferencesBottomSheet
        visible={resolvedSheetVisible}
        title={sheetTitle}
        description={sheetDescription}
        isResetDisabled={!hasUnsavedChanges}
        isSaveDisabled={saveButtonState.disabled}
        isSaving={isSaving || saveButtonState.loading}
        contentKey={sheetContentKey}
        onClose={closeSheet}
        onReset={() => form.reset(formDefaults)}
        onSave={submitForm.handleSubmit}
        saveLabel={saveButtonState.label}
        saveLoadingLabel={saveButtonState.loadingLabel}
      >
        <TrainingPreferencesContent>
          <TrainingPreferencesTabs
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            visibleTabs={visibleTabs}
          />

          <TrainingPreferencesPanel>
            {activeTab === "preferences" ? (
              <GlobalTrainingPreferenceCatalogSection
                activeTab={activeTab}
                control={form.control}
                doseLimits={draft.dose_limits}
                onToggleSportDoseOverride={toggleSportDoseOverride}
                scheduleValidation={scheduleValidation}
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
              <GlobalTrainingPreferenceCatalogSection
                activeTab={activeTab}
                control={form.control}
                doseLimits={draft.dose_limits}
                onToggleSportDoseOverride={toggleSportDoseOverride}
                scheduleValidation={scheduleValidation}
              />
            ) : null}

            {activeTab === "training-style" ? (
              <GlobalTrainingPreferenceCatalogSection
                activeTab={activeTab}
                control={form.control}
                doseLimits={draft.dose_limits}
                onToggleSportDoseOverride={toggleSportDoseOverride}
                scheduleValidation={scheduleValidation}
              />
            ) : null}

            {activeTab === "recovery" ? (
              <GlobalTrainingPreferenceCatalogSection
                activeTab={activeTab}
                control={form.control}
                doseLimits={draft.dose_limits}
                onToggleSportDoseOverride={toggleSportDoseOverride}
                scheduleValidation={scheduleValidation}
              />
            ) : null}

            {activeTab === "goal-strategy" ? (
              <GlobalTrainingPreferenceCatalogSection
                activeTab={activeTab}
                control={form.control}
                doseLimits={draft.dose_limits}
                onToggleSportDoseOverride={toggleSportDoseOverride}
                scheduleValidation={scheduleValidation}
              />
            ) : null}

            {activeTab === "baseline-fitness" ? (
              <BaselineFitnessSection
                baselineFitness={draft.baseline_fitness}
                control={form.control}
                manualBaselineCtlWarning={manualBaselineCtlWarning}
                onToggleAdvancedControls={() => setShowAdvancedBaselineControls((value) => !value)}
                showAdvancedControls={showAdvancedBaselineControls}
              />
            ) : null}
          </TrainingPreferencesPanel>
        </TrainingPreferencesContent>
      </TrainingPreferencesBottomSheet>
    </Form>
  );

  if (!showLauncher) {
    return sheet;
  }

  return (
    <View className="flex-1 bg-background" testID="training-preferences-screen">
      <View className="flex-1 items-center justify-center gap-3 px-5">
        <Text className="text-center text-xl font-semibold text-foreground">
          Training preferences
        </Text>
        <Button onPress={() => setIsSheetVisible(true)} testID="training-preferences-open-sheet">
          <Text className="text-primary-foreground font-semibold">Edit preferences</Text>
        </Button>
      </View>
      {sheet}
    </View>
  );
}

export default function TrainingPreferencesScreen() {
  return <TrainingPreferencesEditor />;
}
