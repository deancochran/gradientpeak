import {
  createEmptyGoalDraft,
  type GoalEditorDraft,
  type GoalEditorGoalType,
  type GoalEditorRaceTargetMode,
} from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DurationInput } from "@repo/ui/components/duration-input";
import {
  Form,
  FormDateInputField,
  FormIntegerStepperField,
  FormTextField,
} from "@repo/ui/components/form";
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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { useZodForm } from "@repo/ui/hooks";
import React, { useEffect, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
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

function SelectionIndicator({ active }: { active: boolean }) {
  return (
    <View
      className={`mt-0.5 size-4 items-center justify-center rounded-full border ${
        active ? "border-primary" : "border-input dark:bg-input/30"
      }`}
    >
      {active ? <View className="bg-primary size-2 rounded-full" /> : null}
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

export function GoalEditorModal({
  visible,
  initialValue,
  submitLabel = "Save Goal",
  title = "Goal",
  isSubmitting = false,
  onClose,
  onSubmit,
}: GoalEditorModalProps) {
  const form = useZodForm({
    schema: goalEditorFormSchema,
    defaultValues: {
      ...createEmptyGoalDraft(),
      ...initialValue,
    },
  });
  const draft = form.watch() as GoalEditorDraft;

  useEffect(() => {
    if (!visible) {
      return;
    }

    form.reset({
      ...createEmptyGoalDraft(),
      ...initialValue,
    });
  }, [form, initialValue, visible]);

  const goalTypeOption = useMemo(() => getGoalTypeOption(draft.goalType), [draft.goalType]);
  const distancePresets = useMemo(
    () => DISTANCE_PRESETS_BY_ACTIVITY[draft.activityCategory] ?? [],
    [draft.activityCategory],
  );

  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.targetDate.length > 0 &&
    hasDraftTarget(draft) &&
    !isSubmitting;

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

  if (!visible) {
    return null;
  }

  return (
    <AppFormModal
      onClose={onClose}
      primaryAction={
        <Button onPress={() => onSubmit(form.getValues() as GoalEditorDraft)} disabled={!canSubmit}>
          <Text className="text-primary-foreground">
            {isSubmitting ? "Saving..." : submitLabel}
          </Text>
        </Button>
      }
      testID="goal-editor-modal"
      title={title}
    >
      <Form {...form}>
        <View className="gap-4">
          <View className="gap-1 rounded-md border border-border bg-muted/10 px-3 py-3">
            <Text className="text-sm font-medium text-foreground">
              {goalTypeOption?.label ?? "Goal"}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {goalTypeOption?.description ??
                "Build the goal from the athlete outcome you actually care about."}
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Quick picks</Text>
            <View className="flex-row flex-wrap gap-2">
              {GOAL_PRESETS.map((preset) => (
                <Pressable
                  key={preset.label}
                  onPress={() => handlePresetPress(preset)}
                  className="rounded-full bg-secondary px-3 py-2"
                >
                  <Text className="text-xs text-secondary-foreground">{preset.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Goal focus</Text>
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
                <SelectValue placeholder="Select goal focus" />
              </SelectTrigger>
              <SelectContent>
                <NativeSelectScrollView>
                  {GOAL_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} label={option.label} value={option.value}>
                      <View className="gap-0.5">
                        <Text className="text-sm font-medium text-foreground">{option.label}</Text>
                        <Text className="text-xs text-muted-foreground">{option.description}</Text>
                      </View>
                    </SelectItem>
                  ))}
                </NativeSelectScrollView>
              </SelectContent>
            </Select>
          </View>

          <FormTextField
            control={form.control}
            disabled={isSubmitting}
            label="Goal title"
            name="title"
            placeholder="e.g., Spring 10K or Raise FTP"
            testId="goal-editor-title-input"
          />

          <FormDateInputField
            control={form.control}
            label="Target date"
            name="targetDate"
            minimumDate={new Date()}
            required
            description="Choose the date this goal should be tracked against on your calendar."
            testId="goal-target-date"
          />

          {supportsActivityChoice(draft.goalType) ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">Sport</Text>
              <ToggleGroup
                type="single"
                value={draft.activityCategory ?? undefined}
                onValueChange={(nextValue: string | undefined) => {
                  if (nextValue) {
                    updateDraft({
                      activityCategory: nextValue as GoalEditorDraft["activityCategory"],
                    });
                  }
                }}
                className="flex-row flex-wrap gap-2"
              >
                {ACTIVITY_OPTIONS.map((option) => {
                  const isActive = option.value === draft.activityCategory;
                  return (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className={`rounded-full border px-3 py-2 ${
                        isActive ? "border-primary bg-primary" : "border-border bg-background"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          isActive ? "text-primary-foreground" : "text-foreground"
                        }`}
                      >
                        {option.label}
                      </Text>
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </View>
          ) : null}

          {draft.goalType === "race_performance" || draft.goalType === "completion" ? (
            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <Text className="text-sm font-medium text-foreground">
                {draft.goalType === "race_performance" ? "Event setup" : "Completion setup"}
              </Text>

              {distancePresets.length > 0 ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-foreground">Suggested distances</Text>
                  <ToggleGroup
                    type="single"
                    value={draft.raceDistanceKm == null ? undefined : String(draft.raceDistanceKm)}
                    onValueChange={(nextValue: string | undefined) => {
                      if (nextValue) {
                        updateDraft({ raceDistanceKm: Number(nextValue) });
                      }
                    }}
                    className="flex-row flex-wrap gap-2"
                  >
                    {distancePresets.map((preset) => {
                      const isActive = nearlyEqual(draft.raceDistanceKm, preset.value);
                      return (
                        <ToggleGroupItem
                          key={`${draft.activityCategory}-${preset.label}`}
                          value={String(preset.value)}
                          className={`rounded-full border px-3 py-2 ${
                            isActive ? "border-primary bg-primary" : "border-border bg-background"
                          }`}
                        >
                          <Text
                            className={`text-xs ${
                              isActive ? "text-primary-foreground" : "text-foreground"
                            }`}
                          >
                            {preset.label}
                          </Text>
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </View>
              ) : null}

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
                placeholder="e.g., 21.1"
                helperText={
                  draft.goalType === "completion"
                    ? "Leave this blank if duration is the only thing that matters."
                    : "Choose the distance you want to race."
                }
                accessibilityHint="Enter distance in kilometers"
              />

              {draft.goalType === "race_performance" ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-foreground">Target style</Text>
                  <View className="gap-2">
                    {RACE_TARGET_MODE_OPTIONS.map((option) => {
                      const isActive = (draft.raceTargetMode ?? "time") === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => updateDraft({ raceTargetMode: option.value })}
                          className={`rounded-lg border px-3 py-3 ${
                            isActive ? "border-primary bg-primary/10" : "border-border bg-card"
                          }`}
                        >
                          <View className="flex-row items-start gap-3">
                            <SelectionIndicator active={isActive} />
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-foreground">
                                {option.label}
                              </Text>
                              <Text className="mt-1 text-xs text-muted-foreground">
                                {option.description}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {draft.goalType === "completion" || (draft.raceTargetMode ?? "time") === "time" ? (
                <DurationInput
                  id="goal-duration"
                  label={draft.goalType === "completion" ? "Target duration" : "Goal time"}
                  value={draft.targetDuration ?? ""}
                  onChange={(value) => updateDraft({ targetDuration: value })}
                  placeholder={draft.goalType === "completion" ? "e.g., 2:30:00" : "e.g., 0:25:00"}
                  helperText={
                    draft.goalType === "completion"
                      ? "Optional if distance alone defines success."
                      : "Use a finish time athletes recognize instantly."
                  }
                />
              ) : null}

              {draft.goalType === "race_performance" &&
              (draft.raceTargetMode ?? "time") === "pace" ? (
                <PaceInput
                  id="goal-race-pace"
                  label="Goal pace"
                  value={draft.targetPace ?? ""}
                  onChange={(value) => updateDraft({ targetPace: value })}
                  helperText="Save the pace you want to average on race day."
                />
              ) : null}
            </View>
          ) : null}

          {draft.goalType === "pace_threshold" ? (
            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <Text className="text-sm font-medium text-foreground">Run pace target</Text>
              <PaceInput
                id="goal-threshold-pace"
                label="Target pace"
                value={draft.targetPace ?? ""}
                onChange={(value) => updateDraft({ targetPace: value })}
                helperText="Use athlete pace, not raw meters per second."
              />
              <DurationInput
                id="goal-threshold-pace-duration"
                label="Test duration"
                value={draft.thresholdTestDuration ?? ""}
                onChange={(value) => updateDraft({ thresholdTestDuration: value })}
                helperText="Usually the duration of the effort or benchmark test."
              />
            </View>
          ) : null}

          {draft.goalType === "power_threshold" ? (
            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <Text className="text-sm font-medium text-foreground">Bike power target</Text>
              <BoundedNumberInput
                id="goal-power"
                label="Target watts"
                value={draft.targetWatts == null ? "" : String(draft.targetWatts)}
                onChange={() => undefined}
                onNumberChange={(value) => updateDraft({ targetWatts: value ?? null })}
                min={1}
                max={2000}
                decimals={0}
                unitLabel="W"
                placeholder="e.g., 285"
                helperText="Whole watts keep the target clear and honest."
                accessibilityHint="Enter target power in watts"
              />
              <DurationInput
                id="goal-power-duration"
                label="Test duration"
                value={draft.thresholdTestDuration ?? ""}
                onChange={(value) => updateDraft({ thresholdTestDuration: value })}
                helperText="Default is 20 minutes, but keep it explicit."
              />
            </View>
          ) : null}

          {draft.goalType === "hr_threshold" ? (
            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <Text className="text-sm font-medium text-foreground">Threshold heart rate</Text>
              <BoundedNumberInput
                id="goal-heart-rate"
                label="Target heart rate"
                value={draft.targetBpm == null ? "" : String(draft.targetBpm)}
                onChange={() => undefined}
                onNumberChange={(value) => updateDraft({ targetBpm: value ?? null })}
                min={1}
                max={260}
                decimals={0}
                unitLabel="bpm"
                placeholder="e.g., 168"
                helperText="Save bpm directly instead of a hidden canonical number."
                accessibilityHint="Enter target threshold heart rate in beats per minute"
              />
            </View>
          ) : null}

          {draft.goalType === "consistency" ? (
            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <Text className="text-sm font-medium text-foreground">Consistency target</Text>
              <FormIntegerStepperField
                control={form.control}
                label="Sessions per week"
                name="consistencySessionsPerWeek"
                min={0}
                max={14}
                description="Choose the weekly rhythm you actually want to keep."
                testId="goal-consistency-sessions"
              />
              <FormIntegerStepperField
                control={form.control}
                label="Planned weeks"
                name="consistencyWeeks"
                min={0}
                max={52}
                description="Optional, but useful when the consistency block has an end date."
                testId="goal-consistency-weeks"
              />
            </View>
          ) : null}

          <FormIntegerStepperField
            control={form.control}
            label="Importance"
            name="importance"
            min={0}
            max={10}
            description="Higher priority goals get more planning attention."
            testId="goal-importance"
          />
        </View>
      </Form>
    </AppFormModal>
  );
}
