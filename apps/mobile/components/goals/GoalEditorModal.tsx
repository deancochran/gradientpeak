import {
  createEmptyGoalDraft,
  type GoalEditorDraft,
  type GoalEditorGoalType,
  type GoalEditorRaceTargetMode,
} from "@repo/core";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { DurationInput } from "@repo/ui/components/duration-input";
import { Input } from "@repo/ui/components/input";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { PaceInput } from "@repo/ui/components/pace-input";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { Text } from "@repo/ui/components/text";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TouchableOpacity, View } from "react-native";

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

export function GoalEditorModal({
  visible,
  initialValue,
  submitLabel = "Save Goal",
  title = "Goal",
  isSubmitting = false,
  onClose,
  onSubmit,
}: GoalEditorModalProps) {
  const [draft, setDraft] = useState<GoalEditorDraft>(initialValue);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft({
      ...createEmptyGoalDraft(),
      ...initialValue,
    });
  }, [initialValue, visible]);

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
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleGoalTypeChange = (goalType: GoalEditorGoalType) => {
    const base = createEmptyGoalDraft();

    setDraft((current) => ({
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
    }));
  };

  const handlePresetPress = (preset: GoalPreset) => {
    const base = createEmptyGoalDraft();

    setDraft((current) => ({
      ...base,
      title: preset.title,
      targetDate: current.targetDate,
      importance: current.importance,
      goalType: preset.goalType,
      activityCategory: preset.activityCategory,
      raceDistanceKm: preset.raceDistanceKm ?? base.raceDistanceKm,
      raceTargetMode: preset.raceTargetMode ?? base.raceTargetMode,
    }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
          <Text className="text-lg font-semibold text-foreground">{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            className="rounded-md bg-muted px-3 py-2"
            activeOpacity={0.8}
          >
            <Text className="text-xs text-foreground">Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 py-4">
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
            <RadioGroup
              value={draft.goalType}
              onValueChange={(nextValue) => {
                handleGoalTypeChange(nextValue as GoalEditorGoalType);
              }}
              className="gap-2"
            >
              {GOAL_TYPE_OPTIONS.map((option) => {
                const isActive = option.value === draft.goalType;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleGoalTypeChange(option.value)}
                    className={`rounded-lg border px-3 py-3 ${
                      isActive ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <View className="flex-row items-start gap-3">
                      <RadioGroupItem value={option.value} />
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
            </RadioGroup>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium text-foreground">Goal title</Text>
            <Input
              value={draft.title}
              onChangeText={(text) => updateDraft({ title: text })}
              placeholder="e.g., Spring 10K or Raise FTP"
              editable={!isSubmitting}
            />
          </View>

          <DateField
            id="goal-target-date"
            label="Target date"
            value={draft.targetDate || undefined}
            onChange={(value) => updateDraft({ targetDate: value ?? "" })}
            minimumDate={new Date()}
            required
            helperText="Goals stay linked to a milestone date."
          />

          {supportsActivityChoice(draft.goalType) ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">Sport</Text>
              <ToggleGroup
                type="single"
                value={draft.activityCategory ?? undefined}
                onValueChange={(nextValue) => {
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
                    onValueChange={(nextValue) => {
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
                  <RadioGroup
                    value={draft.raceTargetMode ?? "time"}
                    onValueChange={(nextValue) => {
                      updateDraft({ raceTargetMode: nextValue as GoalEditorRaceTargetMode });
                    }}
                    className="gap-2"
                  >
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
                            <RadioGroupItem value={option.value} />
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
                  </RadioGroup>
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
              <IntegerStepper
                id="goal-consistency-sessions"
                label="Sessions per week"
                value={draft.consistencySessionsPerWeek ?? 0}
                min={0}
                max={14}
                onChange={(value) => updateDraft({ consistencySessionsPerWeek: value })}
                helperText="Choose the weekly rhythm you actually want to keep."
              />
              <IntegerStepper
                id="goal-consistency-weeks"
                label="Planned weeks"
                value={draft.consistencyWeeks ?? 0}
                min={0}
                max={52}
                onChange={(value) => updateDraft({ consistencyWeeks: value })}
                helperText="Optional, but useful when the consistency block has an end date."
              />
            </View>
          ) : null}

          <IntegerStepper
            id="goal-importance"
            label="Importance"
            value={draft.importance}
            min={0}
            max={10}
            onChange={(value) => updateDraft({ importance: value })}
            helperText="Higher priority goals get more planning attention."
          />
        </ScrollView>

        <View className="border-t border-border px-4 py-4">
          <Button onPress={() => onSubmit(draft)} disabled={!canSubmit} className="w-full">
            <Text className="text-primary-foreground">
              {isSubmitting ? "Saving..." : submitLabel}
            </Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
