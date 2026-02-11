import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

export type GoalTargetType =
  | "race_performance"
  | "pace_threshold"
  | "power_threshold"
  | "hr_threshold";

export interface GoalTargetFormData {
  id: string;
  targetType: GoalTargetType;
  activityCategory?: "run" | "bike" | "swim" | "other";
  distanceKm?: string;
  completionTimeHms?: string;
  paceMmSs?: string;
  testDurationHms?: string;
  targetWatts?: number;
  targetLthrBpm?: number;
}

export interface GoalFormData {
  id: string;
  name: string;
  targetDate: string;
  priority: number;
  targets: GoalTargetFormData[];
}

export interface TrainingPlanFormData {
  goals: GoalFormData[];
}

interface SinglePageFormProps {
  formData: TrainingPlanFormData;
  onFormDataChange: (data: TrainingPlanFormData) => void;
  errors?: Record<string, string>;
}

interface EditingTargetRef {
  goalId: string;
  targetId: string;
}

const createLocalId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createEmptyTarget = (): GoalTargetFormData => ({
  id: createLocalId(),
  targetType: "race_performance",
  activityCategory: "run",
});

const createEmptyGoal = (targetDate?: string): GoalFormData => ({
  id: createLocalId(),
  name: "",
  targetDate: targetDate ?? new Date().toISOString().split("T")[0] ?? "",
  priority: 1,
  targets: [createEmptyTarget()],
});

const raceDistancePresetsByCategory: Record<
  "run" | "bike" | "swim" | "other",
  Array<{ label: string; km: string }>
> = {
  run: [
    { label: "5K", km: "5" },
    { label: "10K", km: "10" },
    { label: "Half", km: "21.1" },
    { label: "Marathon", km: "42.2" },
  ],
  bike: [
    { label: "20K TT", km: "20" },
    { label: "40K TT", km: "40" },
    { label: "Gran Fondo", km: "100" },
    { label: "Century", km: "160" },
  ],
  swim: [
    { label: "400m", km: "0.4" },
    { label: "800m", km: "0.8" },
    { label: "1500m", km: "1.5" },
    { label: "5K", km: "5" },
  ],
  other: [
    { label: "1K", km: "1" },
    { label: "5K", km: "5" },
    { label: "10K", km: "10" },
  ],
};

const targetTypeOptions: { value: GoalTargetType; label: string }[] = [
  { value: "race_performance", label: "Race Performance" },
  { value: "pace_threshold", label: "Pace Threshold" },
  { value: "power_threshold", label: "Power Threshold" },
  { value: "hr_threshold", label: "HR Threshold" },
];

const activityCategoryOptions: Array<{
  value: "run" | "bike" | "swim" | "other";
  label: string;
}> = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "other", label: "Other" },
];

const getActivityCategoryLabel = (
  category?: GoalTargetFormData["activityCategory"],
) => activityCategoryOptions.find((option) => option.value === category)?.label;

