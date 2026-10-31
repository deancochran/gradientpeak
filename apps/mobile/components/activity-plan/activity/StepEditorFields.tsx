import {
  type ActivityPlanDraftStep,
  type ActivityPlanDraftTarget,
  type ActivityTargetCategory,
  activityPlanDraftStepSchema,
  activityPlanDraftTargetSchema,
  activityPlanDurationSchema,
  activityPlanStepNoteSchema,
  activityPlanTargetSchema,
  activityTargetDefinitionByType,
  activityTargetUnitLabels,
  getActivityPlanTargetTypeDefault,
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
import { Form, FormTextField } from "@repo/ui/components/form";
import { NativeQuantityInput } from "@repo/ui/components/native-quantity-input";
import { PaceInput } from "@repo/ui/components/pace-input";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import * as Haptics from "expo-haptics";
import { Plus, X } from "lucide-react-native";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { type StepDurationDraft, StepDurationField } from "./StepDurationField";

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
  cadence: "Cadence · rpm",
  RPE: "RPE",
  rest: "Rest",
};

function targetTypePresentationLabel(
  type: ActivityPlanDraftTarget["type"],
  activityCategory: ActivityTargetCategory,
): string {
  return type === "speed" && activityCategory === "run" ? "Pace" : targetTypeLabel[type];
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
  const durationRef = useRef<{ focus: () => void; settle?: () => void; cancel?: () => void }>(null);
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
  const dirty = form.formState.isDirty || invalidExactEntries.current.size > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const permittedTargetTypes: readonly ActivityPlanDraftTarget["type"][] =
    duration?.type === "repetitions" ? ["RPE"] : getPermissibleTargetTypes(activityCategory);
  const maximumTargets = duration?.type === "repetitions" ? 1 : 3;
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
    if (!permittedTargetTypes.includes(next)) {
      setSaveError(`${next} is not supported for ${activityCategory}.`);
      return;
    }
    if (targets.some((target, targetIndex) => targetIndex !== index && target.type === next)) {
      setSaveError("Each target type can only be used once per step.");
      return;
    }
    const replacement =
      next === "rest" ? { type: "rest" as const } : getActivityPlanTargetTypeDefault(next);
    if (next === "rest") {
      form.setValue("targets", [replacement], { shouldDirty: true, shouldValidate: true });
      if (duration?.type !== "time") {
        form.setValue(
          "duration",
          { type: "time", seconds: 60 },
          {
            shouldDirty: true,
            shouldValidate: true,
          },
        );
      }
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
    const available = permittedTargetTypes.find(
      (type) => !targets.some((target) => target.type === type),
    );
    if (!available) return;
    append(available === "rest" ? { type: "rest" } : getActivityPlanTargetTypeDefault(available));
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
    if (invalidExactEntries.current.size) {
      setSaveError("Finish or correct the exact value before saving.");
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
    if (!result.data.duration) {
      setSaveError("Choose a completion type and value before saving.");
      return null;
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
      <View className="gap-3" testID="step-duration-section">
        <Text className="text-xs font-semibold tracking-wide text-muted-foreground">DURATION</Text>
        <Form {...form}>
          <StepDurationField
            ref={durationRef}
            form={form}
            draft={durationDraft.current}
            activityCategory={activityCategory}
            onExactEntryInvalidChange={(invalid) => setExactEntryValidity("duration", invalid)}
          />
        </Form>
      </View>
      <View className="gap-3 border-t border-border pt-4" testID="step-intensity-section">
        <Text className="text-xs font-semibold tracking-wide text-muted-foreground">INTENSITY</Text>
        {targetFields.map((targetField, index) => {
          const target = targets[index];
          if (!target) return null;
          if (target.type === "rest") {
            return (
              <View
                key={targetField.id}
                testID={`target-row-${index}`}
                className="gap-2 border-b border-border pb-3"
              >
                <ChoiceField
                  required
                  label="Target type"
                  nativePresentation="menu"
                  value="rest"
                  options={[
                    { value: "rest", label: targetTypePresentationLabel("rest", activityCategory) },
                  ]}
                  onChange={() => undefined}
                />
                <Text className="text-sm text-muted-foreground">Rest has no intensity target.</Text>
              </View>
            );
          }
          const definition = activityTargetDefinitionByType[target.type];
          const minimum =
            "exclusiveMinimum" in definition && definition.exclusiveMinimum
              ? definition.minimum + 1
              : definition.minimum;
          const key = `target-${targetField.id}`;
          return (
            <View
              key={targetField.id}
              testID={`target-row-${index}`}
              className="gap-2 border-b border-border pb-3"
            >
              <View>
                <ChoiceField
                  required
                  label={targetFields.length === 1 ? "Target type" : `Target ${index + 1} type`}
                  nativePresentation="menu"
                  value={target.type}
                  options={permittedTargetTypes.map((type) => ({
                    value: type,
                    label: targetTypePresentationLabel(type, activityCategory),
                  }))}
                  onChange={(value) => changeTargetType(index, value)}
                />
              </View>
              <View>
                <Controller
                  control={form.control}
                  name={`targets.${index}.intensity` as never}
                  render={({ field }) =>
                    target.type === "RPE" ? (
                      <ChoiceField
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
                          triggerVariant="row"
                          required
                          unitLabel="/km"
                          value={paceTextForSpeed(field.value) ?? ""}
                          helperText="Enter minutes and seconds per kilometer."
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
                            const normalized = normalizeActivityPlanSpeedTargetIntensity(intensity);
                            if (normalized.success) {
                              field.onChange(normalized.intensity);
                              setExactEntryValidity(key, false);
                            } else setExactEntryValidity(key, true);
                          }}
                        />
                        {target.intensity !== null && target.intensity <= 0 ? (
                          <Text accessibilityRole="alert" className="text-sm text-destructive">
                            This saved zero speed cannot be shown as pace. Choose a positive pace or
                            another target type before saving.
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
                        decimals={target.type === "speed" ? 2 : 0}
                        label={
                          targetFields.length === 1 ? "Target value" : `Target ${index + 1} value`
                        }
                        unitLabel={activityTargetUnitLabels[target.type]}
                        triggerVariant="row"
                        min={minimum}
                        max={target.type === "%MaxHR" ? 100 : definition.saveableMaximum}
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
              <View className="items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-12"
                  accessibilityLabel={`Remove target ${index + 1}`}
                  onPress={() => removeTarget(index)}
                >
                  <X size={18} />
                  <Text>Remove</Text>
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
            className="self-start"
            accessibilityLabel="Add target"
            onPress={addTarget}
          >
            <Plus size={14} />
            <Text>Add another target</Text>
          </Button>
        ) : null}
      </View>
      <Form {...form}>
        <View className="gap-3 border-t border-border pt-4" testID="step-details-section">
          <FormTextField
            control={form.control}
            label="Name (optional)"
            name="name"
            placeholder="Step name"
          />
        </View>
        <View className="gap-3 border-t border-border pt-4" testID="step-notes-section">
          <Text className="text-xs font-semibold tracking-wide text-muted-foreground">NOTES</Text>
          <View testID="step-notes-field">
            <FormTextField
              control={form.control}
              label="Notes (optional)"
              name="instructions"
              placeholder="One short cue, up to 160 characters"
              testId="step-notes-input"
              description="One line, up to 160 characters. Put details in the activity plan description."
            />
          </View>
        </View>
      </Form>
      {saveError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}
