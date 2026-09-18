import {
  ACTIVITY_PLAN_LIMITS,
  activityPlanDurationSchema,
  type CanonicalActivityCategory,
  getPermissibleActivityPlanDurationTypes,
} from "@repo/core";
import { parseNumberOrUndefined } from "@repo/core/utils/fitness-inputs";
import { numericUxPolicies } from "@repo/core/utils/numeric-ux-policy";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Input } from "@repo/ui/components/input";
import { NativePicker } from "@repo/ui/components/native-picker";
import { NumberSliderInput } from "@repo/ui/components/number-slider-input";
import { SegmentedDurationField } from "@repo/ui/components/segmented-duration-field";
import type { DurationSegments } from "@repo/ui/components/segmented-duration-field/shared";
import type { Option } from "@repo/ui/components/select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { durationForType, fromUIValue, type StepDurationValue } from "./stepDurationValues";

const TIME_UNITS: Option[] = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
];
const DISTANCE_UNITS: Option[] = [
  { value: "meters", label: "Meters" },
  { value: "km", label: "Kilometers" },
];
const DURATION_TYPES: Option[] = [
  { value: "time", label: "Time" },
  { value: "distance", label: "Distance" },
  { value: "repetitions", label: "Repetitions" },
  { value: "untilFinished", label: "Until finished" },
];

export type { StepDurationValue } from "./stepDurationValues";

export type DurationFormShape = { duration: StepDurationValue };
type DurationFormAdapter = {
  getValues: () => DurationFormShape;
  setValue: (
    name: "duration",
    value: StepDurationValue,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
  ) => void;
};

export interface StepDurationDraft {
  unit?: string;
  invalid?: boolean;
  segments?: DurationSegments;
  exact?: string;
}

function defaultUnit(duration: StepDurationValue) {
  if (duration.type === "time") return duration.seconds % 60 === 0 ? "minutes" : "seconds";
  if (duration.type === "distance") return duration.meters >= 1000 ? "km" : "meters";
  return "reps";
}

function defaultUnitForType(type: StepDurationValue["type"]) {
  return type === "time" ? "minutes" : type === "distance" ? "km" : "reps";
}

function displayValue(duration: StepDurationValue, unit: string) {
  if (duration.type === "time") {
    return unit === "hours"
      ? duration.seconds / 3600
      : unit === "minutes"
        ? duration.seconds / 60
        : duration.seconds;
  }
  if (duration.type === "distance") return unit === "km" ? duration.meters / 1000 : duration.meters;
  return duration.type === "repetitions" ? duration.count : 0;
}

function unitsFor(duration: StepDurationValue): Option[] {
  if (duration.type === "time") return TIME_UNITS;
  if (duration.type === "distance") return DISTANCE_UNITS;
  return [];
}

