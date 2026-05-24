import {
  createEmptyGoalDraft,
  type GoalEditorDraft,
  type GoalEditorGoalType,
  type GoalEditorRaceTargetMode,
  getGoalDraftQualityFeedback,
} from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { DurationInput } from "@repo/ui/components/duration-input";
import {
  Form,
  FormDateInputField,
  FormIntegerStepperField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { LoadingButton } from "@repo/ui/components/loading";
import { PaceInput } from "@repo/ui/components/pace-input";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
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
import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { AppFormModal } from "@/components/shared/AppFormModal";

interface GoalEditorModalProps {
  visible: boolean;
  initialValue: GoalEditorDraft;
  submitLabel?: string;
  title?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (value: GoalEditorDraft) => void;
}

interface GoalEditorFormProps {
  initialValue: GoalEditorDraft;
  submitLabel?: string;
  isSubmitting?: boolean;
  showSubmitAction?: boolean;
  onSubmit: (value: GoalEditorDraft) => void;
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

type GoalTypeOption = {
  value: GoalEditorGoalType;
  label: string;
  description: string;
};

const GOAL_TYPE_OPTIONS: GoalTypeOption[] = [
  {
    value: "race_performance",
    label: "Race Day",
    description: "Pick a distance and chase a finish time or pace.",
  },
  {
    value: "completion",
    label: "Complete It",
    description: "Set a finish distance, duration, or both.",
  },
  {
    value: "pace_threshold",
    label: "Run Pace",
    description: "Target a threshold pace you want to hold.",
  },
  {
    value: "power_threshold",
    label: "Bike Power",
    description: "Target a threshold power in watts.",
  },
  {
    value: "hr_threshold",
    label: "Threshold HR",
    description: "Target a threshold heart rate for testing.",
  },
  {
    value: "consistency",
    label: "Consistency",
    description: "Aim for a weekly training rhythm over time.",
  },
];

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

const ACTIVITY_OPTIONS: Array<{
  value: GoalEditorDraft["activityCategory"];
  label: string;
}> = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "other", label: "Other" },
];

const RACE_TARGET_MODE_OPTIONS: Array<{
  value: GoalEditorRaceTargetMode;
  label: string;
  description: string;
}> = [
  { value: "time", label: "Finish Time", description: "Save a race time." },
  { value: "pace", label: "Goal Pace", description: "Save a pace target." },
];

const IMPORTANCE_OPTIONS = Array.from({ length: 11 }, (_, value) => ({
  label: String(value),
  value: String(value),
}));

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
  other: [],
};

function getGoalTypeOption(goalType: GoalEditorGoalType) {
  return GOAL_TYPE_OPTIONS.find((option) => option.value === goalType);
}

function getActivityOption(activityCategory: GoalEditorDraft["activityCategory"]) {
  return ACTIVITY_OPTIONS.find((option) => option.value === activityCategory);
}

function getRaceTargetModeOption(raceTargetMode: GoalEditorRaceTargetMode) {
  return RACE_TARGET_MODE_OPTIONS.find((option) => option.value === raceTargetMode);
}

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
      return !!draft.targetPace?.trim() && !!draft.thresholdTestDuration?.trim();
    case "power_threshold":
      return (
        typeof draft.targetWatts === "number" &&
        draft.targetWatts > 0 &&
        !!draft.thresholdTestDuration?.trim()
      );
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

