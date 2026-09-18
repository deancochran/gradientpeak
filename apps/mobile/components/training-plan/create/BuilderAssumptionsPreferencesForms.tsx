import type {
  AthletePlanningContextFieldDescriptor,
  AthletePlanningContextFieldKey,
  TrainingPlanPreferences,
  TrainingPlanPreferenceValidationIssue,
} from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { BuilderFieldList } from "@/components/training-plan/create/BuilderFieldList";

type BuilderActivityCategory = "run" | "bike" | "swim" | "strength" | "other";
type BuilderExperienceLevel = "new" | "recreational" | "trained" | "competitive";
type BuilderFatigueState = "fresh" | "normal" | "fatigued";
type BuilderIntensityBias = "conservative" | "balanced" | "ambitious";
type BuilderRecoveryPriority = "standard" | "protective" | "performance";
type BuilderWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

interface SelectOption<TValue extends string> {
  label: string;
  value: TValue;
}

export interface BuilderProfileAssumptionsValues {
  displayName?: string;
  primaryActivityCategory?: BuilderActivityCategory;
  experienceLevel?: BuilderExperienceLevel;
  trainingAgeYears?: string;
  birthYear?: string;
  notes?: string;
}

export interface BuilderProfileMetricsValues {
  heightCm?: string;
  weightKg?: string;
  thresholdHeartRateBpm?: string;
  bikeFtpWatts?: string;
  runThresholdPaceMinPerKm?: string;
  startingLongTermLoad?: string;
  fatigueState?: BuilderFatigueState;
}

export interface BuilderActivityEffortsValues {
  recentWeeklyHours?: string;
  recentWeeklyTss?: string;
  recentHardDays?: string;
  longestRecentRunKm?: string;
  longestRecentRideKm?: string;
  consistencyNotes?: string;
}

export interface BuilderPlanPreferencesValues {
  targetWeeks?: string;
  sessionsPerWeek?: string;
  preferredLongSessionDay?: BuilderWeekday;
  intensityBias?: BuilderIntensityBias;
  recoveryPriority?: BuilderRecoveryPriority;
  includeStrength?: boolean;
  notes?: string;
}

interface BuilderLocalFormProps<TValues> {
  values: TValues;
  onChange: (values: TValues) => void;
  onClose: () => void;
  showDone?: boolean;
}

export type BuilderProfileAssumptionsFormProps =
  BuilderLocalFormProps<BuilderProfileAssumptionsValues>;
export type BuilderProfileMetricsFormProps = BuilderLocalFormProps<BuilderProfileMetricsValues>;
export type BuilderActivityEffortsFormProps = BuilderLocalFormProps<BuilderActivityEffortsValues>;
export type BuilderPlanPreferencesFormProps = BuilderLocalFormProps<BuilderPlanPreferencesValues>;

export interface BuilderAthleteContextFormProps {
  fields: AthletePlanningContextFieldDescriptor[];
  onAddField: (fieldKey: AthletePlanningContextFieldKey) => void;
  onChangeField: (fieldKey: AthletePlanningContextFieldKey, value: number | null) => void;
  onRemoveField: (fieldKey: AthletePlanningContextFieldKey) => void;
}

export interface BuilderPlanPreferencesContextFormProps {
  preferences: TrainingPlanPreferences;
  numericDrafts: Record<string, string>;
  onNumericDraftChange: (key: string, value: string) => void;
  issues?: TrainingPlanPreferenceValidationIssue[];
  onChange: (preferences: TrainingPlanPreferences) => void;
  onNumericDraftError: (key: string, message: string | null) => void;
}

const activityCategoryOptions: SelectOption<BuilderActivityCategory>[] = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
];

function findOption<TValue extends string>(options: SelectOption<TValue>[], value?: TValue) {
  return options.find((option) => option.value === value);
}

function HelperCopy({ children }: { children: ReactNode }) {
  return (
    <View className="px-1">
      <Text className="text-xs leading-4 text-muted-foreground">{children}</Text>
    </View>
  );
}

function DoneButton({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="outline" onPress={onClose}>
      <Text className="text-sm font-medium text-foreground">Done</Text>
    </Button>
  );
}