export function StepDurationField({
  ref,
  form,
  activityCategory = "run",
  onExactEntryInvalidChange,
  compact = false,
  active = true,
  draft,
  portalHost,
  isCurrent,
}: {
  ref?: Ref<{ focus: () => void }>;
  form: DurationFormAdapter;
  activityCategory?: CanonicalActivityCategory;
  onExactEntryInvalidChange?: (invalid: boolean) => void;
  compact?: boolean;
  active?: boolean;
  draft?: StepDurationDraft;
  portalHost?: string;
  isCurrent?: () => boolean;
}) {
  const duration = form.getValues().duration;
  const valueRef = useRef<{ focus: () => void; settle?: () => void; cancel?: () => void }>(null);
  const [countDraft, setCountDraft] = useState(
    () => draft?.exact ?? (duration.type === "repetitions" ? String(duration.count) : ""),
  );
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (
        !compact ||
        duration.type === "distance" ||
        isExactEntryInvalid ||
        !activityPlanDurationSchema.safeParse(duration).success
      )
        valueRef.current?.focus?.();
    },
    settle: () => valueRef.current?.settle?.(),
    cancel: () => valueRef.current?.cancel?.(),
  }));
  const permitted = getPermissibleActivityPlanDurationTypes(activityCategory);
  const isPermitted = permitted.some((type) => type === duration.type);
  const [unit, setLocalUnit] = useState(() => draft?.unit ?? defaultUnit(duration));
  const setUnit = (next: string) => {
    if (draft) {
      draft.unit = next;
      delete draft.exact;
    }
    setLocalUnit(next);
  };
  const previousDurationType = useRef(duration.type);
  const [isExactEntryInvalid, setLocalInvalid] = useState(draft?.invalid ?? false);
  const setIsExactEntryInvalid = (invalid: boolean) => {
    if (draft) draft.invalid = invalid;
    setLocalInvalid(invalid);
  };

  useEffect(() => {
    if (previousDurationType.current !== duration.type) {
      previousDurationType.current = duration.type;
      const next = defaultUnitForType(duration.type);
      setLocalUnit(next);
      if (draft) {
        draft.unit = next;
        delete draft.exact;
      }
    }
  }, [duration.type, draft]);

  const setDuration = (next: StepDurationValue) => {
    if (!active || (isCurrent && !isCurrent())) return;
    onExactEntryInvalidChange?.(false);
    form.setValue("duration", next, { shouldDirty: true, shouldValidate: true });
  };
  const requestType = (type: StepDurationValue["type"], nextUnit?: string) => {
    if (type === duration.type) return;
    if (!permitted.some((candidate) => candidate === type)) return;
    if (isExactEntryInvalid) {
      valueRef.current?.focus?.();
      return;
    }
    valueRef.current?.settle?.();
    Alert.alert("Change duration type?", "The current duration value will be replaced.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Change",
        onPress: () => {
          if (!active || (isCurrent && !isCurrent())) return;
          previousDurationType.current = type;
          if (draft) delete draft.segments;
          if (type === "repetitions") setCountDraft("10");
          setUnit(nextUnit ?? defaultUnitForType(type));
          setDuration(durationForType(type));
        },
      },
    ]);
  };

  // Mode and display unit share one secondary menu. Changing a unit never rewrites the dose.
  const completionOptions = DURATION_TYPES.flatMap((option) => {
    if (!option || !permitted.some((type) => type === option.value)) return [];
    const units = option.value === "time" ? [] : option.value === "distance" ? DISTANCE_UNITS : [];
    return units.length
      ? units.flatMap((unitOption) =>
          unitOption
            ? [
                {
                  value: `${option.value}:${unitOption.value}`,
                  label: `${option.label} · ${unitOption.label}`,
                },
              ]
            : [],
        )
      : [option];
  });
  const completionMenu = compact ? (
    <NativePicker
      label="Completion mode and unit"
      value={duration.type === "distance" ? `${duration.type}:${unit}` : duration.type}
      options={completionOptions}
      {...(isCurrent ? { isCurrent } : {})}
      onChange={(value) => {
        if (isExactEntryInvalid) {
          valueRef.current?.focus?.();
          return;
        }
        const [type, nextUnit] = value.split(":");
        if (type === duration.type) {
          if (nextUnit) setUnit(nextUnit);
        } else requestType(type as StepDurationValue["type"], nextUnit);
      }}
    />
  ) : (
    <Select
      value={{
        value: duration.type === "distance" ? `${duration.type}:${unit}` : duration.type,
        label:
          DURATION_TYPES.find((option) => option?.value === duration.type)?.label ?? duration.type,
      }}
      onValueChange={(option) => {
        if (!option?.value) return;
        if (isExactEntryInvalid) {
          valueRef.current?.focus?.();
          return;
        }
        const [type, nextUnit] = option.value.split(":");
        if (type === duration.type) {
          if (nextUnit) setUnit(nextUnit);
        } else requestType(type as StepDurationValue["type"], nextUnit);
      }}
    >
      <SelectTrigger
        className="min-h-12 border-0 px-2"
        accessibilityLabel="Completion mode and unit"
        size="sm"
        testID="step-completion-menu"
      >
        <SelectValue placeholder="Completion" />
      </SelectTrigger>
      <SelectContent {...(portalHost === undefined ? {} : { portalHost })}>
        {completionOptions.map((option) => (
          <SelectItem key={option.value} value={option.value} label={option.label}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <View className="gap-2">
      {!compact ? (
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Select
              onValueChange={(option) => {
                if (option?.value) requestType(option.value as StepDurationValue["type"]);
              }}
              value={{
                label:
                  DURATION_TYPES.find((option) => option?.value === duration.type)?.label ??
                  duration.type,
                value: duration.type,
              }}
            >
              <SelectTrigger
                accessibilityLabel="Duration type"
                size="sm"
                testID="step-duration-type"
              >
                <SelectValue placeholder="Select duration type" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_TYPES.filter(
                  (option) => option && permitted.some((type) => type === option.value),
                ).map((option) =>
                  option ? (
                    <SelectItem key={option.value} label={option.label} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </View>
          {duration.type !== "repetitions" && duration.type !== "untilFinished" ? (
            <View className="w-28">
              <Select
                onValueChange={(option) => {
                  // A valid exact entry is already canonicalized before this runs. Do not discard an invalid draft.
                  if (option?.value && !isExactEntryInvalid) setUnit(option.value);
                }}
                value={{
                  label: unitsFor(duration).find((option) => option?.value === unit)?.label ?? unit,
                  value: unit,
                }}
              >
                <SelectTrigger
                  accessibilityLabel="Duration unit"
                  size="sm"
                  testID="step-duration-unit"
                >
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitsFor(duration).map((option) =>
                    option ? (
                      <SelectItem key={option.value} label={option.label} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </View>
          ) : null}
        </View>
      ) : null}

      {!isPermitted ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {duration.type} is not permitted for new {activityCategory} activity plans. Choose a
          supported duration; the existing value is retained.
        </Text>
      ) : null}

      {isExactEntryInvalid ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          Correct the exact duration before changing its type or saving.
        </Text>
      ) : null}

      {compact && duration.type === "time" ? (
        <View className="gap-2">
          <SegmentedDurationField
            ref={valueRef}
            presentation="native"
            active={active}
            {...(draft?.segments ? { segments: draft.segments } : {})}
            onSegmentsChange={(segments) => {
              if (draft) draft.segments = segments;
            }}
            {...(isCurrent ? { isCurrent } : {})}
            valueSeconds={duration.seconds}
            onChangeSeconds={(seconds) => setDuration({ type: "time", seconds })}
            onInvalidChange={(invalid) => {
              setIsExactEntryInvalid(invalid);
              // Initial validity is a status notification, not a user edit.
              if (invalid !== isExactEntryInvalid) onExactEntryInvalidChange?.(invalid);
            }}
          />
          {completionMenu}
        </View>
      ) : duration.type === "untilFinished" ? (
        compact ? (
          completionMenu
        ) : (
          <Text className="text-sm text-muted-foreground">Until finished</Text>
        )
      ) : (
        <View className="flex-row items-end gap-2">
          <View className="flex-1 gap-2">
            {duration.type === "repetitions" ? (
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  {compact ? (
                    <View className="gap-1">
                      <Text>Reps</Text>
                      <Input
                        ref={(node) => {
                          valueRef.current = node;
                        }}
                        accessibilityLabel="Reps"
                        accessibilityHint={`Whole repetitions from 1 to ${ACTIVITY_PLAN_LIMITS.maxStepRepetitionCount}`}
                        keyboardType="number-pad"
                        value={draft?.exact ?? countDraft}
                        onChangeText={(raw) => {
                          if (!active || (isCurrent && !isCurrent())) return;
                          setCountDraft(raw);
                          if (draft) draft.exact = raw;
                          const count = parseNumberOrUndefined(raw);
                          const next = { type: "repetitions" as const, count };
                          const invalid = !activityPlanDurationSchema.safeParse(next).success;
                          setIsExactEntryInvalid(invalid);
                          onExactEntryInvalidChange?.(invalid);
                          if (!invalid && count !== undefined)
                            setDuration({ type: "repetitions", count });
                        }}
                      />
                    </View>
                  ) : (
                    <BoundedNumberInput
                      ref={valueRef}
                      id="step-duration-repetitions"
                      clampProjection={false}
                      decimals={0}
                      adjustmentStep={numericUxPolicies.count.adjustmentStep}
                      showAdjustmentButtons={false}
                      label="Reps"
                      max={ACTIVITY_PLAN_LIMITS.maxStepRepetitionCount}
                      min={1}
                      onChange={(value) => {
                        const count = parseNumberOrUndefined(value);
                        const invalid =
                          count === undefined ||
                          !Number.isInteger(count) ||
                          count < 1 ||
                          count > ACTIVITY_PLAN_LIMITS.maxStepRepetitionCount;
                        setIsExactEntryInvalid(invalid);
                        onExactEntryInvalidChange?.(invalid);
                      }}
                      onNumberChange={(count) => {
                        if (count !== undefined) setDuration({ type: "repetitions", count });
                      }}
                      testId="step-duration-value"
                      value={String(duration.count)}
                    />
                  )}
                </View>
                {compact ? completionMenu : null}
              </View>
            ) : (
              <NumberSliderInput
                {...(isCurrent ? { isCurrent } : {})}
                ref={valueRef}
                key={`${duration.type}-${unit}`}
                {...(draft?.exact === undefined ? {} : { exactDraft: draft.exact })}
                onExactDraftChange={(raw) => {
                  if (draft) draft.exact = raw;
                }}
                decimals={duration.type === "time" && unit === "seconds" ? 0 : 3}
                exactValueMax={
                  duration.type === "time"
                    ? 86_400 / (unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1)
                    : 1_000_000 / (unit === "km" ? 1000 : 1)
                }
                exactValueMin={
                  duration.type === "time"
                    ? 1 / (unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1)
                    : 1 / (unit === "km" ? 1000 : 1)
                }
                adjustmentMax={
                  duration.type === "time"
                    ? 86_400 / (unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1)
                    : 1_000_000 / (unit === "km" ? 1000 : 1)
                }
                adjustmentMin={
                  duration.type === "time"
                    ? 1 / (unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1)
                    : 1 / (unit === "km" ? 1000 : 1)
                }
                inlineValueEditor
                alwaysShowInput={compact}
                compactHeader
                headerLeading={compact ? completionMenu : undefined}
                showSlider={false}
                isExactValueValid={(value) => {
                  // Unit division can be inexact (e.g. 61 seconds in hours). An unchanged
                  // display value represents the original canonical dose, not a new conversion.
                  if (value === displayValue(duration, unit))
                    return activityPlanDurationSchema.safeParse(duration).success;
                  const next = fromUIValue(duration.type, value, unit);
                  return next !== null && activityPlanDurationSchema.safeParse(next).success;
                }}
                label="Duration"
                max={
                  duration.type === "time"
                    ? unit === "hours"
                      ? 4
                      : unit === "minutes"
                        ? 120
                        : 3600
                    : unit === "km"
                      ? 10
                      : 10_000
                }
                min={
                  duration.type === "time"
                    ? Math.min(1, 1 / (unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1))
                    : Math.min(1, 1 / (unit === "km" ? 1000 : 1))
                }
                onChange={(value) => {
                  if (value === displayValue(duration, unit)) {
                    setDuration(duration);
                    return;
                  }
                  const next = fromUIValue(duration.type, value, unit);
                  if (next && activityPlanDurationSchema.safeParse(next).success) setDuration(next);
                }}
                onExactValueInvalidChange={(invalid) => {
                  setIsExactEntryInvalid(invalid);
                  onExactEntryInvalidChange?.(invalid);
                }}
                adjustmentStep={
                  duration.type === "time"
                    ? unit === "seconds"
                      ? numericUxPolicies.shortDurationSeconds.adjustmentStep
                      : unit === "minutes"
                        ? numericUxPolicies.durationMinutes.adjustmentStep
                        : numericUxPolicies.durationHours.adjustmentStep
                    : unit === "km"
                      ? numericUxPolicies.distanceKilometers.adjustmentStep
                      : numericUxPolicies.distanceMeters.adjustmentStep
                }
                showAdjustmentButtons={false}
                step={
                  duration.type === "time"
                    ? unit === "seconds"
                      ? numericUxPolicies.shortDurationSeconds.sliderStep
                      : unit === "minutes"
                        ? numericUxPolicies.durationMinutes.sliderStep
                        : numericUxPolicies.durationHours.sliderStep
                    : unit === "km"
                      ? numericUxPolicies.distanceKilometers.sliderStep
                      : numericUxPolicies.distanceMeters.sliderStep
                }
                testId={compact ? "step-duration-editor-value" : "step-duration-value"}
                unitLabel={unit === "km" ? "km" : unit}
                value={displayValue(duration, unit)}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}
