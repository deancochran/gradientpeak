import {
  type ActivityPlanIntervalStep,
  type ActivityPlanTarget,
  type ActivityPlanTargetAnchors,
  type ActivityTargetCategory,
  activityPlanDurationSchema,
  activityPlanTargetSchema,
  activityTargetDefinitionByType,
  consolidateActivityPlanText,
  getActivityPlanAuthoringIssues,
  getActivityPlanDefaultTarget,
  getActivityTargetRole,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
} from "@repo/core";
import { numericUxPolicies } from "@repo/core/utils/numeric-ux-policy";
import { Button } from "@repo/ui/components/button";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { NativePicker } from "@repo/ui/components/native-picker";
import { NumberSliderInput } from "@repo/ui/components/number-slider-input";
import { formatDurationSeconds } from "@repo/ui/components/segmented-duration-field/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import * as Haptics from "expo-haptics";
import { Plus, Trash2, X } from "lucide-react-native";
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Controller, useFieldArray } from "react-hook-form";
import {
  AccessibilityInfo,
  Alert,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { type StepDurationDraft, StepDurationField } from "./StepDurationField";

export interface StepEditorFieldsHandle {
  validate: () => ActivityPlanIntervalStep | null | undefined;
  focus: () => void;
  settle: () => void;
  cancel: () => void;
}

export type StepContextEditor =
  | { kind: "duration" | "purpose" | "details" }
  | { kind: "target"; targetId: string };

export interface StepEditorLifecycle {
  isEditorCurrent: () => boolean;
  onDismissEditor: () => void;
  onEditorShow: () => boolean;
  /** The interval grants focus restoration only to its latest dismissed session. */
  onEditorDismissed: (restoreFocus: () => void) => void;
}

interface StepEditorFieldsProps {
  ref?: Ref<StepEditorFieldsHandle>;
  step: ActivityPlanIntervalStep;
  onDirtyChange: (dirty: boolean) => void;
  inline?: boolean;
  activeEditor?: StepContextEditor | null;
  onActivateEditor?: (editor: StepContextEditor, focus: () => void) => void;
  onDismissEditor?: () => void;
  onEditorShow?: StepEditorLifecycle["onEditorShow"];
  onEditorDismissed?: StepEditorLifecycle["onEditorDismissed"];
  isEditorCurrent?: StepEditorLifecycle["isEditorCurrent"];
  headingActions?: ReactNode;
  activityCategory: ActivityTargetCategory;
  targetAnchors?: ActivityPlanTargetAnchors;
  defaultSegmentName?: string;
}

// Form schema for V2 step editing - uses V2 duration format directly
const formSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  purpose: z.enum(["", "warmup", "work", "recovery", "cooldown", "technique"]),
  duration: activityPlanDurationSchema,
  targets: z.array(activityPlanTargetSchema).min(1, "At least one target is required").max(3),
  notes: z.string().max(1000).optional(),
});

const intensityTypes = [
  { value: "%FTP", label: "% FTP" },
  { value: "%MaxHR", label: "% Max HR" },
  { value: "%ThresholdHR", label: "% Threshold HR" },
  { value: "watts", label: "Watts" },
  { value: "bpm", label: "BPM" },
  { value: "speed", label: "Speed (km/h)" },
  { value: "cadence", label: "Cadence (rpm)" },
  { value: "RPE", label: "RPE (1-10)" },
] as const;

const targetSliderViewportMaximum: Record<ActivityPlanTarget["type"], number> = {
  "%FTP": 150,
  "%MaxHR": 100,
  "%ThresholdHR": 120,
  watts: 1000,
  bpm: 220,
  speed: 60,
  cadence: 160,
  RPE: 10,
};

const targetUnitLabel: Record<ActivityPlanTarget["type"], string> = {
  "%FTP": "% FTP",
  "%MaxHR": "% Max HR",
  "%ThresholdHR": "% Threshold HR",
  watts: "watts",
  bpm: "bpm",
  speed: "km/h",
  cadence: "rpm",
  RPE: "RPE",
};

function targetSliderMinimum(target: ActivityPlanTarget) {
  const definition = activityTargetDefinitionByType[target.type];
  const practicalMinimum =
    "exclusiveMinimum" in definition && definition.exclusiveMinimum ? 0.1 : definition.minimum;
  return Math.min(practicalMinimum, target.intensity);
}