function TextField({
  helperText,
  label,
  onChange,
  placeholder,
  value,
}: {
  helperText?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value?: string | undefined;
}) {
  return (
    <View className="gap-2">
      <Label>
        <Text className="text-sm font-medium text-foreground">{label}</Text>
      </Label>
      <Input value={value ?? ""} onChangeText={onChange} placeholder={placeholder} />
      {helperText ? (
        <Text className="text-xs leading-4 text-muted-foreground">{helperText}</Text>
      ) : null}
    </View>
  );
}

function LocalSelect<TValue extends string>({
  label,
  onChange,
  onClear,
  options,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: TValue) => void;
  onClear: () => void;
  options: SelectOption<TValue>[];
  placeholder: string;
  value?: TValue | undefined;
}) {
  const selectedOption = findOption(options, value);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Label>
          <Text className="text-sm font-medium text-foreground">{label}</Text>
        </Label>
        {value ? (
          <Button accessibilityLabel={`Clear ${label}`} size="sm" variant="ghost" onPress={onClear}>
            <Text className="text-xs text-muted-foreground">Clear</Text>
          </Button>
        ) : null}
      </View>
      <Select
        value={selectedOption}
        onValueChange={(option) => {
          if (option?.value) {
            onChange(option.value as TValue);
          }
        }}
      >
        <SelectTrigger accessibilityLabel={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} label={option.label} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </View>
  );
}

function NumberField({
  helperText,
  label,
  max,
  min = 0,
  onChange,
  placeholder,
  unitLabel,
  value,
}: {
  helperText?: string | undefined;
  label: string;
  max?: number | undefined;
  min?: number;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  unitLabel?: string | undefined;
  value?: string | undefined;
}) {
  return (
    <BoundedNumberInput
      decimals={0}
      {...(helperText ? { helperText } : {})}
      label={label}
      {...(max === undefined ? {} : { max })}
      min={min}
      onChange={onChange}
      {...(placeholder ? { placeholder } : {})}
      {...(unitLabel ? { unitLabel } : {})}
      value={value ?? ""}
    />
  );
}

export function BuilderAthleteContextForm({
  fields,
  onAddField,
  onChangeField,
  onRemoveField,
}: BuilderAthleteContextFormProps) {
  return (
    <View className="gap-4">
      <HelperCopy>Optional athlete details for this plan only.</HelperCopy>
      <BuilderFieldList
        addLabel="Add context field"
        emptyMessage="No athlete context selected. Add only what this plan needs."
        fields={fields}
        onAddField={onAddField}
        onChangeField={onChangeField}
        onRemoveField={onRemoveField}
      />
    </View>
  );
}

