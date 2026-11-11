import {
  activityCategoryChoices,
  buildGoalUpdatePayload,
  canonicalActivityCategorySchema,
  createEmptyGoalDraft,
  type GoalEditorDraft,
  type GoalEditorGoalType,
  type GoalEditorRaceTargetMode,
  getGoalDraftQualityFeedback,
  goalFocusChoices,
  goalPriorityChoices,
  goalPriorityHelpText,
  goalRaceMeasureChoices,
  profileGoalSchema,
} from "@repo/core";
import { numericUxPolicies } from "@repo/core/utils/numeric-ux-policy";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { ChoiceField } from "@repo/ui/components/choice-field";
import { DurationInput } from "@repo/ui/components/duration-input";
import {
  Form,
  FormChoiceField,
  FormDateInputField,
  FormIntegerStepperField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { LoadingButton } from "@repo/ui/components/loading";
import { PaceInput } from "@repo/ui/components/pace-input";
import { Text } from "@repo/ui/components/text";
import { flushPendingFormDrafts, useZodForm } from "@repo/ui/hooks";
import {
  CalendarDays,
  Dumbbell,
  Flag,
  Gauge,
  type LucideIcon,
  Target,
  Trophy,
} from "lucide-react-native";
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Pressable, View } from "react-native";
import { z } from "zod";
import { AppFormModal } from "@/components/shared/AppFormModal";

interface GoalEditorModalProps {
  visible: boolean;
  initialValue: GoalEditorDraft;
  submitLabel?: string;
  title?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (value: GoalEditorDraft) => void | Promise<void>;
}

export interface GoalEditorFormProps {
  initialValue: GoalEditorDraft;
  submitLabel?: string;
  isSubmitting?: boolean;
  showSubmitAction?: boolean;
  contentSizing?: "fill" | "intrinsic";
  onDraftChange?: (draft: GoalEditorDraft) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSubmit: (value: GoalEditorDraft) => void | Promise<void>;
}

export type GoalEditorFormHandle = {
  submit: () => void;
};

type GoalPreset = {
  label: string;
  title: string;
  goalType: GoalEditorGoalType;
  activityCategory: GoalEditorDraft["activityCategory"];
  raceDistanceKm?: number;
  raceTargetMode?: GoalEditorRaceTargetMode;
};

const GOAL_PRESETS: GoalPreset[] = [
  {
    label: "5K",
    title: "5K Race",
    goalType: "race_performance",
    activityCategory: "run",
    raceDistanceKm: 5,
    raceTargetMode: "time",
  },
  {
    label: "10K",
    title: "10K Race",
    goalType: "race_performance",
    activityCategory: "run",
    raceDistanceKm: 10,
    raceTargetMode: "time",
  },
  {
    label: "Half",
    title: "Half Marathon",
    goalType: "race_performance",
    activityCategory: "run",
    raceDistanceKm: 21.1,
    raceTargetMode: "time",
  },
  {
    label: "Marathon",
    title: "Marathon",
    goalType: "race_performance",
    activityCategory: "run",
    raceDistanceKm: 42.2,
    raceTargetMode: "time",
  },
  {
    label: "Century",
    title: "Century Ride",
    goalType: "race_performance",
    activityCategory: "bike",
    raceDistanceKm: 160.9,
    raceTargetMode: "time",
  },
  {
    label: "FTP",
    title: "Raise FTP",
    goalType: "power_threshold",
    activityCategory: "bike",
  },
];

const DISTANCE_PRESETS_BY_ACTIVITY: Record<
  GoalEditorDraft["activityCategory"],
  Array<{ label: string; value: number }>
> = {
  run: [
    { label: "5K", value: 5 },
    { label: "10K", value: 10 },
    { label: "Half", value: 21.1 },
    { label: "Marathon", value: 42.2 },
  ],
  bike: [
    { label: "20K", value: 20 },
    { label: "40K", value: 40 },
    { label: "100K", value: 100 },
    { label: "Century", value: 160.9 },
  ],
  swim: [
    { label: "400m", value: 0.4 },
    { label: "1500m", value: 1.5 },
    { label: "3.8K", value: 3.8 },
  ],
  strength: [],
  other: [],
};

