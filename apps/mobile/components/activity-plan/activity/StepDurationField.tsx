import {
  ACTIVITY_PLAN_LIMITS,
  activityPlanDurationSchema,
  type CanonicalActivityCategory,
  completionTypeChoices,
  createActivityPlanStepDuration,
  getPermissibleActivityPlanDurationTypes,
} from "@repo/core";
import { parseNumberOrUndefined } from "@repo/core/utils/fitness-inputs";
import { ChoiceField } from "@repo/ui/components/choice-field";
import { NativeQuantityInput } from "@repo/ui/components/native-quantity-input";
import { SegmentedDurationField } from "@repo/ui/components/segmented-duration-field";
import type { DurationSegments } from "@repo/ui/components/segmented-duration-field/shared";
import { Text } from "@repo/ui/components/text";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import type { StepDurationValue } from "./stepDurationValues";

export type { StepDurationValue } from "./stepDurationValues";
export type DurationFormShape = { duration: StepDurationValue | null };
type EditableDurationType = "time" | "distance" | "repetitions";
type DurationFormAdapter = {
  getValues: () => DurationFormShape;
  setValue: (
    name: "duration",
    value: StepDurationValue | null,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
  ) => void;
};
export interface StepDurationDraft {
  unit?: string;
  invalid?: boolean;
  segments?: DurationSegments;
  exact?: string;
  exactByType?: Partial<Record<"distance" | "repetitions", string>>;
}

/**
 * The step screen owns one transaction. Completion type and its value are deliberately
 * rendered together; native pickers may open their OS UI, but there is no field editor.
 */