export function BuilderPlanPreferencesContextForm({
  preferences,
  numericDrafts,
  onNumericDraftChange,
  issues = [],
  onChange,
  onNumericDraftError,
}: BuilderPlanPreferencesContextFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(
    preferences.maximum_session_duration_minutes !== null ||
      preferences.preferred_weekdays.length > 0 ||
      preferences.rest_days.length > 0 ||
      preferences.progression_style !== null ||
      preferences.recovery_priority !== null,
  );
  const update = (patch: Partial<TrainingPlanPreferences>) =>
    onChange({ ...preferences, ...patch });
  const updateNumber = (
    field:
      | "weekly_session_count"
      | "target_weekly_duration_minutes"
      | "maximum_session_duration_minutes",
    value: string,
    min: number,
    max: number,
  ) => {
    onNumericDraftChange(field, value);
    if (!value.trim()) {
      onNumericDraftError(field, null);
      update({ [field]: null });
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      onNumericDraftError(field, `Enter a whole number from ${min} to ${max}.`);
      return;
    }
    onNumericDraftError(field, null);
    update({ [field]: parsed });
  };
  const hasInvalidNumberDraft = (field: string, min: number, max: number) => {
    const value = numericDrafts[field];
    if (value === undefined || value.trim() === "") return false;
    const parsed = Number(value);
    return !Number.isInteger(parsed) || parsed < min || parsed > max;
  };
  const toggleWeekday = (key: "preferred_weekdays" | "rest_days", weekday: number) => {
    const current = preferences[key];
    const next = current.includes(weekday)
      ? current.filter((value) => value !== weekday)
      : [...current, weekday].sort((left, right) => left - right);
    const oppositeKey = key === "preferred_weekdays" ? "rest_days" : "preferred_weekdays";
    update({
      [key]: next,
      [oppositeKey]: preferences[oppositeKey].filter((value) => value !== weekday),
    });
  };
  return (
    <View className="gap-5">
      <HelperCopy>These preferences apply only to this training plan.</HelperCopy>
      <BoundedNumberInput
        decimals={0}
        label="Sessions per week"
        min={1}
        max={14}
        error={
          hasInvalidNumberDraft("weekly_session_count", 1, 14)
            ? "Enter a whole number from 1 to 14."
            : undefined
        }
        onChange={(value) => updateNumber("weekly_session_count", value, 1, 14)}
        value={
          numericDrafts.weekly_session_count ?? preferences.weekly_session_count?.toString() ?? ""
        }
      />
      <BoundedNumberInput
        decimals={0}
        label="Weekly duration"
        min={1}
        max={10080}
        unitLabel="min"
        error={
          hasInvalidNumberDraft("target_weekly_duration_minutes", 1, 10080)
            ? "Enter a whole number from 1 to 10080."
            : undefined
        }
        onChange={(value) => updateNumber("target_weekly_duration_minutes", value, 1, 10080)}
        value={
          numericDrafts.target_weekly_duration_minutes ??
          preferences.target_weekly_duration_minutes?.toString() ??
          ""
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showAdvanced }}
        className="min-h-11 self-start justify-center rounded-full px-2 py-1"
        onPress={() => setShowAdvanced((visible) => !visible)}
      >
        <Text className="text-xs font-semibold text-primary">
          {showAdvanced ? "Hide advanced preferences" : "Add advanced preferences"}
        </Text>
      </Pressable>
      {showAdvanced ? (
        <>
          <BoundedNumberInput
            decimals={0}
            label="Maximum session duration"
            min={1}
            max={600}
            unitLabel="min"
            error={
              hasInvalidNumberDraft("maximum_session_duration_minutes", 1, 600)
                ? "Enter a whole number from 1 to 600."
                : undefined
            }
            onChange={(value) => updateNumber("maximum_session_duration_minutes", value, 1, 600)}
            value={
              numericDrafts.maximum_session_duration_minutes ??
              preferences.maximum_session_duration_minutes?.toString() ??
              ""
            }
          />
          {(["preferred_weekdays", "rest_days"] as const).map((key) => (
            <View className="gap-2" key={key}>
              <Text className="text-sm font-medium text-foreground">
                {key === "preferred_weekdays" ? "Preferred training days" : "Rest days"}
              </Text>
              <View className="flex-row gap-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, weekday) => (
                  <Pressable
                    accessibilityLabel={`${key}-${label}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: preferences[key].includes(weekday) }}
                    className={`min-h-11 flex-1 items-center justify-center rounded-lg ${preferences[key].includes(weekday) ? "bg-primary" : "bg-muted"}`}
                    key={label}
                    onPress={() => toggleWeekday(key, weekday)}
                  >
                    <Text
                      className={
                        preferences[key].includes(weekday)
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <LocalSelect
            label="Progression style"
            onChange={(progression_style) => update({ progression_style })}
            onClear={() => update({ progression_style: null })}
            options={[
              { value: "conservative", label: "Conservative" },
              { value: "balanced", label: "Balanced" },
              { value: "ambitious", label: "Ambitious" },
            ]}
            placeholder="Choose progression"
            value={preferences.progression_style ?? undefined}
          />
          <LocalSelect
            label="Recovery priority"
            onChange={(recovery_priority) => update({ recovery_priority })}
            onClear={() => update({ recovery_priority: null })}
            options={[
              { value: "low", label: "Low" },
              { value: "balanced", label: "Balanced" },
              { value: "high", label: "High" },
            ]}
            placeholder="Choose recovery priority"
            value={preferences.recovery_priority ?? undefined}
          />
        </>
      ) : null}
      {issues.map((issue) => (
        <Text className="text-xs text-destructive" key={issue.code}>
          {issue.message}
        </Text>
      ))}
    </View>
  );
}

export function BuilderProfileAssumptionsForm({
  values,
  onChange,
  onClose,
  showDone = true,
}: BuilderProfileAssumptionsFormProps) {
  const update = (updates: Partial<BuilderProfileAssumptionsValues>) => {
    onChange({ ...values, ...updates });
  };

  return (
    <View className="gap-4">
      <HelperCopy>
        These assumptions are local to this builder session. They do not update profile settings,
        training preferences, or activity records.
      </HelperCopy>
      <TextField
        label="Scenario athlete name"
        value={values.displayName}
        onChange={(displayName) => update({ displayName })}
        placeholder="Optional label"
        helperText="Use this only to identify the scenario inside the builder."
      />
      <LocalSelect
        label="Primary activity category"
        value={values.primaryActivityCategory}
        onChange={(primaryActivityCategory) => update({ primaryActivityCategory })}
        onClear={() => update({ primaryActivityCategory: undefined })}
        options={activityCategoryOptions}
        placeholder="Select activity category"
      />
      <NumberField
        label="Birth year"
        value={values.birthYear}
        onChange={(birthYear) => update({ birthYear })}
        min={1900}
        max={new Date().getFullYear()}
        placeholder="1988"
        helperText="Used only as an age-range planning assumption."
      />
      {showDone ? <DoneButton onClose={onClose} /> : null}
    </View>
  );
}

export function BuilderProfileMetricsForm({
  values,
  onChange,
  onClose,
  showDone = true,
}: BuilderProfileMetricsFormProps) {
  const update = (updates: Partial<BuilderProfileMetricsValues>) => {
    onChange({ ...values, ...updates });
  };

  return (
    <View className="gap-4">
      <HelperCopy>
        These assumptions are local to this builder session. They do not update profile settings,
        training preferences, or activity records.
      </HelperCopy>
      <NumberField
        label="Height"
        value={values.heightCm}
        onChange={(heightCm) => update({ heightCm })}
        min={90}
        max={250}
        unitLabel="cm"
        placeholder="178"
      />
      <NumberField
        label="Weight"
        value={values.weightKg}
        onChange={(weightKg) => update({ weightKg })}
        min={25}
        max={250}
        unitLabel="kg"
        placeholder="72"
      />
      <NumberField
        label="Threshold heart rate"
        value={values.thresholdHeartRateBpm}
        onChange={(thresholdHeartRateBpm) => update({ thresholdHeartRateBpm })}
        min={80}
        max={230}
        unitLabel="bpm"
        placeholder="168"
      />
      <NumberField
        label="Bike FTP"
        value={values.bikeFtpWatts}
        onChange={(bikeFtpWatts) => update({ bikeFtpWatts })}
        min={50}
        max={700}
        unitLabel="W"
        placeholder="250"
      />
      {showDone ? <DoneButton onClose={onClose} /> : null}
    </View>
  );
}

export function BuilderActivityEffortsForm({
  values,
  onChange,
  onClose,
  showDone = true,
}: BuilderActivityEffortsFormProps) {
  const update = (updates: Partial<BuilderActivityEffortsValues>) => {
    onChange({ ...values, ...updates });
  };

  return (
    <View className="gap-4">
      <HelperCopy>
        These assumptions are local to this builder session. They do not update profile settings,
        training preferences, or activity records.
      </HelperCopy>
      <NumberField
        label="Recent weekly Load"
        value={values.recentWeeklyTss}
        onChange={(recentWeeklyTss) => update({ recentWeeklyTss })}
        min={0}
        max={1500}
        placeholder="350"
      />
      {showDone ? <DoneButton onClose={onClose} /> : null}
    </View>
  );
}

export function BuilderPlanPreferencesForm({
  values,
  onChange,
  onClose,
}: BuilderPlanPreferencesFormProps) {
  const update = (updates: Partial<BuilderPlanPreferencesValues>) => {
    onChange({ ...values, ...updates });
  };

  return (
    <View className="gap-4">
      <HelperCopy>
        These assumptions are local to this builder session. They do not update profile settings,
        training preferences, or activity records.
      </HelperCopy>
      <NumberField
        label="Target duration"
        value={values.targetWeeks}
        onChange={(targetWeeks) => update({ targetWeeks })}
        min={1}
        max={52}
        unitLabel="weeks"
        placeholder="12"
      />
      <NumberField
        label="Sessions per week"
        value={values.sessionsPerWeek}
        onChange={(sessionsPerWeek) => update({ sessionsPerWeek })}
        min={1}
        max={14}
        placeholder="5"
      />
      <DoneButton onClose={onClose} />
    </View>
  );
}