function getDistancePresetOption(
  presets: Array<{ label: string; value: number }>,
  distanceKm: number | null | undefined,
) {
  return presets.find((preset) => nearlyEqual(distanceKm, preset.value));
}

function nearlyEqual(left: number | null | undefined, right: number): boolean {
  return typeof left === "number" && Math.abs(left - right) < 0.05;
}

function hasDraftTarget(draft: GoalEditorDraft): boolean {
  switch (draft.goalType) {
    case "race_performance":
      return (
        typeof draft.raceDistanceKm === "number" &&
        draft.raceDistanceKm > 0 &&
        ((draft.raceTargetMode ?? "time") === "time"
          ? !!draft.targetDuration?.trim()
          : !!draft.targetPace?.trim())
      );
    case "completion":
      return (
        (typeof draft.raceDistanceKm === "number" && draft.raceDistanceKm > 0) ||
        !!draft.targetDuration?.trim()
      );
    case "pace_threshold":
      return !!draft.targetPace?.trim();
    case "power_threshold":
      return typeof draft.targetWatts === "number" && draft.targetWatts > 0;
    case "hr_threshold":
      return typeof draft.targetBpm === "number" && draft.targetBpm > 0;
    case "consistency":
      return (
        (typeof draft.consistencySessionsPerWeek === "number" &&
          draft.consistencySessionsPerWeek > 0) ||
        (typeof draft.consistencyWeeks === "number" && draft.consistencyWeeks > 0)
      );
  }
}

function getDistanceLabel(goalType: GoalEditorGoalType): string {
  return goalType === "completion" ? "Distance (optional)" : "Race distance";
}

function GoalSection({
  children,
  icon: SectionIcon,
  title,
}: {
  children: React.ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-3">
      <View className="flex-row items-center gap-2">
        <View className="size-7 items-center justify-center rounded-full bg-primary/10">
          <Icon as={SectionIcon} size={14} className="text-primary" />
        </View>
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
      </View>
      {children}
    </View>
  );
}

const goalEditorFormSchema = z.object({
  originalGoal: profileGoalSchema.optional(),
  title: z.string(),
  targetDate: z.string(),
  importance: z.number(),
  goalType: z.enum(goalFocusChoices.map((option) => option.value)),
  activityCategory: canonicalActivityCategorySchema,
  raceDistanceKm: z.number().nullable().optional(),
  raceTargetMode: z.enum(goalRaceMeasureChoices.map((option) => option.value)).optional(),
  targetDuration: z.string().optional(),
  targetPace: z.string().optional(),
  thresholdTestDuration: z.string().optional(),
  targetWatts: z.number().nullable().optional(),
  targetBpm: z.number().nullable().optional(),
  consistencySessionsPerWeek: z.number().nullable().optional(),
  consistencyWeeks: z.number().nullable().optional(),
});

