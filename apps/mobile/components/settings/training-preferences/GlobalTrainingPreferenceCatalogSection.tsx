import type { TrainingPreferenceField, TrainingPreferenceTab } from "@repo/core";
import { trainingPreferenceCatalog } from "@repo/core";
import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import {
  FormBoundedNumberField,
  FormIntegerStepperField,
  FormPercentSliderField,
} from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import type { Control, FieldPath } from "react-hook-form";
import { View } from "react-native";
import type { SportOverrideKey } from "@/components/settings/training-preferences/sections/ScheduleSection";
import { SportDoseOverridesSection } from "@/components/settings/training-preferences/sections/ScheduleSection";
import { TrainingPreferenceFieldRenderer } from "@/components/settings/training-preferences/TrainingPreferenceFieldRenderer";

type ScheduleValidation = {
  issues: string[];
  maxSessionsError?: string;
  maxSingleSessionError?: string;
  maxWeeklyDurationError?: string;
  minSessionsError?: string;
};

type GlobalTrainingPreferenceCatalogSectionProps = {
  activeTab: TrainingPreferenceTab;
  control: Control<AthleteTrainingSettingsFormInput>;
  doseLimits: AthleteTrainingSettingsFormInput["dose_limits"];
  onToggleSportDoseOverride: (sport: SportOverrideKey) => void;
  scheduleValidation: ScheduleValidation;
};

function getGlobalFieldError(fieldId: string, scheduleValidation: ScheduleValidation) {
  switch (fieldId) {
    case "minSessionsPerWeek":
      return scheduleValidation.minSessionsError;
    case "maxSessionsPerWeek":
      return scheduleValidation.maxSessionsError;
    case "maxSingleSessionDurationMinutes":
      return scheduleValidation.maxSingleSessionError;
    case "weeklyBudget":
      return scheduleValidation.maxWeeklyDurationError;
    default:
      return undefined;
  }
}

function fieldPath(field: TrainingPreferenceField) {
  return field.globalPath as FieldPath<AthleteTrainingSettingsFormInput>;
}

function GlobalTrainingPreferenceField({
  control,
  field,
  scheduleValidation,
}: {
  control: Control<AthleteTrainingSettingsFormInput>;
  field: TrainingPreferenceField;
  scheduleValidation: ScheduleValidation;
}) {
  if (!field.globalPath) {
    return (
      <TrainingPreferenceFieldRenderer disabledReason="Plan-specific preference." field={field} />
    );
  }

  const error = getGlobalFieldError(field.id, scheduleValidation);
  const testId = `preferences-${field.testIdStem}`;

  if (field.control === "percent-slider") {
    return (
      <FormPercentSliderField
        control={control}
        decimals={0}
        label={field.label}
        max={100}
        min={0}
        name={fieldPath(field)}
        showNumericInput={false}
        step={Math.max(1, Math.round((field.step ?? 0.01) * 100))}
        testId={testId}
        valueMode="fraction"
      />
    );
  }

  if (field.control === "integer-stepper") {
    return (
      <>
        <FormIntegerStepperField
          control={control}
          label={field.label}
          max={field.max}
          min={field.min}
          name={fieldPath(field)}
          step={field.step}
          testId={testId}
        />
        {error ? <Text className="-mt-3 text-sm font-medium text-destructive">{error}</Text> : null}
      </>
    );
  }

  if (field.control === "bounded-number") {
    return (
      <>
        <FormBoundedNumberField
          control={control}
          decimals={field.step && field.step < 1 ? 1 : 0}
          label={field.label}
          max={field.max}
          min={field.min}
          name={fieldPath(field)}
          testId={testId}
          unitLabel={field.unit ?? undefined}
        />
        {error ? <Text className="-mt-3 text-sm font-medium text-destructive">{error}</Text> : null}
      </>
    );
  }

  return (
    <TrainingPreferenceFieldRenderer disabledReason="Profile-level preference." field={field} />
  );
}

export function GlobalTrainingPreferenceCatalogSection({
  activeTab,
  control,
  doseLimits,
  onToggleSportDoseOverride,
  scheduleValidation,
}: GlobalTrainingPreferenceCatalogSectionProps) {
  const fields = trainingPreferenceCatalog.filter((field) => field.tab === activeTab);

  return (
    <>
      {activeTab === "schedule" && scheduleValidation.issues.length > 0 ? (
        <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          <Text className="text-sm font-medium text-destructive">
            Fix these schedule conflicts before saving.
          </Text>
          <Text className="mt-1 text-xs text-destructive">
            {scheduleValidation.issues.join(" ")}
          </Text>
        </View>
      ) : null}
      {fields.map((field) => {
        if (field.control === "sport-overrides") {
          return (
            <SportDoseOverridesSection
              key={field.id}
              control={control}
              doseLimits={doseLimits}
              onToggleSportDoseOverride={onToggleSportDoseOverride}
            />
          );
        }

        return (
          <GlobalTrainingPreferenceField
            key={field.id}
            control={control}
            field={field}
            scheduleValidation={scheduleValidation}
          />
        );
      })}
    </>
  );
}