function supportsActivityChoice(goalType: GoalEditorGoalType): boolean {
  return (
    goalType === "race_performance" ||
    goalType === "completion" ||
    goalType === "hr_threshold" ||
    goalType === "consistency"
  );
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
  title: z.string(),
  targetDate: z.string(),
  importance: z.number(),
  goalType: z.enum([
    "race_performance",
    "completion",
    "pace_threshold",
    "power_threshold",
    "hr_threshold",
    "consistency",
  ]),
  activityCategory: z.enum(["run", "bike", "swim", "other"]),
  raceDistanceKm: z.number().nullable().optional(),
  raceTargetMode: z.enum(["time", "pace"]).optional(),
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

    useEffect(() => {
      form.reset({
        ...createEmptyGoalDraft(),
        ...initialValue,
      });
    }, [form, initialValue]);

    const goalTypeOption = useMemo(() => getGoalTypeOption(draft.goalType), [draft.goalType]);
    const activityOption = useMemo(
      () => getActivityOption(draft.activityCategory),
      [draft.activityCategory],
    );
    const raceTargetModeOption = useMemo(
      () => getRaceTargetModeOption(draft.raceTargetMode ?? "time"),
      [draft.raceTargetMode],
    );
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
      !isSubmitting;

    const submitCurrentDraft = () => {
      if (canSubmit) {
        onSubmit(form.getValues() as GoalEditorDraft);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        submit: submitCurrentDraft,
      }),
      [submitCurrentDraft],
    );

    const updateDraft = (patch: Partial<GoalEditorDraft>) => {
      for (const [key, value] of Object.entries(patch)) {
        form.setValue(key as keyof z.infer<typeof goalEditorFormSchema>, value as never, {
          shouldDirty: true,
        });
      }
    };

    const handleGoalTypeChange = (goalType: GoalEditorGoalType) => {
      const base = createEmptyGoalDraft();
      const current = form.getValues() as GoalEditorDraft;

      form.reset({
        ...base,
        title: current.title,
        targetDate: current.targetDate,
        importance: current.importance,
        goalType,
        activityCategory:
          goalType === "pace_threshold"
            ? "run"
            : goalType === "power_threshold"
              ? "bike"
              : current.activityCategory,
      });
    };

    const handlePresetPress = (preset: GoalPreset) => {
      const base = createEmptyGoalDraft();
      const current = form.getValues() as GoalEditorDraft;

      form.reset({
        ...base,
        title: preset.title,
        targetDate: current.targetDate,
        importance: current.importance,
        goalType: preset.goalType,
        activityCategory: preset.activityCategory,
        raceDistanceKm: preset.raceDistanceKm ?? base.raceDistanceKm,
        raceTargetMode: preset.raceTargetMode ?? base.raceTargetMode,
      });
    };

    return (
      <Form {...form}>
        <View className="flex-1 gap-3">
          <GoalSection icon={Trophy} title="Choose a template">
            <View className="flex-row flex-wrap gap-1.5">
              {GOAL_PRESETS.map((preset) => (
                <Pressable
                  key={preset.label}
                  accessibilityLabel={`Use ${preset.title} preset`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => handlePresetPress(preset)}
                  className="min-h-9 justify-center rounded-full bg-secondary px-3 py-1.5"
                >
                  <Text className="text-xs text-secondary-foreground">{preset.label}</Text>
                </Pressable>
              ))}
            </View>
          </GoalSection>

          <View
            className={`rounded-2xl border px-3 py-2 ${
              qualityFeedback.canGuidePlan
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-muted/20"
            }`}
            testID="goal-quality-feedback"
          >
            <Text className="text-sm font-semibold text-foreground">{qualityFeedback.label}</Text>
            <Text className="text-xs text-muted-foreground">{qualityFeedback.message}</Text>
          </View>

          <GoalSection icon={Flag} title="Goal basics">
            <FormTextField
              control={form.control}
              disabled={isSubmitting}
              label="Name"
              name="title"
              placeholder="Spring 10K, Raise FTP..."
              testId="goal-editor-title-input"
            />

            <View className="flex-row gap-2">
              <View className="flex-1 gap-2">
                <Text className="text-sm font-medium text-foreground">Focus</Text>
                <Select
                  value={
                    goalTypeOption
                      ? { label: goalTypeOption.label, value: goalTypeOption.value }
                      : undefined
                  }
                  onValueChange={(option) => {
                    if (option?.value) {
                      handleGoalTypeChange(option.value as GoalEditorGoalType);
                    }
                  }}
                >
                  <SelectTrigger accessibilityLabel="Goal focus" testID="goal-type-select-trigger">
                    <SelectValue placeholder="Focus" />
                  </SelectTrigger>
                  <SelectContent>
                    <NativeSelectScrollView>
                      {GOAL_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} label={option.label} value={option.value}>
                          <View className="gap-0.5">
                            <Text className="text-sm font-medium text-foreground">
                              {option.label}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {option.description}
                            </Text>
                          </View>
                        </SelectItem>
                      ))}
                    </NativeSelectScrollView>
                  </SelectContent>
                </Select>
              </View>

              {supportsActivityChoice(draft.goalType) ? (
                <View className="flex-1 gap-2">
                  <Text className="text-sm font-medium text-foreground">Sport</Text>
                  <Select
                    value={
                      activityOption
                        ? { label: activityOption.label, value: activityOption.value }
                        : undefined
                    }
                    onValueChange={(option) => {
                      if (option?.value) {
                        updateDraft({
                          activityCategory: option.value as GoalEditorDraft["activityCategory"],
                        });
                      }
                    }}
                  >
                    <SelectTrigger accessibilityLabel="Sport" testID="goal-activity-select-trigger">
                      <SelectValue placeholder="Sport" />
                    </SelectTrigger>
                    <SelectContent>
                      <NativeSelectScrollView>
                        {ACTIVITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} label={option.label} value={option.value}>
                            <Text className="text-sm font-medium text-foreground">
                              {option.label}
                            </Text>
                          </SelectItem>
                        ))}
                      </NativeSelectScrollView>
                    </SelectContent>
                  </Select>
                </View>
              ) : null}
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <FormDateInputField
                  control={form.control}
                  label="Date"
                  name="targetDate"
                  minimumDate={new Date()}
                  required
                  testId="goal-target-date"
                />
              </View>
              <View className="flex-1 gap-2">
                <Text className="text-sm font-medium text-foreground">Priority</Text>
                <Select
                  value={{ label: String(draft.importance), value: String(draft.importance) }}
                  onValueChange={(option) => {
                    if (option?.value) {
                      updateDraft({ importance: Number(option.value) });
                    }
                  }}
                >
                  <SelectTrigger
                    accessibilityLabel="Priority"
                    testID="goal-importance-select-trigger"
                  >
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <NativeSelectScrollView>
                      {IMPORTANCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} label={option.label} value={option.value}>
                          <Text className="text-sm font-medium text-foreground">
                            {option.label}
                          </Text>
                        </SelectItem>
                      ))}
                    </NativeSelectScrollView>
                  </SelectContent>
                </Select>
              </View>
            </View>
          </GoalSection>

          {draft.goalType === "race_performance" || draft.goalType === "completion" ? (
            <GoalSection
              icon={Target}
              title={draft.goalType === "race_performance" ? "Race target" : "Completion target"}
            >
              <View className="flex-row gap-2">
                {distancePresets.length > 0 ? (
                  <View className="flex-1 gap-2">
                    <Text className="text-sm font-medium text-foreground">Distance</Text>
                    <Select
                      value={
                        distancePresetOption
                          ? {
                              label: distancePresetOption.label,
                              value: String(distancePresetOption.value),
                            }
                          : undefined
                      }
                      onValueChange={(option) => {
                        if (option?.value) {
                          updateDraft({ raceDistanceKm: Number(option.value) });
                        }
                      }}
                    >
                      <SelectTrigger
                        accessibilityLabel="Suggested distance"
                        testID="goal-distance-preset-select-trigger"
                      >
                        <SelectValue placeholder="Preset" />
                      </SelectTrigger>
                      <SelectContent>
                        <NativeSelectScrollView>
                          {distancePresets.map((preset) => (
                            <SelectItem
                              key={`${draft.activityCategory}-${preset.label}`}
                              label={preset.label}
                              value={String(preset.value)}
                            >
                              <Text className="text-sm font-medium text-foreground">
                                {preset.label}
                              </Text>
                            </SelectItem>
                          ))}
                        </NativeSelectScrollView>
                      </SelectContent>
                    </Select>
                  </View>
                ) : null}

                {draft.goalType === "race_performance" ? (
                  <View className="flex-1 gap-2">
                    <Text className="text-sm font-medium text-foreground">Measure</Text>
                    <Select
                      value={
                        raceTargetModeOption
                          ? { label: raceTargetModeOption.label, value: raceTargetModeOption.value }
                          : undefined
                      }
                      onValueChange={(option) => {
                        if (option?.value) {
                          updateDraft({ raceTargetMode: option.value as GoalEditorRaceTargetMode });
                        }
                      }}
                    >
                      <SelectTrigger
                        accessibilityLabel="Target style"
                        testID="goal-target-style-select-trigger"
                      >
                        <SelectValue placeholder="Measure" />
                      </SelectTrigger>
                      <SelectContent>
                        <NativeSelectScrollView>
                          {RACE_TARGET_MODE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              label={option.label}
                              value={option.value}
                            >
                              <View className="gap-0.5">
                                <Text className="text-sm font-medium text-foreground">
                                  {option.label}
                                </Text>
                                <Text className="text-xs text-muted-foreground">
                                  {option.description}
                                </Text>
                              </View>
                            </SelectItem>
                          ))}
                        </NativeSelectScrollView>
                      </SelectContent>
                    </Select>
                  </View>
                ) : null}
              </View>

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <BoundedNumberInput
                    id="goal-distance"
                    label={getDistanceLabel(draft.goalType)}
                    value={draft.raceDistanceKm == null ? "" : String(draft.raceDistanceKm)}
                    onChange={() => undefined}
                    onNumberChange={(value) => updateDraft({ raceDistanceKm: value ?? null })}
                    min={0}
                    max={1000}
                    decimals={1}
                    unitLabel="km"
                    placeholder="21.1"
                    accessibilityHint="Enter distance in kilometers"
                  />
                </View>

                <View className="flex-1">
                  {draft.goalType === "completion" ||
                  (draft.raceTargetMode ?? "time") === "time" ? (
                    <DurationInput
                      id="goal-duration"
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
            <GoalSection icon={Gauge} title="Run pace target">
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <PaceInput
                    id="goal-threshold-pace"
                    label="Target pace"
                    value={draft.targetPace ?? ""}
                    onChange={(value) => updateDraft({ targetPace: value })}
                    helperText=""
                  />
                </View>
                <View className="flex-1">
                  <DurationInput
                    id="goal-threshold-pace-duration"
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
            <GoalSection icon={Dumbbell} title="Bike power target">
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <BoundedNumberInput
                    id="goal-power"
                    label="Watts"
                    value={draft.targetWatts == null ? "" : String(draft.targetWatts)}
                    onChange={() => undefined}
                    onNumberChange={(value) => updateDraft({ targetWatts: value ?? null })}
                    min={1}
                    max={2000}
                    decimals={0}
                    unitLabel="W"
                    placeholder="285"
                    accessibilityHint="Enter target power in watts"
                  />
                </View>
                <View className="flex-1">
                  <DurationInput
                    id="goal-power-duration"
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
                id="goal-heart-rate"
                label="Target bpm"
                value={draft.targetBpm == null ? "" : String(draft.targetBpm)}
                onChange={() => undefined}
                onNumberChange={(value) => updateDraft({ targetBpm: value ?? null })}
                min={1}
                max={260}
                decimals={0}
                unitLabel="bpm"
                placeholder="168"
                accessibilityHint="Enter target threshold heart rate in beats per minute"
              />
            </GoalSection>
          ) : null}

          {draft.goalType === "consistency" ? (
            <GoalSection icon={CalendarDays} title="Consistency target">
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <FormIntegerStepperField
                    control={form.control}
                    label="Sessions / week"
                    name="consistencySessionsPerWeek"
                    min={0}
                    max={14}
                    testId="goal-consistency-sessions"
                  />
                </View>
                <View className="flex-1">
                  <FormIntegerStepperField
                    control={form.control}
                    label="Weeks"
                    name="consistencyWeeks"
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
              loading={isSubmitting}
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
