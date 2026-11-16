import {
  ACTIVITY_PLAN_LIMITS,
  activityPlanDurationSchema,
  type CanonicalActivityCategory,
  completionTypeChoices,
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
  active = true,
  draft,
}: {
  ref?: Ref<{ focus: () => void; settle?: () => void; cancel?: () => void }>;
  form: DurationFormAdapter;
  activityCategory?: CanonicalActivityCategory;
  onExactEntryInvalidChange?: (invalid: boolean) => void;
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
  useImperativeHandle(ref, () => ({
    focus: () => valueRef.current?.focus?.(),
    settle: () => valueRef.current?.settle?.(),
    cancel: () => valueRef.current?.cancel?.(),
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
    if (!type || type === duration?.type) return;
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
      setDuration({ type, count });
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
    }));

  return (
    <View className="gap-3" testID="step-duration-field">
      {duration && !permitted.some((type) => type === duration.type) ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {duration.type} is not permitted for new {activityCategory} activity plans. Choose a
          supported completion type; the existing value is retained.
        </Text>
      ) : null}
      <View testID="completion-type-row">
        <ChoiceField
          required={false}
          label="Duration type"
          nativePresentation="menu"
          value={selectedType ?? ""}
          options={options}
          disabled={!active}
          onChange={chooseType}
        />
      </View>
      {invalid ? (
        <Text accessibilityRole="alert" className="text-destructive">
          Correct the completion value before saving.
        </Text>
      ) : null}
      {selectedType === null ? (
        <Text className="text-sm text-muted-foreground">
          Choose a completion type to enter its value.
        </Text>
      ) : selectedType === "time" ? (
        <SegmentedDurationField
          ref={valueRef}
          label="Duration value"
          presentation="native-overlay"
          triggerVariant="row"
          maxSeconds={ACTIVITY_PLAN_LIMITS.maxStepDurationSeconds}
          required={false}
          active={active}
          {...(draft?.segments ? { segments: draft.segments } : {})}
          valueSeconds={duration?.type === "time" ? duration.seconds : undefined}
          onSegmentsChange={(segments) => {
            if (draft && usable()) draft.segments = segments;
          }}
          onChangeSeconds={(seconds) => setDuration({ type: "time", seconds })}
          onEmpty={() => {
            setDuration(null);
            setInvalid(true);
          }}
          onInvalidChange={setInvalid}
        />
      ) : selectedType === "repetitions" ? (
        <NativeQuantityInput
          required
          ref={valueRef}
          presentation="overlay"
          id="step-duration-repetitions"
          testId="step-duration-value"
          label="Duration value"
          unitLabel="reps"
          triggerVariant="row"
          min={1}
          max={ACTIVITY_PLAN_LIMITS.maxStepRepetitionCount}
          decimals={0}
          clampProjection={false}
          disabled={!active}
          showAdjustmentButtons={false}
          value={draft?.exact ?? draft?.exactByType?.repetitions ?? countDraft}
          onChange={(raw) => {
            if (!usable()) return;
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
              setDuration({ type: "repetitions", count });
          }}
        />
      ) : (
        <View className="flex-row flex-wrap items-end gap-3" testID="distance-value-unit-row">
          <View className="min-w-[120px] flex-1">
            <NativeQuantityInput
              ref={valueRef}
              required
              presentation="overlay"
              label="Duration value"
              unitLabel={unit === "km" ? "km" : "m"}
              triggerVariant="row"
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
                const next = { type: "distance" as const, meters };
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
          <View className="min-w-[120px] flex-1">
            <ChoiceField
              label="Distance unit"
              nativePresentation="menu"
              value={unit === "km" ? "km" : "meters"}
              options={[
                { label: "Kilometers", value: "km" },
                { label: "Meters", value: "meters" },
              ]}
              disabled={!active}
              onChange={setUnit}
            />
          </View>
        </View>
      )}
    </View>
  );
}