export function StepDurationField({
  ref,
  form,
  activityCategory = "run",
  onExactEntryInvalidChange,
  onSelectedTypeChange,
  lockToTime = false,
  active = true,
  draft,
}: {
  ref?: Ref<{ focus: () => void; settle?: () => void; cancel?: () => void }>;
  form: DurationFormAdapter;
  activityCategory?: CanonicalActivityCategory;
  onExactEntryInvalidChange?: (invalid: boolean) => void;
  onSelectedTypeChange?: (type: EditableDurationType | null) => void;
  /** A rest target is only meaningful for timed steps; old mismatches stay repairable. */
  lockToTime?: boolean;
  /** Retained for compatibility with callers that previously rendered a compact editor. */
  compact?: boolean;
  active?: boolean;
  draft?: StepDurationDraft;
  portalHost?: string;
  isCurrent?: () => boolean;
  editor?: "value" | "type" | "unit";
  onEditorChange?: (editor: "value" | "type" | "unit") => void;
  onUnitChange?: (unit: string) => void;
}) {
  const duration = form.getValues().duration;
  const mounted = useRef(true);
  const valueRef = useRef<{ focus: () => void; settle?: () => void; cancel?: () => void }>(null);
  const [unit, setLocalUnit] = useState(
    () =>
      draft?.unit ?? (duration?.type === "distance" && duration.meters >= 1000 ? "km" : "meters"),
  );
  const [countDraft, setCountDraft] = useState(
    () => draft?.exact ?? (duration?.type === "repetitions" ? String(duration.count) : ""),
  );
  const [distanceDraft, setDistanceDraft] = useState(() => draft?.exactByType?.distance);
  const [invalid, setLocalInvalid] = useState(draft?.invalid ?? false);
  const [valueTouched, setValueTouched] = useState(false);
  const permitted = getPermissibleActivityPlanDurationTypes(activityCategory);
  const [selectedType, setSelectedType] = useState<EditableDurationType | null>(() =>
    duration && permitted.includes(duration.type as EditableDurationType)
      ? (duration.type as EditableDurationType)
      : null,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // Canonical form updates (including an existing-step reset) own the selected type.
    // A null duration is deliberately not synced: it is the explicit-entry state after
    // choosing time or distance, and must keep that value row visible.
    if (duration && permitted.includes(duration.type as EditableDurationType))
      setSelectedType(duration.type as EditableDurationType);
  }, [duration, permitted]);
  useEffect(() => onSelectedTypeChange?.(selectedType), [onSelectedTypeChange, selectedType]);
  useImperativeHandle(ref, () => ({
    focus: () => valueRef.current?.focus?.(),
    settle: () => valueRef.current?.settle?.(),
    cancel: () => valueRef.current?.cancel?.(),
    validate: () => {
      if (selectedType !== null && duration === null) {
        setValueTouched(true);
        setInvalid(true);
        return true;
      }
      return false;
    },
  }));
  const usable = () => mounted.current && active;
  const setInvalid = (next: boolean) => {
    if (!usable()) return;
    if (draft) draft.invalid = next;
    setLocalInvalid(next);
    onExactEntryInvalidChange?.(next);
  };
  const setDuration = (next: StepDurationValue | null) => {
    if (!usable()) return;
    setInvalid(false);
    setValueTouched(false);
    form.setValue("duration", next, { shouldDirty: true, shouldValidate: true });
  };
  const setUnit = (next: string) => {
    // Do not reinterpret an invalid value in another unit. The user must first resolve the
    // visible invalid quantity, rather than seeing the prior canonical distance reappear.
    if (invalid) return;
    if (draft) {
      draft.unit = next;
      delete draft.exact;
      delete draft.exactByType?.distance;
    }
    setLocalUnit(next);
  };
  const chooseType = (nextType: string) => {
    if (!usable()) return;
    const type = permitted.find((candidate) => candidate === nextType);
    if (!type || (lockToTime && type !== "time") || type === duration?.type) return;
    if (draft) {
      delete draft.segments;
      delete draft.exact;
      draft.invalid = false;
    }
    setInvalid(false);
    setSelectedType(type);
    if (type === "repetitions") {
      const count = 1;
      setCountDraft(String(count));
      setDuration(createActivityPlanStepDuration(type, count));
    } else {
      // A changed numeric prescription must be explicitly entered; do not carry the old unit/value.
      form.setValue("duration", null, { shouldDirty: true, shouldValidate: true });
      if (type === "distance") {
        setDistanceDraft(undefined);
        setUnit("km");
      }
    }
  };
  const options = completionTypeChoices
    .filter((option) => permitted.includes(option.type as (typeof permitted)[number]))
    .filter(
      (option, index, all) =>
        all.findIndex((candidate) => candidate.type === option.type) === index,
    )
    .map((option) => ({
      value: option.type,
      label: option.type === "distance" ? "Distance" : option.label,
      ...(option.type === "repetitions" ? { selectedLabel: "Reps" } : {}),
      disabled: lockToTime && option.type !== "time",
    }));

  return (
    <View className="gap-2" testID="step-duration-field">
      {duration && !permitted.some((type) => type === duration.type) ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {duration.type} is not permitted for new {activityCategory} activity plans. Choose a
          supported completion type; the existing value is retained.
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2" testID="completion-type-row">
        <View className="w-[112px] shrink-0">
          <ChoiceField
            density="compact"
            required={false}
            label="Duration type"
            hideVisibleLabel
            nativePresentation="searchable"
            placeholder="Duration type"
            value={selectedType ?? ""}
            options={options}
            disabled={!active}
            onChange={chooseType}
          />
        </View>
        {selectedType === null ? (
          <Text className="min-h-12 flex-1 pt-3 text-sm text-muted-foreground">Choose a value</Text>
        ) : selectedType === "time" ? (
          <View className="min-w-[96px] flex-1">
            <SegmentedDurationField
              ref={valueRef}
              label="Duration value"
              presentation="native-overlay"
              triggerVariant="value"
              maxSeconds={ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds}
              required={false}
              active={active}
              {...(draft?.segments ? { segments: draft.segments } : {})}
              valueSeconds={duration?.type === "time" ? duration.seconds : undefined}
              onSegmentsChange={(segments) => {
                if (draft && usable()) draft.segments = segments;
              }}
              onChangeSeconds={(seconds) =>
                setDuration(createActivityPlanStepDuration("time", seconds))
              }
              onEmpty={() => {
                setValueTouched(true);
                setDuration(null);
                setInvalid(true);
              }}
              onInvalidChange={setInvalid}
            />
          </View>
        ) : selectedType === "repetitions" ? (
          <View className="min-w-[96px] flex-1">
            <NativeQuantityInput
              required
              showError={false}
              ref={valueRef}
              presentation="overlay"
              id="step-duration-repetitions"
              testId="step-duration-value"
              label="Duration value"
              unitLabel="reps"
              triggerVariant="value"
              min={1}
              max={ACTIVITY_PLAN_LIMITS.maxStepRepetitionCount}
              decimals={0}
              clampProjection={false}
              disabled={!active}
              showAdjustmentButtons={false}
              value={draft?.exact ?? draft?.exactByType?.repetitions ?? countDraft}
              onChange={(raw) => {
                if (!usable()) return;
                setValueTouched(true);
                setCountDraft(raw);
                if (draft) {
                  draft.exact = raw;
                  draft.exactByType = { ...draft.exactByType, repetitions: raw };
                }
                setInvalid(
                  !activityPlanDurationSchema.safeParse({
                    type: "repetitions",
                    count: parseNumberOrUndefined(raw),
                  }).success,
                );
              }}
              onNumberChange={(count) => {
                if (
                  count !== undefined &&
                  activityPlanDurationSchema.safeParse({ type: "repetitions", count }).success
                )
                  setDuration(createActivityPlanStepDuration("repetitions", count));
              }}
            />
          </View>
        ) : (
          <>
            <View className="min-w-[80px] flex-1" testID="distance-value-unit-row">
              <NativeQuantityInput
                ref={valueRef}
                required
                showError={false}
                presentation="overlay"
                label="Duration value"
                unitLabel={unit === "km" ? "km" : "m"}
                triggerVariant="value"
                min={unit === "km" ? 0 : 1}
                max={
                  unit === "km"
                    ? ACTIVITY_PLAN_LIMITS.maxStepDistanceMeters / 1000
                    : ACTIVITY_PLAN_LIMITS.maxStepDistanceMeters
                }
                decimals={unit === "km" ? 3 : 0}
                precision={unit === "km" ? "decimal" : "integer"}
                disabled={!active}
                testId="step-duration-value"
                value={
                  distanceDraft ??
                  (duration?.type === "distance"
                    ? String(unit === "km" ? duration.meters / 1000 : duration.meters)
                    : "")
                }
                onChange={(raw) => {
                  setValueTouched(true);
                  setDistanceDraft(raw);
                  if (draft) draft.exactByType = { ...draft.exactByType, distance: raw };
                  const value = Number(raw);
                  const meters = unit === "km" ? value * 1000 : value;
                  setInvalid(
                    !activityPlanDurationSchema.safeParse({ type: "distance", meters }).success,
                  );
                }}
                onNumberChange={(value) => {
                  if (value === undefined) return;
                  const meters = unit === "km" ? value * 1000 : value;
                  const next = createActivityPlanStepDuration("distance", meters);
                  if (activityPlanDurationSchema.safeParse(next).success) {
                    setDistanceDraft(undefined);
                    if (draft) delete draft.exactByType?.distance;
                    setDuration(next);
                  } else setInvalid(true);
                }}
                onInvalidChange={(nextInvalid) => {
                  // A zero kilometer picker selection is syntactically valid for the shared
                  // numeric control but not a valid step distance. Its semantic invalidity
                  // is set above and must not be cleared by that lower-level result.
                  if (nextInvalid) setInvalid(true);
                }}
              />
            </View>
            <View className="w-[72px] shrink-0">
              <ChoiceField
                density="compact"
                label="Distance unit"
                hideVisibleLabel
                nativePresentation="searchable"
                value={unit === "km" ? "km" : "meters"}
                options={[
                  { label: "Kilometers", selectedLabel: "km", value: "km" },
                  { label: "Meters", selectedLabel: "m", value: "meters" },
                ]}
                disabled={!active}
                onChange={setUnit}
              />
            </View>
          </>
        )}
      </View>
      {invalid && valueTouched ? (
        <Text accessibilityRole="alert" className="text-destructive">
          Correct the completion value before saving.
        </Text>
      ) : null}
    </View>
  );
}