const parseNumberOrUndefined = (value: string): number | undefined => {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getTargetTypeLabel = (targetType: GoalTargetType) => {
  return targetTypeOptions.find((option) => option.value === targetType)?.label;
};

const getTargetSummary = (target: GoalTargetFormData) => {
  if (target.targetType === "race_performance") {
    const parts = [];
    const categoryLabel = getActivityCategoryLabel(target.activityCategory);
    if (categoryLabel) {
      parts.push(categoryLabel);
    }
    if (target.distanceKm?.trim()) {
      parts.push(`${target.distanceKm.trim()} km`);
    }
    if (target.completionTimeHms?.trim()) {
      parts.push(target.completionTimeHms.trim());
    }
    return parts.length > 0 ? parts.join(" - ") : "Distance + completion time";
  }

  if (target.targetType === "pace_threshold") {
    const parts = [];
    const categoryLabel = getActivityCategoryLabel(target.activityCategory);
    if (categoryLabel) {
      parts.push(categoryLabel);
    }
    if (target.paceMmSs?.trim()) {
      parts.push(`${target.paceMmSs.trim()} /km`);
    }
    if (target.testDurationHms?.trim()) {
      parts.push(`test ${target.testDurationHms.trim()}`);
    }
    return parts.length > 0 ? parts.join(" - ") : "Pace + test duration";
  }

  if (target.targetType === "power_threshold") {
    const parts = [];
    const categoryLabel = getActivityCategoryLabel(target.activityCategory);
    if (categoryLabel) {
      parts.push(categoryLabel);
    }
    if (target.targetWatts !== undefined) {
      parts.push(`${target.targetWatts} W`);
    }
    if (target.testDurationHms?.trim()) {
      parts.push(`test ${target.testDurationHms.trim()}`);
    }
    return parts.length > 0 ? parts.join(" - ") : "Watts + test duration";
  }

  if (target.targetLthrBpm !== undefined) {
    return `${target.targetLthrBpm} bpm`;
  }
  return "LTHR bpm";
};

export function SinglePageForm({
  formData,
  onFormDataChange,
  errors = {},
}: SinglePageFormProps) {
  const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>(() => {
    const firstGoal = formData.goals[0];
    return firstGoal ? [firstGoal.id] : [];
  });
  const [editingTargetRef, setEditingTargetRef] =
    useState<EditingTargetRef | null>(null);
  const [datePickerGoalId, setDatePickerGoalId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedGoalIds((prev) => {
      const existing = new Set(formData.goals.map((goal) => goal.id));
      const next = prev.filter((id) => existing.has(id));

      const firstGoal = formData.goals[0];
      if (firstGoal && !next.includes(firstGoal.id)) {
        next.unshift(firstGoal.id);
      }

      return next;
    });
  }, [formData.goals]);

  useEffect(() => {
    if (!editingTargetRef) {
      return;
    }

    const goal = formData.goals.find(
      (item) => item.id === editingTargetRef.goalId,
    );
    const target = goal?.targets.find(
      (item) => item.id === editingTargetRef.targetId,
    );
    if (!goal || !target) {
      setEditingTargetRef(null);
    }
  }, [editingTargetRef, formData.goals]);

  const editingContext = useMemo(() => {
    if (!editingTargetRef) {
      return null;
    }

    const goalIndex = formData.goals.findIndex(
      (goal) => goal.id === editingTargetRef.goalId,
    );
    if (goalIndex < 0) {
      return null;
    }

    const goal = formData.goals[goalIndex];
    const targetIndex = goal.targets.findIndex(
      (target) => target.id === editingTargetRef.targetId,
    );
    if (targetIndex < 0) {
      return null;
    }

    return {
      goal,
      goalIndex,
      target: goal.targets[targetIndex],
      targetIndex,
    };
  }, [editingTargetRef, formData.goals]);

  const updateGoal = (goalId: string, updates: Partial<GoalFormData>) => {
    onFormDataChange({
      goals: formData.goals.map((goal) =>
        goal.id === goalId ? { ...goal, ...updates } : goal,
      ),
    });
  };

  const updateTarget = (
    goalId: string,
    targetId: string,
    updates: Partial<GoalTargetFormData>,
  ) => {
    onFormDataChange({
      goals: formData.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        return {
          ...goal,
          targets: goal.targets.map((target) =>
            target.id === targetId ? { ...target, ...updates } : target,
          ),
        };
      }),
    });
  };

  const addGoal = () => {
    const referenceTargetDate =
      formData.goals[0]?.targetDate ??
      new Date().toISOString().split("T")[0] ??
      "";

    const newGoal = createEmptyGoal(referenceTargetDate);
    onFormDataChange({
      goals: [...formData.goals, newGoal],
    });
    setExpandedGoalIds((prev) => [...prev, newGoal.id]);
  };

  const removeGoal = (goalId: string) => {
    if (formData.goals.length <= 1) {
      return;
    }

    onFormDataChange({
      goals: formData.goals.filter((goal) => goal.id !== goalId),
    });
    setExpandedGoalIds((prev) => prev.filter((id) => id !== goalId));
  };

  const toggleGoalExpanded = (goalId: string) => {
    setExpandedGoalIds((prev) =>
      prev.includes(goalId)
        ? prev.filter((id) => id !== goalId)
        : [...prev, goalId],
    );
  };

  const addTarget = (goalId: string) => {
    const target = createEmptyTarget();
    onFormDataChange({
      goals: formData.goals.map((goal) =>
        goal.id === goalId
          ? { ...goal, targets: [...goal.targets, target] }
          : goal,
      ),
    });
    setEditingTargetRef({ goalId, targetId: target.id });
  };

  const removeTarget = (goalId: string, targetId: string) => {
    onFormDataChange({
      goals: formData.goals.map((goal) => {
        if (goal.id !== goalId) {
          return goal;
        }

        if (goal.targets.length <= 1) {
          return goal;
        }

        return {
          ...goal,
          targets: goal.targets.filter((target) => target.id !== targetId),
        };
      }),
    });
  };

  const applyRaceDistancePreset = (
    goalId: string,
    targetId: string,
    km: string,
  ) => {
    updateTarget(goalId, targetId, { distanceKm: km });
  };

  const getError = (path: string) => errors[path];

  const parseGoalDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  };

  const handleGoalDateChange = (
    goalId: string,
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      setDatePickerGoalId(null);
      return;
    }

    if (selectedDate) {
      const isoDate = selectedDate.toISOString().split("T")[0] ?? "";
      updateGoal(goalId, { targetDate: isoDate });
    }

    setDatePickerGoalId(null);
  };

  const getTargetRowError = (goalIndex: number, targetIndex: number) => {
    const prefix = `goals.${goalIndex}.targets.${targetIndex}`;
    return (
      getError(`${prefix}.targetType`) ??
      getError(`${prefix}.distanceKm`) ??
      getError(`${prefix}.completionTimeHms`) ??
      getError(`${prefix}.paceMmSs`) ??
      getError(`${prefix}.activityCategory`) ??
      getError(`${prefix}.testDurationHms`) ??
      getError(`${prefix}.targetWatts`) ??
      getError(`${prefix}.targetLthrBpm`)
    );
  };

  const closeTargetEditor = () => setEditingTargetRef(null);

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        <View className="gap-4">
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">
              Your plan starts with one primary goal. Additional goals are
              optional.
            </Text>
            {errors.goals && (
              <Text className="text-xs text-destructive">{errors.goals}</Text>
            )}
          </View>

          {formData.goals.map((goal, goalIndex) => (
            <View
              key={goal.id}
              className="gap-3 rounded-lg border border-border bg-muted/20 p-3"
            >
              <View className="flex-row items-center justify-between">
                <Pressable
                  onPress={() => toggleGoalExpanded(goal.id)}
                  className="flex-1 flex-row items-center justify-between pr-2"
                >
                  <Text className="font-semibold">
                    {goalIndex === 0
                      ? "Primary Goal"
                      : `Goal ${goalIndex + 1} (Optional)`}
                  </Text>
                  {expandedGoalIds.includes(goal.id) ? (
                    <ChevronUp size={18} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={18} className="text-muted-foreground" />
                  )}
                </Pressable>
                <Button
                  variant="outline"
                  size="icon"
                  onPress={() => removeGoal(goal.id)}
                  disabled={formData.goals.length <= 1 || goalIndex === 0}
                >
                  <Trash2 size={16} className="text-muted-foreground" />
                </Button>
              </View>

              {goalIndex > 0 && !expandedGoalIds.includes(goal.id) && (
                <Text className="text-xs text-muted-foreground">
                  Tap to expand this optional goal.
                </Text>
              )}

              {expandedGoalIds.includes(goal.id) && (
                <>
                  <View className="gap-2">
                    <Label nativeID={`goal-name-${goal.id}`}>
                      <Text className="text-sm font-medium">
                        Goal Name <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby={`goal-name-${goal.id}`}
                      placeholder="e.g., Spring Half Marathon"
                      value={goal.name}
                      onChangeText={(value) =>
                        updateGoal(goal.id, { name: value })
                      }
                      autoFocus={goalIndex === 0}
                      maxLength={100}
                    />
                    {getError(`goals.${goalIndex}.name`) && (
                      <Text className="text-xs text-destructive">
                        {getError(`goals.${goalIndex}.name`)}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID={`target-date-${goal.id}`}>
                      <Text className="text-sm font-medium">
                        Target Date <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Pressable
                      onPress={() => setDatePickerGoalId(goal.id)}
                      className="rounded-md border border-input bg-background px-3 py-3"
                    >
                      <Text>
                        {format(
                          parseGoalDate(goal.targetDate),
                          "EEE, MMM d, yyyy",
                        )}
                      </Text>
                    </Pressable>
                    {datePickerGoalId === goal.id && (
                      <DateTimePicker
                        value={parseGoalDate(goal.targetDate)}
                        mode="date"
                        display="default"
                        minimumDate={new Date()}
                        onChange={(event, selectedDate) =>
                          handleGoalDateChange(goal.id, event, selectedDate)
                        }
                      />
                    )}
                    {getError(`goals.${goalIndex}.targetDate`) && (
                      <Text className="text-xs text-destructive">
                        {getError(`goals.${goalIndex}.targetDate`)}
                      </Text>
                    )}
                  </View>

                  <View className="gap-3 rounded-lg border border-border bg-background/80 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-medium">Targets</Text>
                      <Button
                        variant="outline"
                        size="icon"
                        onPress={() => addTarget(goal.id)}
                      >
                        <Plus size={16} className="text-muted-foreground" />
                      </Button>
                    </View>

                    {goal.targets.map((target, targetIndex) => {
                      const rowError = getTargetRowError(
                        goalIndex,
                        targetIndex,
                      );
                      return (
                        <View
                          key={target.id}
                          className="gap-2 rounded-md border border-border bg-muted/20 p-3"
                        >
                          <Pressable
                            onPress={() =>
                              setEditingTargetRef({
                                goalId: goal.id,
                                targetId: target.id,
                              })
                            }
                            className="gap-1"
                          >
                            <Text className="text-sm font-medium">
                              {getTargetTypeLabel(target.targetType)}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {getTargetSummary(target)}
                            </Text>
                          </Pressable>

                          <View className="flex-row justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onPress={() =>
                                setEditingTargetRef({
                                  goalId: goal.id,
                                  targetId: target.id,
                                })
                              }
                            >
                              <Pencil
                                size={16}
                                className="text-muted-foreground"
                              />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onPress={() => removeTarget(goal.id, target.id)}
                              disabled={goal.targets.length <= 1}
                            >
                              <Trash2
                                size={16}
                                className="text-muted-foreground"
                              />
                            </Button>
                          </View>

                          {rowError && (
                            <Text className="text-xs text-destructive">
                              {rowError}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          ))}

          <Button
            variant="outline"
            onPress={addGoal}
            className="flex-row gap-2"
          >
            <Plus size={16} className="text-muted-foreground" />
            <Text>Add Optional Goal</Text>
          </Button>
        </View>

        <View className="h-12" />
      </ScrollView>

      <Modal
        visible={Boolean(editingContext)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeTargetEditor}
      >
        <View className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-base font-semibold">Edit Target</Text>
            <Button variant="outline" size="sm" onPress={closeTargetEditor}>
              <Text>Done</Text>
            </Button>
          </View>

          {editingContext && (
            <ScrollView
              className="flex-1"
              contentContainerClassName="gap-4 px-4 py-4 pb-10"
            >
              <View className="gap-2">
                <Label nativeID="editor-target-type">
                  <Text className="text-sm font-medium">
                    Target Type <Text className="text-destructive">*</Text>
                  </Text>
                </Label>
                <Select
                  value={{
                    value: editingContext.target.targetType,
                    label:
                      getTargetTypeLabel(editingContext.target.targetType) ??
                      "Target Type",
                  }}
                  onValueChange={(option) => {
                    if (!option?.value) {
                      return;
                    }
                    const nextType = option.value as GoalTargetType;
                    const defaultCategory =
                      nextType === "race_performance" ||
                      nextType === "pace_threshold"
                        ? "run"
                        : nextType === "power_threshold"
                          ? "bike"
                          : undefined;
                    updateTarget(
                      editingContext.goal.id,
                      editingContext.target.id,
                      {
                        targetType: nextType,
                        activityCategory:
                          nextType === "race_performance" ||
                          nextType === "pace_threshold" ||
                          nextType === "power_threshold"
                            ? (editingContext.target.activityCategory ??
                              defaultCategory)
                            : undefined,
                      },
                    );
                  }}
                >
                  <SelectTrigger aria-labelledby="editor-target-type">
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetTypeOptions.map((option) => (
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
                {getError(
                  `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetType`,
                ) && (
                  <Text className="text-xs text-destructive">
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetType`,
                    )}
                  </Text>
                )}
              </View>

              {editingContext.target.targetType === "race_performance" && (
                <>
                  <View className="gap-2">
                    <Label nativeID="editor-race-category">
                      <Text className="text-sm font-medium">
                        Activity <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Select
                      value={
                        editingContext.target.activityCategory
                          ? {
                              value: editingContext.target.activityCategory,
                              label:
                                getActivityCategoryLabel(
                                  editingContext.target.activityCategory,
                                ) ?? "Activity",
                            }
                          : undefined
                      }
                      onValueChange={(option) => {
                        if (!option?.value) {
                          return;
                        }
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            activityCategory: option.value as
                              | "run"
                              | "bike"
                              | "swim"
                              | "other",
                          },
                        );
                      }}
                    >
                      <SelectTrigger aria-labelledby="editor-race-category">
                        <SelectValue placeholder="Select activity" />
                      </SelectTrigger>
                      <SelectContent>
                        {activityCategoryOptions.map((option) => (
                          <SelectItem
                            key={`race-${option.value}`}
                            label={option.label}
                            value={option.value}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.activityCategory`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.activityCategory`,
                        )}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID="editor-distance">
                      <Text className="text-sm font-medium">
                        Distance (km){" "}
                        <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="editor-distance"
                      value={editingContext.target.distanceKm ?? ""}
                      onChangeText={(value) =>
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            distanceKm: value,
                          },
                        )
                      }
                      keyboardType="numbers-and-punctuation"
                      placeholder="e.g., 21.1"
                    />
                    <View className="flex-row flex-wrap gap-2">
                      {(
                        raceDistancePresetsByCategory[
                          editingContext.target.activityCategory ?? "run"
                        ] ?? raceDistancePresetsByCategory.run
                      ).map((preset) => (
                        <Button
                          key={`${editingContext.goal.id}-${editingContext.target.id}-${preset.label}`}
                          variant="outline"
                          size="sm"
                          onPress={() =>
                            applyRaceDistancePreset(
                              editingContext.goal.id,
                              editingContext.target.id,
                              preset.km,
                            )
                          }
                        >
                          <Text>{preset.label}</Text>
                        </Button>
                      ))}
                    </View>
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.distanceKm`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.distanceKm`,
                        )}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID="editor-race-time">
                      <Text className="text-sm font-medium">
                        Completion Time (h:mm:ss){" "}
                        <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="editor-race-time"
                      value={editingContext.target.completionTimeHms ?? ""}
                      onChangeText={(value) =>
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            completionTimeHms: value,
                          },
                        )
                      }
                      keyboardType="numbers-and-punctuation"
                      placeholder="e.g., 1:35:00"
                    />
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.completionTimeHms`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.completionTimeHms`,
                        )}
                      </Text>
                    )}
                  </View>
                </>
              )}

              {editingContext.target.targetType === "pace_threshold" && (
                <>
                  <View className="gap-2">
                    <Label nativeID="editor-pace-category">
                      <Text className="text-sm font-medium">
                        Activity <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Select
                      value={
                        editingContext.target.activityCategory
                          ? {
                              value: editingContext.target.activityCategory,
                              label:
                                getActivityCategoryLabel(
                                  editingContext.target.activityCategory,
                                ) ?? "Activity",
                            }
                          : undefined
                      }
                      onValueChange={(option) => {
                        if (!option?.value) {
                          return;
                        }
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            activityCategory: option.value as
                              | "run"
                              | "bike"
                              | "swim"
                              | "other",
                          },
                        );
                      }}
                    >
                      <SelectTrigger aria-labelledby="editor-pace-category">
                        <SelectValue placeholder="Select activity" />
                      </SelectTrigger>
                      <SelectContent>
                        {activityCategoryOptions.map((option) => (
                          <SelectItem
                            key={`pace-${option.value}`}
                            label={option.label}
                            value={option.value}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.activityCategory`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.activityCategory`,
                        )}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID="editor-pace">
                      <Text className="text-sm font-medium">
                        Target Pace (mm:ss){" "}
                        <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="editor-pace"
                      value={editingContext.target.paceMmSs ?? ""}
                      onChangeText={(value) =>
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            paceMmSs: value,
                          },
                        )
                      }
                      keyboardType="numbers-and-punctuation"
                      placeholder="e.g., 4:15"
                    />
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.paceMmSs`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.paceMmSs`,
                        )}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID="editor-pace-test-duration">
                      <Text className="text-sm font-medium">
                        Required Test Duration (h:mm:ss){" "}
                        <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="editor-pace-test-duration"
                      value={editingContext.target.testDurationHms ?? ""}
                      onChangeText={(value) =>
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            testDurationHms: value,
                          },
                        )
                      }
                      keyboardType="numbers-and-punctuation"
                      placeholder="e.g., 0:20:00"
                    />
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                        )}
                      </Text>
                    )}
                  </View>
                </>
              )}

              {editingContext.target.targetType === "power_threshold" && (
                <>
                  <View className="gap-2">
                    <Label nativeID="editor-power-category">
                      <Text className="text-sm font-medium">
                        Activity <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Select
                      value={
                        editingContext.target.activityCategory
                          ? {
                              value: editingContext.target.activityCategory,
                              label:
                                getActivityCategoryLabel(
                                  editingContext.target.activityCategory,
                                ) ?? "Activity",
                            }
                          : undefined
                      }
                      onValueChange={(option) => {
                        if (!option?.value) {
                          return;
                        }
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            activityCategory: option.value as
                              | "run"
                              | "bike"
                              | "swim"
                              | "other",
                          },
                        );
                      }}
                    >
                      <SelectTrigger aria-labelledby="editor-power-category">
                        <SelectValue placeholder="Select activity" />
                      </SelectTrigger>
                      <SelectContent>
                        {activityCategoryOptions.map((option) => (
                          <SelectItem
                            key={`power-${option.value}`}
                            label={option.label}
                            value={option.value}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.activityCategory`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.activityCategory`,
                        )}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID="editor-power-watts">
                      <Text className="text-sm font-medium">
                        Target Watts <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="editor-power-watts"
                      value={
                        editingContext.target.targetWatts === undefined
                          ? ""
                          : String(editingContext.target.targetWatts)
                      }
                      onChangeText={(value) =>
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            targetWatts: parseNumberOrUndefined(value),
                          },
                        )
                      }
                      keyboardType="numeric"
                      placeholder="e.g., 285"
                    />
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetWatts`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetWatts`,
                        )}
                      </Text>
                    )}
                  </View>

                  <View className="gap-2">
                    <Label nativeID="editor-power-test-duration">
                      <Text className="text-sm font-medium">
                        Required Test Duration (h:mm:ss){" "}
                        <Text className="text-destructive">*</Text>
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="editor-power-test-duration"
                      value={editingContext.target.testDurationHms ?? ""}
                      onChangeText={(value) =>
                        updateTarget(
                          editingContext.goal.id,
                          editingContext.target.id,
                          {
                            testDurationHms: value,
                          },
                        )
                      }
                      keyboardType="numbers-and-punctuation"
                      placeholder="e.g., 0:20:00"
                    />
                    {getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                    ) && (
                      <Text className="text-xs text-destructive">
                        {getError(
                          `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                        )}
                      </Text>
                    )}
                  </View>
                </>
              )}

              {editingContext.target.targetType === "hr_threshold" && (
                <View className="gap-2">
                  <Label nativeID="editor-lthr-bpm">
                    <Text className="text-sm font-medium">
                      LTHR (bpm) <Text className="text-destructive">*</Text>
                    </Text>
                  </Label>
                  <Input
                    aria-labelledby="editor-lthr-bpm"
                    value={
                      editingContext.target.targetLthrBpm === undefined
                        ? ""
                        : String(editingContext.target.targetLthrBpm)
                    }
                    onChangeText={(value) =>
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          targetLthrBpm: parseNumberOrUndefined(value),
                        },
                      )
                    }
                    keyboardType="numeric"
                    placeholder="e.g., 168"
                  />
                  {getError(
                    `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetLthrBpm`,
                  ) && (
                    <Text className="text-xs text-destructive">
                      {getError(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetLthrBpm`,
                      )}
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}
