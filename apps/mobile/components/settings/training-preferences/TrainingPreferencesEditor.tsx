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
import {
  getAvailabilityWindowValidation,
  type WeekdayKey,
} from "@/components/settings/training-preferences/sections/AvailabilitySection";
import type { SportOverrideKey } from "@/components/settings/training-preferences/sections/ScheduleSection";
import { TrainingPreferencesBottomSheet } from "@/components/settings/training-preferences/TrainingPreferencesBottomSheet";
import { TrainingPreferencesSurface } from "@/components/settings/training-preferences/TrainingPreferencesSurface";
import type { PreferencesTabKey } from "@/components/settings/training-preferences/TrainingPreferencesTabs";
import { api } from "@/lib/api";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const defaultAvailabilityWindow = {
  start_minute_of_day: 360,
  end_minute_of_day: 540,
};

type AvailabilityWindow = NonNullable<
  NonNullable<AthleteTrainingSettingsFormInput["availability"]["weekly_windows"]>[number]["windows"]
>[number];

function sortAvailabilityWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  return [...windows].sort(
    (left, right) =>
      left.start_minute_of_day - right.start_minute_of_day ||
      left.end_minute_of_day - right.end_minute_of_day,
  );
}

function normalizeAvailability(
  availability: AthleteTrainingSettingsFormInput["availability"],
): AthleteTrainingSettingsFormInput["availability"] {
  return {
    ...availability,
    weekly_windows: (availability.weekly_windows ?? []).map((dayConfig) => ({
      ...dayConfig,
      windows: sortAvailabilityWindows(dayConfig.windows ?? []),
    })),
  };
}

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
    availability: normalizeAvailability(normalized.availability),
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

  useEffect(() => {
    for (const [dayIndex, dayConfig] of (draft.availability.weekly_windows ?? []).entries()) {
      const windows = dayConfig.windows ?? [];
      const sortedWindows = sortAvailabilityWindows(windows);
      if (sortedWindows.some((window, index) => window !== windows[index])) {
        form.setValue(`availability.weekly_windows.${dayIndex}.windows`, sortedWindows, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    }
  }, [draft.availability.weekly_windows, form]);

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

  const availabilityWindowValidation = useMemo(
    () => getAvailabilityWindowValidation(draft.availability),
    [draft.availability],
  );

  const saveDisabled =
    !settingsQuery.profileId ||
    !hasUnsavedChanges ||
    form.formState.isValidating ||
    Object.keys(form.formState.errors).length > 0 ||
    scheduleValidation.issues.length > 0 ||
    availabilityWindowValidation.size > 0 ||
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
  const addAvailabilityWindow = useCallback(
    (day: WeekdayKey) => {
      const currentDays = form.getValues("availability.weekly_windows") ?? [];
      const dayIndex = currentDays.findIndex((item) => item.day === day);
      if (dayIndex < 0) return "Enable this day before adding a window.";

      const dayConfig = currentDays[dayIndex];
      if (!dayConfig) return "Enable this day before adding a window.";
      const windows = dayConfig.windows ?? [];
      if (windows.length >= 4) return "Maximum 4 windows per day.";

      const previousEnd = windows.reduce(
        (maximumEnd, window) => Math.max(maximumEnd, window.end_minute_of_day),
        360,
      );
      if (previousEnd >= 1440) {
        return "No room remains after the last window. End it earlier before adding another.";
      }

      const nextDays = [...currentDays];
      nextDays[dayIndex] = {
        ...dayConfig,
        windows: sortAvailabilityWindows([
          ...windows,
          {
            start_minute_of_day: previousEnd,
            end_minute_of_day: Math.min(previousEnd + 180, 1440),
          },
        ]),
      };
      form.setValue("availability.weekly_windows", nextDays, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      return null;
    },
    [form],
  );
  const removeAvailabilityWindow = useCallback(
    (day: WeekdayKey, windowIndex: number) => {
      const currentDays = form.getValues("availability.weekly_windows") ?? [];
      const dayIndex = currentDays.findIndex((item) => item.day === day);
      const dayConfig = currentDays[dayIndex];
      const windows = dayConfig?.windows ?? [];
      if (!dayConfig || !windows[windowIndex]) return;

      const remainingWindows = windows.filter((_, index) => index !== windowIndex);
      const nextDays =
        remainingWindows.length === 0
          ? currentDays.filter((_, index) => index !== dayIndex)
          : currentDays.map((item, index) =>
              index === dayIndex
                ? { ...dayConfig, windows: sortAvailabilityWindows(remainingWindows) }
                : item,
            );
      form.setValue("availability.weekly_windows", nextDays, {
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
        <TrainingPreferencesSurface
          presentation="full"
          activeTab={activeTab}
          availability={draft.availability}
          baselineFitness={draft.baseline_fitness}
          control={form.control}
          doseLimits={draft.dose_limits}
          manualBaselineCtlWarning={manualBaselineCtlWarning}
          onAddAvailabilityWindow={addAvailabilityWindow}
          onRemoveAvailabilityWindow={removeAvailabilityWindow}
          onSelectTab={setActiveTab}
          onToggleAdvancedBaselineControls={() =>
            setShowAdvancedBaselineControls((value) => !value)
          }
          onToggleAvailabilityDay={toggleAvailabilityDay}
          onToggleHardRestDay={toggleHardRestDay}
          onToggleSportDoseOverride={toggleSportDoseOverride}
          scheduleValidation={scheduleValidation}
          showAdvancedBaselineControls={showAdvancedBaselineControls}
          visibleTabs={visibleTabs}
        />
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
