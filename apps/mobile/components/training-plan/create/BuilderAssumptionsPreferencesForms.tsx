import type {
  AthletePlanningContextFieldDescriptor,
  AthletePlanningContextFieldKey,
} from "@repo/core";
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
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  BuilderFieldList,
  getBuilderNumberStep,
} from "@/components/training-plan/create/BuilderFieldList";
import type {
  TrainingPlanPreferenceFieldDescriptor,
  TrainingPlanPreferenceFieldKey,
} from "@/lib/training-plan-creation/preferences-context";

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
  primarySport?: BuilderActivityCategory;
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
  startingCtl?: string;
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
  onClose: () => void;
  onRemoveField: (fieldKey: AthletePlanningContextFieldKey) => void;
}

export interface BuilderPlanPreferencesContextFormProps {
  fields: TrainingPlanPreferenceFieldDescriptor[];
  onAddField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
  onChangeField: (fieldKey: TrainingPlanPreferenceFieldKey, value: number | null) => void;
  onClose: () => void;
  onRemoveField: (fieldKey: TrainingPlanPreferenceFieldKey) => void;
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
  value?: string;
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
  value?: TValue;
}) {
  const selectedOption = findOption(options, value);

  return (
    <View className="gap-2">
      <Label>
        <Text className="text-sm font-medium text-foreground">{label}</Text>
      </Label>
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
      {value ? (
        <View className="items-start">
          <Button size="sm" variant="ghost" onPress={onClear}>
            <Text className="text-xs text-muted-foreground">Clear</Text>
          </Button>
        </View>
      ) : null}
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
  helperText?: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  unitLabel?: string;
  value?: string;
}) {
  const numericValue = value && Number.isFinite(Number(value)) ? Number(value) : null;
  const updateValue = (nextValue: number | null) => {
    onChange(nextValue === null ? "" : String(nextValue));
  };

  return (
    <CompactNumberRow
      label={label}
      min={min}
      max={max}
      unitLabel={unitLabel}
      placeholder={placeholder}
      helperText={helperText}
      value={numericValue}
      onChange={updateValue}
    />
  );
}

function CompactNumberRow({
  helperText,
  label,
  max,
  min = 0,
  onChange,
  placeholder,
  unitLabel,
  value,
}: {
  helperText?: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number | null) => void;
  placeholder?: string;
  unitLabel?: string;
  value: number | null;
}) {
  const step = getBuilderNumberStep({ label, unitLabel });
  const canDecrease = value !== null && value > min;
  const decrease = () => {
    if (value === null) return;
    const nextValue = value - step;
    onChange(nextValue >= min ? nextValue : null);
  };
  const increase = () => {
    const startValue = value ?? min;
    const nextValue = startValue + step;
    onChange(max !== undefined ? Math.min(max, nextValue) : nextValue);
  };

  return (
    <View className="gap-2 border-b border-border/70 py-3 last:border-b-0">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-sm font-medium text-foreground">{label}</Text>
          {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
        </View>
        {value !== null ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChange(null)}>
            <Text className="text-xs font-medium text-muted-foreground">Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between gap-3 rounded-2xl bg-muted/30 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          className="h-9 w-9 items-center justify-center rounded-full bg-background"
          disabled={!canDecrease}
          onPress={decrease}
        >
          <Text className="text-lg font-medium text-foreground">−</Text>
        </Pressable>
        <View className="min-w-0 flex-1 items-center">
          <Text className="text-base font-semibold text-foreground">
            {value === null
              ? (placeholder ?? "Not set")
              : `${value}${unitLabel ? ` ${unitLabel}` : ""}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          className="h-9 w-9 items-center justify-center rounded-full bg-background"
          onPress={increase}
        >
          <Text className="text-lg font-medium text-foreground">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BuilderAthleteContextForm({
  fields,
  onAddField,
  onChangeField,
  onClose,
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
      <DoneButton onClose={onClose} />
    </View>
  );
}

export function BuilderPlanPreferencesContextForm({
  fields,
  onAddField,
  onChangeField,
  onClose,
  onRemoveField,
}: BuilderPlanPreferencesContextFormProps) {
  const canonicalFields = fields.map((field) => ({ ...field, visible: true }));

  return (
    <View className="gap-4">
      <HelperCopy>
        Edit the planning constraints used by the algorithm. Clear a value to leave it unset.
      </HelperCopy>
      <BuilderFieldList
        addLabel="Additional preferences"
        emptyMessage="No planning preferences are available."
        fields={canonicalFields}
        onAddField={onAddField}
        onChangeField={onChangeField}
        onRemoveField={onRemoveField}
      />
      <DoneButton onClose={onClose} />
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
        label="Primary sport"
        value={values.primarySport}
        onChange={(primarySport) => update({ primarySport })}
        onClear={() => update({ primarySport: undefined })}
        options={activityCategoryOptions}
        placeholder="Select sport"
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
        label="Recent weekly TSS"
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