export const GoalEditorForm = forwardRef<GoalEditorFormHandle, GoalEditorFormProps>(
  function GoalEditorForm(
    {
      initialValue,
      submitLabel = "Save Goal",
      isSubmitting = false,
      showSubmitAction = true,
      contentSizing = "fill",
      onDraftChange,
      onDirtyChange,
      onSubmit,
    },
    ref,
  ) {
    const form = useZodForm({
      schema: goalEditorFormSchema,
      defaultValues: {
        ...createEmptyGoalDraft(),
        ...initialValue,
      },
    });
    const draft = form.watch() as GoalEditorDraft;
    const [locallySubmitting, setLocallySubmitting] = useState(false);
    const busy = isSubmitting || locallySubmitting;
    const busyRef = useRef(busy);
    busyRef.current = busy;
    const submitGuard = useRef(false);
    const mounted = useRef(true);
    const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
    const [invalidNumericFields, setInvalidNumericFields] = useState<Record<string, boolean>>({});
    const invalidDraft = Object.values(invalidNumericFields).some(Boolean);
    const isDirty = form.formState.isDirty || invalidDraft;
    const onDraftChangeRef = useRef(onDraftChange);
    const lastEmittedDraftRef = useRef<string | null>(null);
    const shouldObserveDraft = onDraftChange !== undefined;
    onDraftChangeRef.current = onDraftChange;

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    useEffect(() => {
      // A parent refresh is not permission to replace this goal's local draft.
      // Different goals remount this existing form through the owner's stable key.
      if (busy || isDirty) return;
      form.reset({
        ...createEmptyGoalDraft(),
        ...initialValue,
      });
    }, [form, initialValue, busy, isDirty]);

    useEffect(() => {
      if (!shouldObserveDraft) {
        return;
      }

      const emitDraft = (value: GoalEditorDraft) => {
        const nextDraft = { ...value };
        const serializedDraft = JSON.stringify(nextDraft);
        if (serializedDraft === lastEmittedDraftRef.current) {
          return;
        }

        lastEmittedDraftRef.current = serializedDraft;
        onDraftChangeRef.current?.(nextDraft);
      };

      emitDraft(form.getValues() as GoalEditorDraft);
      const subscription = form.watch((value) => emitDraft(value as GoalEditorDraft));
      return () => subscription.unsubscribe();
    }, [form, shouldObserveDraft]);

    const distancePresets = useMemo(
      () => DISTANCE_PRESETS_BY_ACTIVITY[draft.activityCategory] ?? [],
      [draft.activityCategory],
    );
    const distancePresetOption = useMemo(
      () => getDistancePresetOption(distancePresets, draft.raceDistanceKm),
      [distancePresets, draft.raceDistanceKm],
    );
    const qualityFeedback = useMemo(() => getGoalDraftQualityFeedback({ draft }), [draft]);

    const canSubmit =
      draft.title.trim().length > 0 &&
      draft.targetDate.length > 0 &&
      hasDraftTarget(draft) &&
      !Object.values(invalidNumericFields).some(Boolean) &&
      !busy;

    const submitCurrentDraft = useCallback(async () => {
      if (submitGuard.current || busyRef.current) return;
      const issues = flushPendingFormDrafts(form.control);
      if (issues.length) {
        for (const issue of issues) {
          form.setError(issue.name as keyof GoalEditorDraft, {
            type: "input",
            message: issue.message,
          });
        }
        const first = issues[0];
        if (first?.focus) first.focus();
        else if (first) form.setFocus(first.name as keyof GoalEditorDraft);
        setSubmitFeedback("Correct the highlighted target before saving.");
        return;
      }
      if (canSubmit) {
        submitGuard.current = true;
        busyRef.current = true;
        setLocallySubmitting(true);
        setSubmitFeedback(null);
        try {
          const current = goalEditorFormSchema.parse(form.getValues());
          buildGoalUpdatePayload({ draft: current });
          await onSubmit(current);
        } catch (error) {
          if (mounted.current)
            setSubmitFeedback(
              error instanceof Error ? error.message : "Unable to save goal. Please try again.",
            );
        } finally {
          submitGuard.current = false;
          if (mounted.current) setLocallySubmitting(false);
        }
        return;
      }
      setSubmitFeedback("Complete the goal name, date, and target before saving.");
    }, [canSubmit, form, onSubmit]);

    useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

    useImperativeHandle(
      ref,
      () => ({
        submit: submitCurrentDraft,
      }),
      [submitCurrentDraft],
    );

    const updateDraft = (patch: Partial<GoalEditorDraft>) => {
      if (busyRef.current) return;
      for (const [key, value] of Object.entries(patch)) {
        form.setValue(key as keyof z.infer<typeof goalEditorFormSchema>, value as never, {
          shouldDirty: true,
        });
      }
    };

    const confirmReplacement = (replace: () => void) => {
      if (busyRef.current) return;
      const current = form.getValues() as GoalEditorDraft;
      if (!isDirty && !current.title.trim() && !hasDraftTarget(current)) {
        replace();
        return;
      }
      Alert.alert(
        "Replace goal details?",
        "This replaces the current goal focus and targets. Your date and priority are kept.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Replace",
            style: "destructive",
            onPress: () => {
              if (mounted.current && !busyRef.current) replace();
            },
          },
        ],
      );
    };

    const handleGoalTypeChange = (goalType: GoalEditorGoalType) => {
      if (goalType === draft.goalType) return;
      confirmReplacement(() => {
        setInvalidNumericFields({});
        const base = createEmptyGoalDraft();
        const current = form.getValues() as GoalEditorDraft;

        form.reset(
          {
            ...base,
            title: current.title,
            targetDate: current.targetDate,
            importance: current.importance,
            goalType,
            thresholdTestDuration: goalType === "hr_threshold" ? "" : base.thresholdTestDuration,
            activityCategory:
              goalType === "pace_threshold"
                ? "run"
                : goalType === "power_threshold"
                  ? "bike"
                  : current.activityCategory,
          },
          { keepDefaultValues: true },
        );
      });
    };

    const handlePresetPress = (preset: GoalPreset) => {
      confirmReplacement(() => {
        setInvalidNumericFields({});
        const base = createEmptyGoalDraft();
        const current = form.getValues() as GoalEditorDraft;

        form.reset(
          {
            ...base,
            title: preset.title,
            targetDate: current.targetDate,
            importance: current.importance,
            goalType: preset.goalType,
            activityCategory: preset.activityCategory,
            raceDistanceKm: preset.raceDistanceKm ?? base.raceDistanceKm,
            raceTargetMode: preset.raceTargetMode ?? base.raceTargetMode,
          },
          { keepDefaultValues: true },
        );
      });
    };

    return (
      <Form {...form}>
        <View
          className={contentSizing === "intrinsic" ? "gap-3" : "flex-1 gap-3"}
          testID="goal-editor-form"
        >
          <GoalSection icon={Trophy} title="Templates">
            <View className="flex-row flex-wrap gap-1.5">
              {GOAL_PRESETS.map((preset) => (
                <Pressable
                  key={preset.label}
                  accessibilityLabel={`Use ${preset.title} preset`}
                  accessibilityRole="button"
                  disabled={busy}
                  accessibilityState={{ disabled: busy }}
                  hitSlop={8}
                  onPress={() => handlePresetPress(preset)}
                  className="min-h-11 justify-center rounded-full bg-secondary px-3 py-1.5"
                >
                  <Text className="text-xs text-secondary-foreground">{preset.label}</Text>
                </Pressable>
              ))}
            </View>
          </GoalSection>

          {!qualityFeedback.canGuidePlan ? (
            <View
              className="rounded-2xl border border-border bg-muted/20 px-3 py-2"
              testID="goal-quality-feedback"
            >
              <Text className="text-sm font-semibold text-foreground">{qualityFeedback.label}</Text>
              <Text className="text-xs text-muted-foreground">{qualityFeedback.message}</Text>
            </View>
          ) : null}
          {submitFeedback ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
              testID="goal-submit-feedback"
            >
              {submitFeedback}
            </Text>
          ) : null}

          <GoalSection icon={Flag} title="Goal basics">
            <FormTextField
              control={form.control}
              disabled={busy}
              label="Name"
              name="title"
              placeholder="Spring 10K, Raise FTP..."
              testId="goal-editor-title-input"
            />

            <View className="gap-3">
              <View className="gap-2">
                <ChoiceField
                  label="Goal focus"
                  value={draft.goalType}
                  options={goalFocusChoices}
                  onChange={handleGoalTypeChange}
                  disabled={busy}
                  required
                  formControl={form.control}
                  fieldName="goalType"
                  testId="goal-type-select-trigger"
                />
              </View>

              <View className="gap-2">
                <FormChoiceField
                  control={form.control}
                  name="activityCategory"
                  label="Activity"
                  options={activityCategoryChoices}
                  disabled={busy}
                  required
                  testId="goal-activity-select-trigger"
                />
              </View>
            </View>

            <View className="gap-3">
              <View>
                <FormDateInputField
                  disabled={busy}
                  control={form.control}
                  label="Date"
                  name="targetDate"
                  minimumDate={new Date()}
                  required
                  testId="goal-target-date"
                />
              </View>
              <View className="gap-2">
                <FormChoiceField
                  control={form.control}
                  name="importance"
                  label="Priority"
                  options={goalPriorityChoices}
                  description={goalPriorityHelpText}
                  disabled={busy}
                  required
                  testId="goal-importance-select-trigger"
                />
              </View>
            </View>
          </GoalSection>

          {draft.goalType === "race_performance" || draft.goalType === "completion" ? (
            <GoalSection
              icon={Target}
              title={draft.goalType === "race_performance" ? "Race target" : "Completion target"}
            >
              <View className="gap-3">
                {distancePresets.length > 0 ? (
                  <View className="gap-2">
                    <ChoiceField
                      label="Suggested distance"
                      value={distancePresetOption?.value}
                      options={distancePresets}
                      onChange={(raceDistanceKm) => updateDraft({ raceDistanceKm })}
                      disabled={busy}
                      placeholder="Custom distance"
                      testId="goal-distance-preset-select-trigger"
                    />
                  </View>
                ) : null}

                {draft.goalType === "race_performance" ? (
                  <View className="gap-2">
                    <FormChoiceField
                      control={form.control}
                      name="raceTargetMode"
                      label="Target style"
                      options={goalRaceMeasureChoices}
                      nativePresentation="segmented"
                      disabled={busy}
                      required
                      testId="goal-target-style-select-trigger"
                    />
                  </View>
                ) : null}
              </View>

              <View className="gap-3">
                <View>
                  <BoundedNumberInput
                    disabled={busy}
                    adjustmentStep={numericUxPolicies.distanceKilometers.adjustmentStep}
                    clampProjection={false}
                    id="goal-distance"
                    label={getDistanceLabel(draft.goalType)}
                    value={draft.raceDistanceKm == null ? "" : String(draft.raceDistanceKm)}
                    onChange={() => undefined}
                    onInvalidChange={(invalid) =>
                      setInvalidNumericFields((current) => ({ ...current, distance: invalid }))
                    }
                    onNumberChange={(value) => updateDraft({ raceDistanceKm: value ?? null })}
                    min={0}
                    max={1000}
                    decimals={3}
                    unitLabel="km"
                    placeholder="21.1"
                    showAdjustmentButtons
                    accessibilityHint="Enter distance in kilometers"
                  />
                </View>

                <View>
                  {draft.goalType === "completion" ||
                  (draft.raceTargetMode ?? "time") === "time" ? (
                    <DurationInput
                      layout="hms"
                      formControl={form.control}
                      fieldName="targetDuration"
                      required={draft.goalType === "race_performance"}
                      disabled={busy}
                      id="goal-duration"
                      testId="goal-duration"
                      label={draft.goalType === "completion" ? "Duration" : "Goal time"}
                      value={draft.targetDuration ?? ""}
                      onChange={(value) => updateDraft({ targetDuration: value })}
                      placeholder={draft.goalType === "completion" ? "2:30:00" : "0:25:00"}
                      helperText=""
                    />
                  ) : null}

                  {draft.goalType === "race_performance" &&
                  (draft.raceTargetMode ?? "time") === "pace" ? (
                    <PaceInput
                      layout="ms"
                      formControl={form.control}
                      fieldName="targetPace"
                      required
                      disabled={busy}
                      id="goal-race-pace"
                      label="Goal pace"
                      value={draft.targetPace ?? ""}
                      onChange={(value) => updateDraft({ targetPace: value })}
                      helperText=""
                    />
                  ) : null}
                </View>
              </View>
            </GoalSection>
          ) : null}

          {draft.goalType === "pace_threshold" ? (
            <GoalSection icon={Gauge} title="Pace target">
              <View className="gap-3">
                <View>
                  <PaceInput
                    layout="ms"
                    formControl={form.control}
                    fieldName="targetPace"
                    required
                    disabled={busy}
                    id="goal-threshold-pace"
                    label="Target pace"
                    value={draft.targetPace ?? ""}
                    onChange={(value) => updateDraft({ targetPace: value })}
                    helperText=""
                  />
                </View>
                <View>
                  <DurationInput
                    layout="ms"
                    formControl={form.control}
                    fieldName="thresholdTestDuration"
                    disabled={busy}
                    id="goal-threshold-pace-duration"
                    testId="goal-threshold-pace-duration"
                    label="Test time"
                    value={draft.thresholdTestDuration ?? ""}
                    onChange={(value) => updateDraft({ thresholdTestDuration: value })}
                    helperText=""
                  />
                </View>
              </View>
            </GoalSection>
          ) : null}

          {draft.goalType === "power_threshold" ? (
            <GoalSection icon={Dumbbell} title="Power target">
              <View className="gap-3">
                <View>
                  <BoundedNumberInput
                    disabled={busy}
                    adjustmentStep={numericUxPolicies.plannedPowerWatts.adjustmentStep}
                    clampProjection={false}
                    id="goal-power"
                    label="Watts"
                    value={draft.targetWatts == null ? "" : String(draft.targetWatts)}
                    onChange={() => undefined}
                    onInvalidChange={(invalid) =>
                      setInvalidNumericFields((current) => ({ ...current, power: invalid }))
                    }
                    onNumberChange={(value) => updateDraft({ targetWatts: value ?? null })}
                    min={1}
                    max={2000}
                    decimals={0}
                    unitLabel="W"
                    placeholder="285"
                    showAdjustmentButtons
                    accessibilityHint="Enter target power in watts"
                  />
                </View>
                <View>
                  <DurationInput
                    layout="ms"
                    formControl={form.control}
                    fieldName="thresholdTestDuration"
                    disabled={busy}
                    id="goal-power-duration"
                    testId="goal-power-duration"
                    label="Test time"
                    value={draft.thresholdTestDuration ?? ""}
                    onChange={(value) => updateDraft({ thresholdTestDuration: value })}
                    helperText=""
                  />
                </View>
              </View>
            </GoalSection>
          ) : null}

          {draft.goalType === "hr_threshold" ? (
            <GoalSection icon={Gauge} title="Heart rate target">
              <BoundedNumberInput
                disabled={busy}
                adjustmentStep={numericUxPolicies.plannedBpm.adjustmentStep}
                clampProjection={false}
                id="goal-heart-rate"
                label="Target bpm"
                value={draft.targetBpm == null ? "" : String(draft.targetBpm)}
                onChange={() => undefined}
                onInvalidChange={(invalid) =>
                  setInvalidNumericFields((current) => ({ ...current, heartRate: invalid }))
                }
                onNumberChange={(value) => updateDraft({ targetBpm: value ?? null })}
                min={1}
                max={260}
                decimals={0}
                unitLabel="bpm"
                placeholder="168"
                showAdjustmentButtons
                accessibilityHint="Enter target threshold heart rate in beats per minute"
              />
              <DurationInput
                layout="ms"
                formControl={form.control}
                fieldName="thresholdTestDuration"
                disabled={busy}
                id="goal-heart-rate-duration"
                testId="goal-heart-rate-duration"
                label="Test time"
                value={draft.thresholdTestDuration ?? ""}
                onChange={(value) => updateDraft({ thresholdTestDuration: value })}
              />
            </GoalSection>
          ) : null}

          {draft.goalType === "consistency" ? (
            <GoalSection icon={CalendarDays} title="Consistency target">
              <View className="gap-3">
                <View>
                  <FormIntegerStepperField
                    disabled={busy}
                    control={form.control}
                    label="Sessions / week"
                    name="consistencySessionsPerWeek"
                    emptyValue={null}
                    min={0}
                    max={14}
                    testId="goal-consistency-sessions"
                  />
                </View>
                <View>
                  <FormIntegerStepperField
                    disabled={busy}
                    control={form.control}
                    label="Weeks"
                    name="consistencyWeeks"
                    emptyValue={null}
                    min={0}
                    max={52}
                    testId="goal-consistency-weeks"
                  />
                </View>
              </View>
            </GoalSection>
          ) : null}

          {showSubmitAction ? (
            <LoadingButton
              disabled={!canSubmit}
              loading={busy}
              loadingLabel="Saving..."
              onPress={submitCurrentDraft}
            >
              <Text className="text-primary-foreground">{submitLabel}</Text>
            </LoadingButton>
          ) : null}
        </View>
      </Form>
    );
  },
);

export function GoalEditorModal({
  visible,
  initialValue,
  submitLabel = "Save Goal",
  title = "Goal",
  isSubmitting = false,
  onClose,
  onSubmit,
}: GoalEditorModalProps) {
  if (!visible) {
    return null;
  }

  return (
    <AppFormModal onClose={onClose} testID="goal-editor-modal" title={title}>
      <GoalEditorForm
        initialValue={initialValue}
        submitLabel={submitLabel}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
      />
    </AppFormModal>
  );
}
