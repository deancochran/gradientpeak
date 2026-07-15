import {
  getProfileMetricDefinition,
  isProfileMetricValueWithinRange,
} from "@repo/core/athlete-inputs";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DateInput } from "@repo/ui/components/date-input";
import { Icon } from "@repo/ui/components/icon";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { Text } from "@repo/ui/components/text";
import { WeightInputField } from "@repo/ui/components/weight-input-field";
import { Check } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

export type AthleteBaselineSport = "cycling" | "running" | "swimming";
export type AthleteBaselineSourceKind = "imported" | "estimated" | "manual" | "cleared";

export type AthleteBaselineFieldSource = {
  kind: AthleteBaselineSourceKind;
  label?: string;
};

export interface AthleteBaselineValue {
  experience: "beginner" | "intermediate" | "advanced" | "skip" | null;
  dob: string | null;
  gender: "male" | "female" | "other" | null;
  weightKg: number | null;
  weightDisplayUnit: "kg" | "lbs";
  maxHr: number | null;
  restingHr: number | null;
  ftp: number | null;
  thresholdPaceSecondsPerKm: number | null;
  cssSecondsPer100m: number | null;
}

export type AthleteBaselineField = keyof AthleteBaselineValue;
export type AthleteBaselineFieldSources = Partial<
  Record<AthleteBaselineField, AthleteBaselineFieldSource>
>;
export type AthleteBaselineChange = {
  [Field in AthleteBaselineField]: {
    field: Field;
    value: AthleteBaselineValue[Field];
    source: "manual" | "cleared" | "estimated";
  };
}[AthleteBaselineField];

export interface AthleteBaselineFieldsProps {
  value: AthleteBaselineValue;
  onChange: (change: AthleteBaselineChange) => void;
  visibleSports: readonly AthleteBaselineSport[];
  sources?: AthleteBaselineFieldSources;
  estimates?: Partial<Pick<AthleteBaselineValue, "maxHr" | "ftp">>;
}

const metric = {
  weight: getProfileMetricDefinition("weight_kg"),
  maxHr: getProfileMetricDefinition("max_hr"),
  restingHr: getProfileMetricDefinition("resting_hr"),
  ftp: getProfileMetricDefinition("ftp"),
  thresholdPace: getProfileMetricDefinition("threshold_pace_seconds_per_km"),
  css: getProfileMetricDefinition("css_seconds_per_100m"),
};

function getSourceText(field: AthleteBaselineField, source?: AthleteBaselineFieldSource) {
  if (!source) return null;
  if (source.kind === "imported") {
    return source.label ? `Imported from ${source.label}` : "Imported";
  }
  if (source.kind === "estimated") return source.label ?? "Estimated";
  if (source.kind === "manual") return "Manual";
  return field === "dob" || field === "gender" || field === "experience"
    ? "Cleared"
    : "Not used for this setup";
}

function SourceText({
  field,
  source,
}: {
  field: AthleteBaselineField;
  source?: AthleteBaselineFieldSource;
}) {
  const text = getSourceText(field, source);
  return text ? <Text className="text-xs text-muted-foreground">{text}</Text> : null;
}

function MetricSourceRow({
  estimate,
  field,
  hasValue,
  onChange,
  source,
  unit,
}: {
  estimate?: number | null;
  field:
    | "weightKg"
    | "maxHr"
    | "restingHr"
    | "ftp"
    | "thresholdPaceSecondsPerKm"
    | "cssSecondsPer100m";
  hasValue: boolean;
  onChange: AthleteBaselineFieldsProps["onChange"];
  source?: AthleteBaselineFieldSource;
  unit?: string;
}) {
  const canReset = estimate != null && source?.kind !== "estimated";
  const sourceText = getSourceText(field, source);

  if (!sourceText && !canReset && !hasValue) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {sourceText ? <Text className="text-xs text-muted-foreground">{sourceText}</Text> : null}
      {hasValue ? (
        <Button
          testId={`athlete-baseline-${field}-exclude`}
          variant="ghost"
          size="sm"
          onPress={() =>
            onChange({ field, value: null, source: "cleared" } as AthleteBaselineChange)
          }
        >
          <Text className="text-muted-foreground">Exclude from setup</Text>
        </Button>
      ) : null}
      {canReset ? (
        <Button
          testId={`athlete-baseline-${field}-reset-estimate`}
          variant="ghost"
          size="sm"
          onPress={() =>
            onChange({ field, value: estimate, source: "estimated" } as AthleteBaselineChange)
          }
        >
          <Text className="text-muted-foreground">
            Reset to estimate ({estimate} {unit})
          </Text>
        </Button>
      ) : null}
    </View>
  );
}