export function toStepEditorTargets(targets: ActivityPlanTarget[]): ActivityPlanTarget[] {
  return targets.map((target) => ({ ...target }));
}

export function fromStepEditorTargets(targets: ActivityPlanTarget[]): ActivityPlanTarget[] {
  return targets.map((target) => ({ ...target }));
}

export function StepEditorFields({
  ref,
  step,
  onDirtyChange,
  inline = false,
  activeEditor = null,
  onActivateEditor,
  onDismissEditor,
  onEditorShow,
  onEditorDismissed,
  isEditorCurrent,
  headingActions,
  activityCategory,
  targetAnchors,
}: StepEditorFieldsProps) {
  const isMountedRef = useRef(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const invalidExactEntries = useRef(new Set<string>());
  const [exactEntryEdited, setExactEntryEdited] = useState(false);
  const [, refreshValidity] = useState(0);
  const durationRef = useRef<{ focus: () => void; settle?: () => void; cancel?: () => void }>(null);
  const durationDraft = useRef<StepDurationDraft>({});
  const targetDrafts = useRef(new Map<string, string>());
  const triggers = useRef(new Map<string, React.ComponentRef<typeof View>>());
  const returnTrigger = useRef<string>("duration");
  const insets = useSafeAreaInsets();
  const modalShown = useRef(false);
  useEffect(() => {
    if (!activeEditor) modalShown.current = false;
    else if (modalShown.current) onEditorShow?.();
  }, [activeEditor, onEditorShow]);
  const restoreTriggerFocus = () => {
    // Capture the session callback from this render. Reading the latest row prop
    // here would let an old native onDismiss impersonate a newer presentation.
    onEditorDismissed?.(() => {
      if (!isMountedRef.current) return;
      const trigger = triggers.current.get(returnTrigger.current);
      const handle = trigger ? findNodeHandle(trigger) : null;
      if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  };
  const targetRefs = useRef(
    new Map<string, { focus: () => void; settle?: () => void; cancel?: () => void }>(),
  );
  const settle = () => {
    durationRef.current?.settle?.();
    for (const handle of targetRefs.current.values()) handle.settle?.();
  };
  const cancel = () => {
    durationRef.current?.cancel?.();
    for (const handle of targetRefs.current.values()) handle.cancel?.();
  };
  const purposeRef = useRef<React.ComponentRef<typeof SelectTrigger>>(null);

  const form = useZodForm({
    schema: formSchema,
    defaultValues: {
      name: step.name || "",
      purpose: step.purpose ?? "",
      duration: step.duration,
      targets: toStepEditorTargets(step.targets || []),
      notes: consolidateActivityPlanText(step.notes, step.description, "Description") ?? "",
    },
  });
  const {
    fields: targetFields,
    append: appendTarget,
    remove: removeTarget,
  } = useFieldArray({
    control: form.control,
    name: "targets",
  });

  const targets = form.watch("targets");
  const duration = form.watch("duration");
  const name = form.watch("name");
  const notes = form.watch("notes");
  const dirty = form.formState.isDirty || exactEntryEdited;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const permittedTargetTypes =
    duration.type === "repetitions" ? ["RPE"] : getPermissibleTargetTypes(activityCategory);
  const [standaloneDetails, setStandaloneDetails] = useState(false);
  const showDetails = inline ? activeEditor?.kind === "details" : standaloneDetails;
  const openEditor = (editor: StepContextEditor, focus: () => void = () => {}) => {
    // Supporting effort is reached from Details, so return to the stable row's Details trigger.
    returnTrigger.current =
      editor.kind === "target"
        ? editor.targetId === `target-${targetFields[primaryTargetIndex]?.id}`
          ? "target"
          : "details"
        : editor.kind;
    if (inline) onActivateEditor?.(editor, focus);
    else if (editor.kind === "details") {
      setStandaloneDetails(true);
      setTimeout(focus, 0);
    } else focus();
  };
  const setShowDetails = (show: boolean) => {
    if (inline) {
      if (show) openEditor({ kind: "details" });
      else onDismissEditor?.();
    } else setStandaloneDetails(show);
  };
  const focusDuration = () => openEditor({ kind: "duration" }, () => durationRef.current?.focus());
  // Presentation only: never reorder the saved array (including legacy supporting-first targets).
  const objectiveIndex = targets.findIndex(
    (target) => getActivityTargetRole(target) === "objective",
  );
  const primaryTargetIndex =
    objectiveIndex >= 0
      ? objectiveIndex
      : Math.max(
          0,
          targets.findIndex((target) => target.type === "RPE"),
        );
  const detailsSummary = [
    `Step details: ${name}`,
    ...targets.map((target, index) =>
      index === primaryTargetIndex
        ? undefined
        : invalidExactEntries.current.has(`target-${targetFields[index]?.id}`)
          ? "Unresolved supporting effort"
          : `${target.intensity} ${targetUnitLabel[target.type]}`,
    ),
    notes ? `Instructions: ${notes}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const focusTarget = (key: string) =>
    openEditor({ kind: "target", targetId: key }, () => targetRefs.current.get(key)?.focus());

  const setExactEntryValidity = (field: string, invalid: boolean) => {
    if (invalid) invalidExactEntries.current.add(field);
    else invalidExactEntries.current.delete(field);
    setExactEntryEdited(true);
    refreshValidity((version) => version + 1);
  };

  // Cleanup effect
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const buildSavedStep = () => {
    if (!isMountedRef.current) return;
    settle();

    if (invalidExactEntries.current.size > 0) {
      setSaveError("Finish or correct the exact value before saving.");
      const first = invalidExactEntries.current.values().next().value;
      if (first === "duration") focusDuration();
      else if (first) focusTarget(first);
      return null;
    }

    const values = form.getValues();
    const invalidRpe = values.targets.findIndex(
      (target) => target.type === "RPE" && !Number.isInteger(target.intensity * 2),
    );
    if (invalidRpe >= 0) {
      const target = targetFields[invalidRpe];
      if (target) focusTarget(`target-${target.id}`);
      setSaveError("Choose an RPE in half-point increments from 1 to 10.");
      return null;
    }
    const result = formSchema.safeParse(values);

    if (!result.success) {
      setSaveError(result.error.issues[0]?.message ?? "Fix step inputs.");
      const path = result.error.issues[0]?.path;
      if (path?.[0] === "duration") focusDuration();
      else if (path?.[0] === "targets") {
        const target = targetFields[Number(path[1] ?? 0)];
        if (target) focusTarget(`target-${target.id}`);
      } else {
        openEditor({ kind: "details" }, () =>
          form.setFocus(path?.[0] === "notes" ? "notes" : "name"),
        );
      }
      return null;
    }

    const unsupportedTarget = result.data.targets.find(
      (target) =>
        !isTargetTypePermittedForActivity({
          activityCategory,
          targetType: target.type,
        }),
    );
    if (unsupportedTarget) {
      const target = targetFields[result.data.targets.indexOf(unsupportedTarget)];
      if (target) focusTarget(`target-${target.id}`);
      setSaveError(
        `${unsupportedTarget.type} is not permitted for ${activityCategory}. Choose a supported target before saving.`,
      );
      return null;
    }

    setSaveError(null);

    const savedStep: ActivityPlanIntervalStep = {
      ...step,
      id: step.id,
      name: result.data.name,
      purpose: result.data.purpose || undefined,
      duration: result.data.duration, // Already in V2 format
      targets: fromStepEditorTargets(result.data.targets as ActivityPlanTarget[]),
      notes: result.data.notes,
      description: undefined,
    };

    const issues = getActivityPlanAuthoringIssues({
      version: 3,
      activity_category: activityCategory,
      segments: [
        {
          id: "editor-segment",
          name: "Editor",
          role: "activity",
          intervals: [
            {
              id: "editor-interval",
              name: "Editor",
              repetitions: 1,
              steps: [savedStep],
            },
          ],
        },
      ],
    });
    if (issues.length) {
      setSaveError(
        issues.map((issue) => `${issue.path.slice(6).join(".")}: ${issue.message}`).join("\n"),
      );
      if (!savedStep.purpose) openEditor({ kind: "purpose" }, () => purposeRef.current?.focus?.());
      else {
        const targetIssue = issues.find((issue) => issue.path.includes("targets"));
        const targetIndex = targetIssue?.path[targetIssue.path.indexOf("targets") + 1];
        const target = targetFields[typeof targetIndex === "number" ? targetIndex : 0];
        if (targetIssue && target) focusTarget(`target-${target.id}`);
        else focusDuration();
      }
      return null;
    }

    return savedStep;
  };

  useImperativeHandle(ref, () => ({
    validate: buildSavedStep,
    focus: focusDuration,
    settle,
    cancel,
  }));

  const handleAddTarget = () => {
    if (!isMountedRef.current) return;
    if (targetFields.length >= (duration.type === "repetitions" ? 1 : 3)) return;

    const defaultTarget: ActivityPlanTarget =
      duration.type === "repetitions"
        ? { type: "RPE", intensity: 5 }
        : getActivityPlanDefaultTarget({
            activityCategory,
            ...(targetAnchors === undefined ? {} : { anchors: targetAnchors }),
          });

    appendTarget(defaultTarget);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
      console.warn("Haptic feedback failed:", error);
    });
  };

  const handleRemoveTarget = (index: number) => {
    if (!isMountedRef.current) return;

    const target = targetFields[index];
    if (target) {
      targetDrafts.current.delete(target.id);
      setExactEntryValidity(`target-${target.id}`, false);
    }
    removeTarget(index);
    if (inline) onDismissEditor?.();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
      console.warn("Haptic feedback failed:", error);
    });
  };

  const applyTargetType = (index: number, next: ActivityPlanTarget["type"]) => {
    if (!isMountedRef.current || (inline && isEditorCurrent && !isEditorCurrent())) return;
    form.setValue(`targets.${index}.type` as never, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    const target = targetFields[index];
    if (target) {
      targetDrafts.current.delete(target.id);
      setExactEntryValidity(`target-${target.id}`, false);
    }
    setSaveError(null);
  };

  const changeTargetType = (index: number, nextType: string) => {
    const next = nextType as ActivityPlanTarget["type"];
    const current = targets[index];
    if (!current || next === current.type) return current?.type ?? next;
    const targetField = targetFields[index];
    if (targetField && invalidExactEntries.current.has(`target-${targetField.id}`)) {
      setSaveError("Correct the exact value before changing its target type.");
      targetRefs.current.get(`target-${targetField.id}`)?.focus();
      return current.type;
    }
    if (targets.some((target, targetIndex) => targetIndex !== index && target.type === next)) {
      setSaveError("Each target type can only be used once per step.");
      return current.type;
    }
    if (!permittedTargetTypes.includes(next)) {
      setSaveError(`${next} is not supported for ${activityCategory}.`);
      return current.type;
    }
    Alert.alert(
      "Change target type?",
      `The numeric value ${current.intensity} is retained. Enter an appropriate ${next} value before saving.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Change", onPress: () => applyTargetType(index, next) },
      ],
    );
    return current.type;
  };

  const durationSummary =
    duration.type === "time"
      ? formatDurationSeconds(duration.seconds)
      : duration.type === "distance"
        ? `${duration.meters >= 1000 ? duration.meters / 1000 : duration.meters} ${duration.meters >= 1000 ? "km" : "m"}`
        : duration.type === "repetitions"
          ? `${duration.count} reps`
          : "Until finished";
  const targetButton = (index: number) => {
    const target = targets[index];
    const targetField = targetFields[index];
    if (!target || !targetField) return null;
    const key = `target-${targetField.id}`;
    const unresolved = invalidExactEntries.current.has(key);
    const needsCorrection =
      !permittedTargetTypes.includes(target.type) ||
      !activityPlanTargetSchema.safeParse(target).success ||
      (target.type === "RPE" && !Number.isInteger(target.intensity * 2));
    return (
      <Button
        key={key}
        ref={
          index === primaryTargetIndex
            ? (node) => {
                if (node) triggers.current.set("target", node);
                else triggers.current.delete("target");
              }
            : undefined
        }
        variant="ghost"
        className="min-h-12 min-w-12 px-2"
        testID={`target-value-${index}-current-value`}
        accessibilityLabel={`Target ${index + 1} value: ${unresolved ? "unresolved edit" : `${target.intensity} ${targetUnitLabel[target.type]}`}`}
        accessibilityState={{
          expanded: activeEditor?.kind === "target" && activeEditor.targetId === key,
        }}
        onPress={() => focusTarget(key)}
      >
        <Text>
          {unresolved
            ? "Unresolved effort"
            : `${target.intensity} ${target.type === "watts" ? "W" : targetUnitLabel[target.type]}${needsCorrection ? " · needs correction" : ""}`}
        </Text>
      </Button>
    );
  };

  const editorContent = (
    <>
      {!inline ? (
        <Form {...form}>
          <FormTextField
            control={form.control}
            label="Name"
            name="name"
            placeholder="e.g., Warm-up, Main Set, Cool-down"
          />
        </Form>
      ) : null}

      {!inline || activeEditor?.kind === "purpose" ? (
        <View className="flex-row items-center justify-between gap-2">
          <View className={inline ? "min-w-0 flex-1" : "flex-1"}>
            <Controller
              control={form.control}
              name="purpose"
              render={({ field }) =>
                inline ? (
                  <NativePicker
                    label="Choose step purpose"
                    value={field.value}
                    options={["warmup", "work", "recovery", "cooldown", "technique"].map(
                      (purpose) => ({ value: purpose, label: purpose }),
                    )}
                    {...(isEditorCurrent ? { isCurrent: isEditorCurrent } : {})}
                    onChange={field.onChange}
                  />
                ) : (
                  <Select
                    value={field.value ? { value: field.value, label: field.value } : undefined}
                    onValueChange={(option) => {
                      if (option?.value) field.onChange(option.value);
                    }}
                  >
                    <SelectTrigger
                      ref={purposeRef}
                      accessibilityLabel="Step purpose"
                      testID="step-purpose"
                    >
                      <SelectValue placeholder="Choose purpose (required)" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["warmup", "work", "recovery", "cooldown", "technique"] as const).map(
                        (purpose) => (
                          <SelectItem key={purpose} value={purpose} label={purpose}>
                            {purpose}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )
              }
            />
          </View>
          {!inline ? headingActions : null}
        </View>
      ) : null}

      {!inline || activeEditor?.kind === "duration" ? (
        <Form {...form}>
          <StepDurationField
            ref={durationRef}
            form={form}
            draft={durationDraft.current}
            activityCategory={activityCategory}
            compact={inline}
            active={!inline || activeEditor?.kind === "duration"}
            {...(isEditorCurrent ? { isCurrent: isEditorCurrent } : {})}
            onExactEntryInvalidChange={(invalid) => setExactEntryValidity("duration", invalid)}
          />
        </Form>
      ) : null}

      <View className="gap-2">
        {targetFields.length === 0 ? (
          <View className="rounded-lg border-2 border-dashed border-muted p-4">
            <Text className="text-center text-sm text-muted-foreground">
              Add at least one target before saving.
            </Text>
          </View>
        ) : null}

        {targetFields
          .map((targetField, index) => ({ targetField, index }))
          .filter(
            ({ targetField }) =>
              !inline ||
              (activeEditor?.kind === "target" &&
                activeEditor.targetId === `target-${targetField.id}`),
          )
          .map(({ targetField, index }) => (
            <View key={targetField.id} className="gap-2">
              {(() => {
                const target = targets[index];
                if (!target) return null;
                const targetDefinition = activityTargetDefinitionByType[target.type];
                const isPermitted = permittedTargetTypes.includes(target.type);
                return (
                  <>
                    <Controller
                      control={form.control}
                      name={`targets.${index}.intensity` as never}
                      render={({ field }) =>
                        inline && target.type === "RPE" ? (
                          <View className="gap-2">
                            {!Number.isInteger(target.intensity * 2) ||
                            target.intensity < 1 ||
                            target.intensity > 10 ? (
                              <Text accessibilityRole="alert" className="text-destructive">
                                Existing RPE {target.intensity} needs correction. Choose a
                                half-point value from 1 to 10.
                              </Text>
                            ) : null}
                            <NativePicker
                              ref={(handle) => {
                                if (handle)
                                  targetRefs.current.set(`target-${targetField.id}`, handle);
                                else targetRefs.current.delete(`target-${targetField.id}`);
                              }}
                              label="RPE"
                              options={Array.from({ length: 19 }, (_, index) => ({
                                value: 1 + index / 2,
                                label: String(1 + index / 2),
                              }))}
                              value={target.intensity}
                              {...(isEditorCurrent ? { isCurrent: isEditorCurrent } : {})}
                              onChange={(value) => {
                                targetDrafts.current.delete(targetField.id);
                                field.onChange(value);
                                setExactEntryValidity(`target-${targetField.id}`, false);
                              }}
                            />
                            {permittedTargetTypes.length > 1 ? (
                              <NativePicker
                                label={`Target ${index + 1} type`}
                                value={target.type}
                                options={intensityTypes.filter((option) =>
                                  permittedTargetTypes.includes(option.value),
                                )}
                                {...(isEditorCurrent ? { isCurrent: isEditorCurrent } : {})}
                                onChange={(value) => changeTargetType(index, value)}
                              />
                            ) : null}
                            <Button
                              variant="ghost"
                              accessibilityLabel={`Remove target ${index + 1}`}
                              onPress={() => handleRemoveTarget(index)}
                            >
                              <Text>Remove target</Text>
                            </Button>
                          </View>
                        ) : (
                          <NumberSliderInput
                            {...(inline && isEditorCurrent ? { isCurrent: isEditorCurrent } : {})}
                            {...(targetDrafts.current.has(targetField.id)
                              ? { exactDraft: targetDrafts.current.get(targetField.id) ?? "" }
                              : {})}
                            onExactDraftChange={(raw) => {
                              if (inline && isEditorCurrent && !isEditorCurrent()) return;
                              targetDrafts.current.set(targetField.id, raw);
                            }}
                            ref={(handle) => {
                              if (handle)
                                targetRefs.current.set(`target-${targetField.id}`, handle);
                              else targetRefs.current.delete(`target-${targetField.id}`);
                            }}
                            accessibilityHint={`${intensityTypes.find((option) => option.value === target.type)?.label ?? target.type}; valid between ${targetDefinition.minimum} and ${target.type === "%MaxHR" ? 100 : targetDefinition.saveableMaximum}`}
                            compactHeader
                            showSlider={false}
                            alwaysShowInput={inline}
                            decimals={3}
                            exactValueMax={
                              target.type === "%MaxHR" ? 100 : targetDefinition.saveableMaximum
                            }
                            exactValueMin={targetDefinition.minimum}
                            adjustmentMax={
                              target.type === "%MaxHR" ? 100 : targetDefinition.saveableMaximum
                            }
                            adjustmentMin={targetDefinition.minimum}
                            headerLeading={
                              <View className="min-w-0 flex-1">
                                {permittedTargetTypes.length === 1 && isPermitted ? (
                                  <Text className="text-sm font-medium">RPE</Text>
                                ) : (
                                  <Controller
                                    control={form.control}
                                    name={`targets.${index}.type` as never}
                                    render={({ field: typeField }) =>
                                      inline ? (
                                        <NativePicker
                                          label={`Target ${index + 1} type`}
                                          value={String(typeField.value)}
                                          options={intensityTypes.filter((option) =>
                                            permittedTargetTypes.includes(option.value),
                                          )}
                                          {...(isEditorCurrent
                                            ? { isCurrent: isEditorCurrent }
                                            : {})}
                                          onChange={(value) => changeTargetType(index, value)}
                                        />
                                      ) : (
                                        <Select
                                          onValueChange={(option) => {
                                            if (option?.value)
                                              changeTargetType(index, option.value);
                                          }}
                                          value={{
                                            label:
                                              intensityTypes.find(
                                                (option) => option.value === typeField.value,
                                              )?.label ?? String(typeField.value),
                                            value: String(typeField.value),
                                          }}
                                        >
                                          <SelectTrigger
                                            accessibilityLabel={`Target ${index + 1} type`}
                                            className={
                                              inline ? "min-h-12 border-0 px-0" : "min-h-12"
                                            }
                                            size="sm"
                                            testID={`target-type-${index}`}
                                          >
                                            <SelectValue placeholder="Select target type" />
                                          </SelectTrigger>
                                          <SelectContent
                                            {...(inline
                                              ? { portalHost: `step-picker-${step.id}` }
                                              : {})}
                                          >
                                            {intensityTypes
                                              .filter((option) =>
                                                permittedTargetTypes.includes(option.value),
                                              )
                                              .map((option) => (
                                                <SelectItem
                                                  key={option.value}
                                                  label={option.label}
                                                  value={option.value}
                                                >
                                                  {option.label}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                      )
                                    }
                                  />
                                )}
                              </View>
                            }
                            headerTrailing={
                              <Button
                                accessibilityLabel={`Remove target ${index + 1}`}
                                className="min-h-12 min-w-12"
                                onPress={() => handleRemoveTarget(index)}
                                size="sm"
                                testID={`target-remove-${index}`}
                                variant="ghost"
                              >
                                <Trash2 size={14} className="text-destructive" />
                              </Button>
                            }
                            inlineValueEditor
                            isExactValueValid={(intensity) =>
                              (target.type !== "RPE" || Number.isInteger(intensity * 2)) &&
                              activityPlanTargetSchema.safeParse({
                                type: target.type,
                                intensity,
                              }).success
                            }
                            label={`Target ${index + 1} value`}
                            max={targetSliderViewportMaximum[target.type]}
                            min={targetSliderMinimum(target)}
                            onChange={(intensity) => {
                              if (inline && isEditorCurrent && !isEditorCurrent()) return;
                              field.onChange(intensity);
                              setExactEntryValidity(`target-${targetField.id}`, false);
                            }}
                            onExactValueInvalidChange={(invalid) => {
                              if (inline && isEditorCurrent && !isEditorCurrent()) return;
                              setExactEntryValidity(`target-${targetField.id}`, invalid);
                            }}
                            adjustmentStep={
                              target.type === "watts"
                                ? numericUxPolicies.plannedPowerWatts.adjustmentStep
                                : target.type === "bpm"
                                  ? numericUxPolicies.plannedBpm.adjustmentStep
                                  : target.type === "speed"
                                    ? numericUxPolicies.plannedSpeedKph.adjustmentStep
                                    : target.type === "cadence"
                                      ? numericUxPolicies.plannedCadence.adjustmentStep
                                      : target.type === "RPE"
                                        ? numericUxPolicies.rpe.adjustmentStep
                                        : numericUxPolicies.activityPlanPercent.adjustmentStep
                            }
                            showAdjustmentButtons={false}
                            step={
                              target.type === "watts"
                                ? numericUxPolicies.plannedPowerWatts.sliderStep
                                : target.type === "bpm"
                                  ? numericUxPolicies.plannedBpm.sliderStep
                                  : target.type === "speed"
                                    ? numericUxPolicies.plannedSpeedKph.sliderStep
                                    : target.type === "cadence"
                                      ? numericUxPolicies.plannedCadence.sliderStep
                                      : target.type === "RPE"
                                        ? numericUxPolicies.rpe.sliderStep
                                        : numericUxPolicies.activityPlanPercent.sliderStep
                            }
                            testId={`${inline ? "target-editor-value" : "target-value"}-${index}`}
                            unitLabel={targetUnitLabel[target.type]}
                            value={field.value as number}
                          />
                        )
                      }
                    />
                    {!isPermitted ? (
                      <Text className="mt-2 text-xs text-destructive">
                        {target.type} is not supported for this {duration.type} step in{" "}
                        {activityCategory}. It is retained until you choose a supported target.
                      </Text>
                    ) : null}
                  </>
                );
              })()}
            </View>
          ))}

        {inline && showDetails
          ? targets.map((_, index) => (index !== primaryTargetIndex ? targetButton(index) : null))
          : null}
        {(!inline || showDetails || targetFields.length === 0) &&
        targetFields.length < (duration.type === "repetitions" ? 1 : 3) ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={handleAddTarget}
            className="min-h-12 self-start px-1"
          >
            <Plus size={14} className="text-primary" />
            <Text className="ml-1 text-primary">Add target</Text>
          </Button>
        ) : null}
      </View>

      {inline && invalidExactEntries.current.size > 0 ? (
        <Text accessibilityRole="alert" className="text-destructive">
          Unresolved edit — open the value to correct it before Done.
        </Text>
      ) : null}

      {saveError ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-xs text-destructive"
        >
          {saveError}
        </Text>
      ) : null}

      {showDetails ? (
        <View className="gap-1">
          <Form {...form}>
            {inline ? <FormTextField control={form.control} label="Name" name="name" /> : null}
            <FormTextareaField
              control={form.control}
              label="Instructions"
              name="notes"
              placeholder="Add step instructions"
              className="min-h-[80px]"
            />
          </Form>
          {!inline ? (
            <Button
              className="min-h-12 self-start px-1"
              onPress={() => setShowDetails(false)}
              size="sm"
              variant="ghost"
            >
              <Text className="text-muted-foreground">Hide instructions</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </>
  );
  const detailsTrigger = (
    <Button
      ref={(node) => {
        if (node) triggers.current.set("details", node);
        else triggers.current.delete("details");
      }}
      onPress={() => setShowDetails(true)}
      {...(inline
        ? {
            accessibilityLabel: "Step details",
            accessibilityHint: `${detailsSummary}. Edit custom name, supporting targets and instructions.`,
          }
        : {})}
      accessibilityState={{ expanded: showDetails }}
      size="sm"
      variant="ghost"
      className="min-h-12 h-auto self-stretch items-start justify-start px-1 py-2"
    >
      <Text className="flex-1 text-muted-foreground" numberOfLines={inline ? 3 : 1}>
        {inline
          ? detailsSummary
          : form.getValues("notes")
            ? `Instructions: ${form.getValues("notes")}`
            : "Add instructions"}
      </Text>
    </Button>
  );
  if (!inline)
    return (
      <View className="gap-2">
        {editorContent}
        {!showDetails ? detailsTrigger : null}
      </View>
    );
  return (
    <>
      <View
        testID={`step-resting-row-${step.id}`}
        className="gap-2"
        accessibilityElementsHidden={activeEditor !== null}
        importantForAccessibility={activeEditor ? "no-hide-descendants" : "auto"}
      >
        <View className="flex-row flex-wrap items-center">
          <Button
            ref={(node) => {
              if (node) triggers.current.set("purpose", node);
              else triggers.current.delete("purpose");
            }}
            variant="ghost"
            className="min-h-12 min-w-12 px-2"
            accessibilityLabel="Step purpose"
            accessibilityValue={{ text: form.watch("purpose") || "Not selected" }}
            onPress={() => openEditor({ kind: "purpose" })}
          >
            <Text className="capitalize font-medium">
              {form.watch("purpose") || "Choose purpose"}
            </Text>
          </Button>
          <Text accessibilityElementsHidden>|</Text>
          <Button
            ref={(node) => {
              if (node) triggers.current.set("duration", node);
              else triggers.current.delete("duration");
            }}
            variant="ghost"
            className="min-h-12 min-w-12 px-2"
            testID="step-duration-value-current-value"
            accessibilityLabel={`Duration: ${invalidExactEntries.current.has("duration") ? "unresolved edit" : durationSummary}`}
            accessibilityState={{ expanded: activeEditor?.kind === "duration" }}
            onPress={focusDuration}
          >
            <Text>
              {invalidExactEntries.current.has("duration")
                ? "Unresolved duration"
                : durationSummary}
            </Text>
          </Button>
          <Text accessibilityElementsHidden>|</Text>
          {targetButton(primaryTargetIndex)}
          {headingActions}
        </View>
        {detailsTrigger}
      </View>
      <Modal
        testID="step-picker-modal"
        visible={activeEditor !== null}
        transparent
        presentationStyle="overFullScreen"
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onDismissEditor}
        onDismiss={restoreTriggerFocus}
        onShow={() => {
          if (onEditorShow?.()) modalShown.current = true;
        }}
      >
        {activeEditor ? (
          <KeyboardAvoidingView
            testID="step-picker-root"
            accessibilityViewIsModal
            onAccessibilityEscape={onDismissEditor}
            style={{ flex: 1, paddingTop: insets.top }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              testID="step-picker-scrim"
              accessibilityRole="button"
              accessibilityLabel="Dismiss picker"
              onPress={onDismissEditor}
              style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
            />
            <View
              testID="step-picker-surface"
              className="mt-auto rounded-t-2xl bg-background"
              style={{ maxHeight: "85%", paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <View className="flex-row items-center justify-between px-4">
                <Text accessibilityRole="header" className="font-medium">
                  {activeEditor.kind === "duration"
                    ? "Duration"
                    : activeEditor.kind === "target"
                      ? "Effort"
                      : activeEditor.kind === "purpose"
                        ? "Purpose"
                        : "Step details"}
                </Text>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-12 min-w-12"
                  accessibilityLabel="Close editor"
                  accessibilityHint="Keeps entered values, including unresolved edits."
                  onPress={onDismissEditor}
                >
                  <X size={20} className="text-muted-foreground" />
                </Button>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 16, gap: 8 }}
              >
                {editorContent}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>
    </>
  );
}
