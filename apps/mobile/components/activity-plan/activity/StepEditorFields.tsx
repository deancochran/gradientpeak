import {
  type ActivityPlanDraftStep,
  type ActivityPlanDraftTarget,
  type ActivityTargetCategory,
  activityPlanDraftStepSchema,
  activityPlanDraftTargetSchema,
  activityPlanDurationSchema,
  activityPlanStepNoteSchema,
  activityPlanTargetSchema,
  activityTargetUnitLabels,
  getActivityPlanStepTargetEditorPolicy,
  getActivityPlanStepTargetInputPolicy,
  getActivityPlanTargetTypeDefault,
  getActivityTargetCadenceUnitLabel,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
  kilometersPerHourToPaceSeconds,
  normalizeActivityPlanSpeedTargetIntensity,
  paceSecondsPerKilometerToKilometersPerHour,
  parsePace,
  resolveActivityPlanDraft,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { ChoiceField } from "@repo/ui/components/choice-field";
import { Form } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { NativeQuantityInput } from "@repo/ui/components/native-quantity-input";
import { PaceInput } from "@repo/ui/components/pace-input";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import * as Haptics from "expo-haptics";
import { X } from "lucide-react-native";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import {
  type StepDurationDraft,
  StepDurationField,
  type StepDurationValue,
} from "./StepDurationField";

export interface StepEditorFieldsHandle {
  validate: () => ActivityPlanDraftStep | null | undefined;
  settle: () => void;
  cancel: () => void;
}

interface StepEditorFieldsProps {
  ref?: Ref<StepEditorFieldsHandle>;
  step: ActivityPlanDraftStep;
  onDirtyChange: (dirty: boolean) => void;
  activityCategory: ActivityTargetCategory;
}

const formSchema = z.object({
  name: activityPlanDraftStepSchema.shape.name,
  duration: activityPlanDurationSchema.nullable(),
  targets: z.array(activityPlanDraftTargetSchema).max(3),
  instructions: activityPlanStepNoteSchema,
});

const targetTypeLabel: Record<ActivityPlanDraftTarget["type"], string> = {
  watts: "Power · watts",
  "%FTP": "Power · FTP %",
  bpm: "Heart rate · bpm",
  "%MaxHR": "Heart rate · Max HR %",
  "%ThresholdHR": "Heart rate · Threshold HR %",
  speed: "Speed · km/h",
  cadence: "Cadence",
  RPE: "RPE",
  rest: "Rest",
};

function targetTypePresentationLabel(
  type: ActivityPlanDraftTarget["type"],
  activityCategory: ActivityTargetCategory,
): string {
  if (type === "speed" && activityCategory === "run") return "Pace";
  if (type === "cadence") return `Cadence · ${getActivityTargetCadenceUnitLabel(activityCategory)}`;
  return targetTypeLabel[type];
}

function targetTypeSelectedLabel(
  type: ActivityPlanDraftTarget["type"],
  activityCategory: ActivityTargetCategory,
): string {
  if (type === "%ThresholdHR") return "Threshold HR";
  if (type === "%MaxHR") return "Max HR";
  if (type === "%FTP") return "FTP";
  if (type === "cadence") return "Cadence";
  return targetTypePresentationLabel(type, activityCategory);
}

const normalizeOptionalText = (value: string | undefined) => value?.trim() || undefined;

export function toStepEditorTargets(targets: ActivityPlanDraftTarget[]): ActivityPlanDraftTarget[] {
  return targets.map((target) => ({ ...target }));
}
export function fromStepEditorTargets(
  targets: ActivityPlanDraftTarget[],
): ActivityPlanDraftTarget[] {
  return targets.map((target) => ({ ...target }));
}

function paceTextForSpeed(kilometersPerHour: number): string | null {
  if (!Number.isFinite(kilometersPerHour) || kilometersPerHour <= 0) return null;
  const seconds = kilometersPerHourToPaceSeconds(kilometersPerHour);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Full-screen step form: all applicable fields remain visible in the one transaction. */
export function StepEditorFields({
  ref,
  step,
  onDirtyChange,
  activityCategory,
}: StepEditorFieldsProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const invalidExactEntries = useRef(new Set<string>());
  const targetDrafts = useRef(new Map<string, string>());
  const durationDraft = useRef<StepDurationDraft>({});
  const durationRef = useRef<{
    focus: () => void;
    settle?: () => void;
    cancel?: () => void;
    validate?: () => boolean;
  }>(null);
  const targetRefs = useRef(
    new Map<string, { focus: () => void; settle?: () => void; cancel?: () => void }>(),
  );
  const [, refreshValidity] = useState(0);
  const form = useZodForm({
    schema: formSchema,
    defaultValues: {
      name: step.name || "",
      duration: step.duration,
      targets: toStepEditorTargets(step.targets || []),
      instructions: step.instructions ?? "",
    },
  });
  const {
    fields: targetFields,
    append,
    remove,
  } = useFieldArray({ control: form.control, name: "targets" });
  const duration = form.watch("duration");
  const targets = form.watch("targets");
  const [selectedDurationType, setSelectedDurationType] = useState<
    StepDurationValue["type"] | null
  >(step.duration?.type ?? null);
  const dirty = form.formState.isDirty || invalidExactEntries.current.size > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const targetSelectionPolicy = getActivityPlanStepTargetEditorPolicy({
    activityCategory,
    durationType: selectedDurationType,
  });
  const targetValuePolicy = getActivityPlanStepTargetEditorPolicy({
    activityCategory,
    durationType: duration?.type,
  });
  const permittedTargetTypes: readonly ActivityPlanDraftTarget["type"][] =
    duration?.type === "repetitions" ? ["RPE"] : getPermissibleTargetTypes(activityCategory);
  const hasRestTarget = targets.some((target) => target.type === "rest");
  const selectableTargetTypes =
    duration?.type === "repetitions"
      ? targetValuePolicy.selectableTargetTypes
      : targetSelectionPolicy.selectableTargetTypes;
  const targetTypeOptions = (currentType: ActivityPlanDraftTarget["type"]) => [
    ...(currentType === "rest" && !selectableTargetTypes.includes("rest")
      ? [
          {
            value: "rest" as const,
            label: targetTypePresentationLabel("rest", activityCategory),
            disabled: true,
          },
        ]
      : []),
    ...selectableTargetTypes.map((type) => ({
      value: type,
      label: targetTypePresentationLabel(type, activityCategory),
      selectedLabel: targetTypeSelectedLabel(type, activityCategory),
    })),
  ];
  const maximumTargets = targetValuePolicy.maximumTargets;
  const setExactEntryValidity = (key: string, invalid: boolean) => {
    if (invalid) invalidExactEntries.current.add(key);
    else invalidExactEntries.current.delete(key);
    refreshValidity((current) => current + 1);
  };
  const settle = () => {
    durationRef.current?.settle?.();
    for (const target of targetRefs.current.values()) target.settle?.();
  };
  const cancel = () => {
    durationRef.current?.cancel?.();
    for (const target of targetRefs.current.values()) target.cancel?.();
  };
  const changeTargetType = (index: number, nextValue: string) => {
    const next = nextValue as ActivityPlanDraftTarget["type"];
    const current = targets[index];
    if (!current || next === current.type) return;
    if (next === "rest" && !targetSelectionPolicy.restAllowed) {
      setSaveError("Rest is available only for a timed step.");
      return;
    }
    if (!permittedTargetTypes.includes(next)) {
      setSaveError(`${next} is not supported for ${activityCategory}.`);
      return;
    }
    if (targets.some((target, targetIndex) => targetIndex !== index && target.type === next)) {
      setSaveError("Each target type can only be used once per step.");
      return;
    }
    const replacement =
      next === "rest"
        ? { type: "rest" as const }
        : getActivityPlanTargetTypeDefault(next, activityCategory);
    if (next === "rest") {
      form.setValue("targets", [replacement], { shouldDirty: true, shouldValidate: true });
      // Keep the author's chosen duration visible. Rest requires time at validation,
      // but selecting it must not silently replace a distance/repetition prescription.
    } else {
      form.setValue(`targets.${index}` as never, replacement as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    const id = targetFields[index]?.id;
    if (id) {
      targetDrafts.current.delete(id);
      setExactEntryValidity(`target-${id}`, false);
    }
    setSaveError(null);
  };
  const removeTarget = (index: number) => {
    const id = targetFields[index]?.id;
    if (id) {
      targetDrafts.current.delete(id);
      setExactEntryValidity(`target-${id}`, false);
    }
    remove(index);
    setSaveError(null);
  };
  const addTarget = () => {
    if (targetFields.length >= maximumTargets) return;
    const available = selectableTargetTypes.find(
      (type) => !targets.some((target) => target.type === type),
    );
    if (!available) return;
    append(
      available === "rest"
        ? { type: "rest" }
        : getActivityPlanTargetTypeDefault(available, activityCategory),
    );
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };
  const validate = () => {
    settle();
    const values = form.getValues();
    const note = activityPlanStepNoteSchema.safeParse(values.instructions);
    if (!note.success) {
      setSaveError(note.error.issues[0]?.message ?? "Correct the step note before saving.");
      return null;
    }
    const result = formSchema.safeParse({
      ...values,
      name: normalizeOptionalText(values.name),
      instructions: normalizeOptionalText(values.instructions),
    });
    if (!result.success) {
      setSaveError("Check the completion and target values before saving.");
      return null;
    }
    if (!result.data.duration) {
      if (!durationRef.current?.validate?.())
        setSaveError("Choose a completion type and value before saving.");
      return null;
    }
    if (invalidExactEntries.current.size) {
      setSaveError("Finish or correct the exact value before saving.");
      return null;
    }
    for (const target of result.data.targets) {
      if (target.type === "rest") {
        if (result.data.targets.length !== 1 || result.data.duration?.type !== "time") {
          setSaveError("Rest must be the only target on a timed step.");
          return null;
        }
        continue;
      }
      if (
        target.type === "speed" &&
        activityCategory === "run" &&
        target.intensity !== null &&
        target.intensity <= 0
      ) {
        setSaveError(
          "A zero speed target cannot be represented as pace. Choose a positive pace or another target type.",
        );
        return null;
      }
      if (target.intensity === null || !activityPlanTargetSchema.safeParse(target).success) {
        setSaveError("Enter a valid target value before saving.");
        return null;
      }
      if (!isTargetTypePermittedForActivity({ activityCategory, targetType: target.type })) {
        setSaveError(`${target.type} is not permitted for ${activityCategory}.`);
        return null;
      }
      if (target.type === "RPE" && !Number.isInteger(target.intensity * 2)) {
        setSaveError("Choose an RPE in half-point increments from 1 to 10.");
        return null;
      }
      if (
        ["bpm", "%FTP", "%MaxHR", "%ThresholdHR"].includes(target.type) &&
        !Number.isInteger(target.intensity)
      ) {
        setSaveError("Heart rate and percentage targets must use whole numbers.");
        return null;
      }
    }
    if (
      result.data.duration.type === "distance" &&
      !Number.isInteger(result.data.duration.meters)
    ) {
      setSaveError("Meters must be a whole number. Choose kilometers for decimal distances.");
      return null;
    }
    const saved: ActivityPlanDraftStep = {
      type: "step",
      id: step.id,
      duration: result.data.duration,
      targets: fromStepEditorTargets(result.data.targets),
      ...(normalizeOptionalText(result.data.name)
        ? { name: normalizeOptionalText(result.data.name) }
        : {}),
      ...(normalizeOptionalText(result.data.instructions)
        ? { instructions: normalizeOptionalText(result.data.instructions) }
        : {}),
    };
    if (saved.targets.every((target) => target.type === "rest" || target.intensity !== null)) {
      const resolution = resolveActivityPlanDraft({
        version: 5,
        activity_category: activityCategory,
        items: [saved],
      });
      if (resolution.status !== "valid") {
        setSaveError(resolution.issues[0] ?? "Fix step inputs.");
        return null;
      }
    }
    setSaveError(null);
    return saved;
  };
  useImperativeHandle(ref, () => ({ validate, settle, cancel }));

  return (
    <View className="gap-4" testID="step-editor-fields">
      <Form {...form}>
        <View className="gap-2 border-b border-border pb-3" testID="step-details-section">
          <View className="flex-row items-center gap-3">
            <Text className="w-32 shrink-0 text-sm">Name (optional)</Text>
            <Controller
              control={form.control}
              name="name"
              render={({ field }) => (
                <Input
                  accessibilityLabel="Name (optional)"
                  className="flex-1 rounded-lg bg-card dark:bg-card"
                  style={{ minHeight: 44 }}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  value={field.value}
                />
              )}
            />
          </View>
          <View className="flex-row items-center gap-3" testID="step-notes-section">
            <Text className="w-32 shrink-0 text-sm">Cue (optional)</Text>
            <Controller
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <Input
                  accessibilityLabel="Coaching cue (optional)"
                  className="flex-1 rounded-lg bg-card dark:bg-card"
                  style={{ minHeight: 44 }}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  testID="step-notes-input"
                  value={field.value}
                />
              )}
            />
          </View>
        </View>
      </Form>
      <View testID="step-duration-section">
        <Form {...form}>
          <StepDurationField
            ref={durationRef}
            form={form}
            draft={durationDraft.current}
            activityCategory={activityCategory}
            lockToTime={hasRestTarget}
            onSelectedTypeChange={setSelectedDurationType}
            onExactEntryInvalidChange={(invalid) => setExactEntryValidity("duration", invalid)}
          />
        </Form>
      </View>
      <View className="gap-3" testID="step-intensity-section">
        {targetFields.map((targetField, index) => {
          const target = targets[index];
          if (!target) return null;
          if (target.type === "rest") {
            return (
              <View key={targetField.id} testID={`target-row-${index}`} className="gap-2 py-2">
                <View className="flex-row items-center gap-2" testID={`target-controls-${index}`}>
                  <View className="w-[132px] shrink-0">
                    <ChoiceField
                      density="compact"
                      required
                      label={targetFields.length === 1 ? "Target type" : `Target ${index + 1} type`}
                      hideVisibleLabel
                      nativePresentation="searchable"
                      retainDisabledValue
                      value="rest"
                      options={targetTypeOptions("rest")}
                      onChange={(value) => changeTargetType(index, value)}
                    />
                  </View>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    accessibilityLabel={`Remove target ${index + 1}`}
                    onPress={() => removeTarget(index)}
                  >
                    <Icon as={X} size={18} className="text-foreground" />
                  </Button>
                </View>
              </View>
            );
          }
          const targetInputPolicy = getActivityPlanStepTargetInputPolicy(target.type);
          const key = `target-${targetField.id}`;
          return (
            <View key={targetField.id} testID={`target-row-${index}`} className="gap-2 py-2">
              <View className="flex-row items-center gap-2" testID={`target-controls-${index}`}>
                <View className="w-[132px] shrink-0">
                  <ChoiceField
                    density="compact"
                    required
                    label={targetFields.length === 1 ? "Target type" : `Target ${index + 1} type`}
                    hideVisibleLabel
                    nativePresentation="searchable"
                    value={target.type}
                    options={targetTypeOptions(target.type)}
                    onChange={(value) => changeTargetType(index, value)}
                  />
                </View>
                <View className="min-w-[96px] flex-1">
                  <Controller
                    control={form.control}
                    name={`targets.${index}.intensity` as never}
                    render={({ field }) =>
                      target.type === "RPE" ? (
                        <ChoiceField
                          density="compact"
                          hideVisibleLabel
                          label={
                            targetFields.length === 1
                              ? "Target value"
                              : `Target ${index + 1} value RPE`
                          }
                          nativePresentation="menu"
                          value={target.intensity === null ? "" : String(target.intensity)}
                          options={[
                            { value: "", label: "Choose…" },
                            ...Array.from({ length: 19 }, (_, optionIndex) => ({
                              value: String(1 + optionIndex / 2),
                              label: String(1 + optionIndex / 2),
                            })),
                          ]}
                          onChange={(value) => {
                            const intensity = Number(value);
                            if (
                              activityPlanTargetSchema.safeParse({ type: "RPE", intensity }).success
                            )
                              field.onChange(intensity);
                          }}
                        />
                      ) : target.type === "speed" && activityCategory === "run" ? (
                        <>
                          <PaceInput
                            ref={(handle) => {
                              if (handle) targetRefs.current.set(key, handle);
                              else targetRefs.current.delete(key);
                            }}
                            label={
                              targetFields.length === 1 ? "Target pace" : `Target ${index + 1} pace`
                            }
                            layout="ms"
                            presentation="native-overlay"
                            triggerVariant="value"
                            required
                            unitLabel="/km"
                            value={paceTextForSpeed(field.value) ?? ""}
                            onChange={(value) => {
                              try {
                                setExactEntryValidity(key, parsePace(value) <= 0);
                              } catch {
                                setExactEntryValidity(key, true);
                              }
                            }}
                            onPaceSecondsChange={(seconds) => {
                              const intensity =
                                seconds === undefined || seconds <= 0
                                  ? undefined
                                  : paceSecondsPerKilometerToKilometersPerHour(seconds);
                              if (
                                intensity === undefined ||
                                !activityPlanTargetSchema.safeParse({ type: "speed", intensity })
                                  .success
                              ) {
                                setExactEntryValidity(key, true);
                                return;
                              }
                              const normalized =
                                normalizeActivityPlanSpeedTargetIntensity(intensity);
                              if (normalized.success) {
                                field.onChange(normalized.intensity);
                                setExactEntryValidity(key, false);
                              } else setExactEntryValidity(key, true);
                            }}
                          />
                          {target.intensity !== null && target.intensity <= 0 ? (
                            <Text accessibilityRole="alert" className="text-sm text-destructive">
                              This saved zero speed cannot be shown as pace. Choose a positive pace
                              or another target type before saving.
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <NativeQuantityInput
                          required
                          ref={(handle) => {
                            if (handle) targetRefs.current.set(key, handle);
                            else targetRefs.current.delete(key);
                          }}
                          presentation="overlay"
                          decimals={
                            typeof targetInputPolicy.precision === "object"
                              ? targetInputPolicy.precision.maxDecimalPlaces
                              : 0
                          }
                          label={
                            targetFields.length === 1 ? "Target value" : `Target ${index + 1} value`
                          }
                          unitLabel={
                            target.type === "cadence"
                              ? getActivityTargetCadenceUnitLabel(activityCategory)
                              : activityTargetUnitLabels[target.type]
                          }
                          triggerVariant="value"
                          min={targetInputPolicy.pickerMinimum}
                          max={target.type === "%MaxHR" ? 100 : targetInputPolicy.maximum}
                          value={
                            targetDrafts.current.get(targetField.id) ??
                            (field.value === null ? "" : String(field.value))
                          }
                          onChange={(raw) => targetDrafts.current.set(targetField.id, raw)}
                          onNumberChange={(value) => {
                            if (value !== undefined) {
                              field.onChange(value);
                              setExactEntryValidity(key, false);
                            }
                          }}
                          onInvalidChange={(invalid) =>
                            setExactEntryValidity(key, target.intensity === null ? false : invalid)
                          }
                          testId={`target-value-${index}`}
                        />
                      )
                    }
                  />
                </View>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  accessibilityLabel={`Remove target ${index + 1}`}
                  onPress={() => removeTarget(index)}
                >
                  <Icon as={X} size={18} className="text-foreground" />
                </Button>
              </View>
            </View>
          );
        })}
        {targetFields.length < maximumTargets &&
        !targets.some((target) => target.type === "rest") ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 self-start px-2"
            accessibilityLabel="Add target"
            onPress={addTarget}
          >
            <Text>{targetFields.length === 0 ? "Add target" : "Add another target"}</Text>
          </Button>
        ) : null}
      </View>
      {saveError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}