function ChoiceField<Value extends string>({
  label,
  options,
  selected,
  testIdPrefix,
  onChange,
}: {
  label: string;
  options: readonly Value[];
  selected: Value | null;
  testIdPrefix: string;
  onChange: (value: Value | null) => void;
}) {
  return (
    <View
      className="gap-3"
      testID={`${testIdPrefix}-group`}
      accessibilityRole="radiogroup"
      accessibilityLabel={`${label} options`}
    >
      <Text className="text-base font-semibold">{label}</Text>
      {options.map((option) => (
        <TouchableOpacity
          key={option}
          testID={`${testIdPrefix}-${option}`}
          accessibilityRole="radio"
          accessibilityLabel={`${label}: ${option}`}
          accessibilityState={{ checked: selected === option }}
          onPress={() => onChange(option)}
          className={`p-3 border rounded-xl flex-row items-center justify-between ${
            selected === option ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          <Text className="font-semibold capitalize">{option}</Text>
          {selected === option ? <Icon as={Check} className="text-primary" /> : null}
        </TouchableOpacity>
      ))}
      {selected ? (
        <Button
          testId={`${testIdPrefix}-clear`}
          variant="ghost"
          size="sm"
          onPress={() => onChange(null)}
        >
          <Text className="text-muted-foreground">Clear</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function AthleteBaselineFields({
  estimates,
  onChange,
  sources = {},
  value,
  visibleSports,
}: AthleteBaselineFieldsProps) {
  const emit = <Field extends AthleteBaselineField>(
    field: Field,
    nextValue: AthleteBaselineValue[Field],
  ) =>
    onChange({
      field,
      value: nextValue,
      source: nextValue === null ? "cleared" : "manual",
    } as AthleteBaselineChange);
  const numberField = (field: "maxHr" | "restingHr" | "ftp", nextValue: number | undefined) =>
    emit(field, nextValue == null ? null : Math.round(nextValue));
  const showCycling = visibleSports.includes("cycling");
  const showRunning = visibleSports.includes("running");
  const showSwimming = visibleSports.includes("swimming");
  const weightError =
    value.weightKg !== null && !isProfileMetricValueWithinRange("weight_kg", value.weightKg)
      ? `Enter a weight from ${metric.weight.min} to ${metric.weight.max} kg.`
      : undefined;

  return (
    <View className="gap-8">
      <View className="gap-5">
        <Text className="text-lg font-semibold">Identity basics</Text>
        <ChoiceField
          label="Experience (Optional)"
          options={["beginner", "intermediate", "advanced"] as const}
          selected={value.experience === "skip" ? null : value.experience}
          testIdPrefix="athlete-baseline-experience"
          onChange={(nextValue) => emit("experience", nextValue)}
        />
        <SourceText field="experience" source={sources.experience} />
        <DateInput
          id="athlete-baseline-dob"
          label="Date of birth (Optional)"
          value={value.dob ?? undefined}
          onChange={(nextValue) => emit("dob", nextValue ?? null)}
          helperText="Used for age-based heart rate estimates and training zones."
          placeholder="Select your date of birth"
          maximumDate={new Date()}
          accessibilityHint="Choose your date of birth"
          clearable
        />
        <SourceText field="dob" source={sources.dob} />
        <ChoiceField
          label="Gender (Optional)"
          options={["male", "female", "other"] as const}
          selected={value.gender}
          testIdPrefix="athlete-baseline-gender"
          onChange={(nextValue) => emit("gender", nextValue)}
        />
        <SourceText field="gender" source={sources.gender} />
        <WeightInputField
          id="athlete-baseline-weight"
          label={`${metric.weight.label} (Optional)`}
          valueKg={value.weightKg}
          onChangeKg={(nextValue) => emit("weightKg", nextValue)}
          unit={value.weightDisplayUnit}
          onUnitChange={(nextUnit) => emit("weightDisplayUnit", nextUnit)}
          helperText="Switch units without changing the canonical kilogram value."
          error={weightError}
          placeholder={value.weightDisplayUnit === "kg" ? "70.0" : "154.3"}
        />
        <MetricSourceRow
          field="weightKg"
          hasValue={value.weightKg !== null}
          source={sources.weightKg}
          onChange={onChange}
        />
      </View>

      <View className="gap-5">
        <Text className="text-lg font-semibold">Heart rate</Text>
        <View className="gap-2">
          <BoundedNumberInput
            id="athlete-baseline-max-hr"
            label={`${metric.maxHr.label} (Optional)`}
            value={value.maxHr?.toString() ?? ""}
            onChange={(text) => {
              if (!text.trim()) emit("maxHr", null);
            }}
            onNumberChange={(nextValue) => numberField("maxHr", nextValue)}
            min={metric.maxHr.min}
            max={metric.maxHr.max}
            decimals={metric.maxHr.decimals}
            unitLabel={metric.maxHr.unit}
          />
          <MetricSourceRow
            field="maxHr"
            hasValue={value.maxHr !== null}
            source={sources.maxHr}
            estimate={estimates?.maxHr}
            unit={metric.maxHr.unit}
            onChange={onChange}
          />
        </View>
        <BoundedNumberInput
          id="athlete-baseline-resting-hr"
          label={`${metric.restingHr.label} (Optional)`}
          value={value.restingHr?.toString() ?? ""}
          onChange={(text) => {
            if (!text.trim()) emit("restingHr", null);
          }}
          onNumberChange={(nextValue) => numberField("restingHr", nextValue)}
          min={metric.restingHr.min}
          max={metric.restingHr.max}
          decimals={metric.restingHr.decimals}
          unitLabel={metric.restingHr.unit}
        />
        <MetricSourceRow
          field="restingHr"
          hasValue={value.restingHr !== null}
          source={sources.restingHr}
          onChange={onChange}
        />
      </View>

      {showCycling || showRunning || showSwimming ? (
        <View className="gap-5">
          <Text className="text-lg font-semibold">Sport-specific values</Text>
          {showCycling ? (
            <View className="gap-2">
              <BoundedNumberInput
                id="athlete-baseline-ftp"
                label={`${metric.ftp.label} (Optional)`}
                value={value.ftp?.toString() ?? ""}
                onChange={(text) => {
                  if (!text.trim()) emit("ftp", null);
                }}
                onNumberChange={(nextValue) => numberField("ftp", nextValue)}
                min={metric.ftp.min}
                max={metric.ftp.max}
                decimals={metric.ftp.decimals}
                unitLabel={metric.ftp.unit}
              />
              <MetricSourceRow
                field="ftp"
                hasValue={value.ftp !== null}
                source={sources.ftp}
                estimate={estimates?.ftp}
                unit={metric.ftp.unit}
                onChange={onChange}
              />
            </View>
          ) : null}
          {showRunning ? (
            <View className="gap-2">
              <PaceSecondsField
                id="athlete-baseline-threshold-pace"
                label={`${metric.thresholdPace.label} (Optional)`}
                valueSeconds={value.thresholdPaceSecondsPerKm}
                onChangeSeconds={(nextValue) => emit("thresholdPaceSecondsPerKm", nextValue)}
                helperText="Enter pace in mm:ss per kilometer."
                placeholder="4:30"
              />
              <MetricSourceRow
                field="thresholdPaceSecondsPerKm"
                hasValue={value.thresholdPaceSecondsPerKm !== null}
                source={sources.thresholdPaceSecondsPerKm}
                onChange={onChange}
              />
            </View>
          ) : null}
          {showSwimming ? (
            <View className="gap-2">
              <PaceSecondsField
                id="athlete-baseline-css"
                label={`${metric.css.label} (Optional)`}
                valueSeconds={value.cssSecondsPer100m}
                onChangeSeconds={(nextValue) => emit("cssSecondsPer100m", nextValue)}
                helperText="Enter pace in mm:ss per 100 meters."
                placeholder="1:45"
                unitLabel="/100m"
              />
              <MetricSourceRow
                field="cssSecondsPer100m"
                hasValue={value.cssSecondsPer100m !== null}
                source={sources.cssSecondsPer100m}
                onChange={onChange}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
