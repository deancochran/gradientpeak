import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { DurationInput } from "@repo/ui/components/duration-input";
import { Label } from "@repo/ui/components/label";
import { PaceInput } from "@repo/ui/components/pace-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { Modal, ScrollView, View } from "react-native";
import { parseNumberOrUndefined } from "../../../lib/training-plan-form/input-parsers";
import type { GoalTargetFormData, GoalTargetType } from "./SinglePageForm";

type ActivityCategory = NonNullable<GoalTargetFormData["activityCategory"]>;

export interface GoalTargetEditorContext {
  goalId: string;
  goalIndex: number;
  target: GoalTargetFormData;
  targetIndex: number;
}

interface GoalTargetEditorModalProps {
  editingContext: GoalTargetEditorContext | null;
  getError: (path: string) => string | undefined;
  onClose: () => void;
  onUpdateTarget: (goalId: string, targetId: string, updates: Partial<GoalTargetFormData>) => void;
}

const raceDistancePresetsByCategory: Record<ActivityCategory, { label: string; km: string }[]> = {
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

export const targetTypeOptions: { value: GoalTargetType; label: string }[] = [
  { value: "race_performance", label: "Race goal" },
  { value: "pace_threshold", label: "Pace test" },
  { value: "power_threshold", label: "Power test" },
  { value: "hr_threshold", label: "Heart-rate threshold" },
];

const activityCategoryOptions: { value: ActivityCategory; label: string }[] = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "other", label: "Other" },
];

export const getTargetTypeLabel = (targetType: GoalTargetType) => {
  return targetTypeOptions.find((option) => option.value === targetType)?.label;
};

export const getActivityCategoryLabel = (activityCategory: ActivityCategory) => {
  return activityCategoryOptions.find((option) => option.value === activityCategory)?.label;
};

const getTargetFieldError = (
  editingContext: GoalTargetEditorContext,
  field: keyof Omit<GoalTargetFormData, "id">,
  getError: GoalTargetEditorModalProps["getError"],
) => {
  return getError(
    `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.${String(field)}`,
  );
};

export function GoalTargetEditorModal({
  editingContext,
  getError,
  onClose,
  onUpdateTarget,
}: GoalTargetEditorModalProps) {
  return (
    <Modal
      visible={Boolean(editingContext)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Text className="text-base font-semibold">Edit Target</Text>
          <Button variant="outline" size="sm" onPress={onClose}>
            <Text>Done</Text>
          </Button>
        </View>

        {editingContext ? (
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 py-4 pb-10">
            <View className="gap-2">
              <Label nativeID="editor-target-type">
                <Text className="text-sm font-medium">
                  Target Type<Text className="text-destructive">*</Text>
                </Text>
              </Label>
              <Select
                value={{
                  value: editingContext.target.targetType,
                  label: getTargetTypeLabel(editingContext.target.targetType) ?? "Target Type",
                }}
                onValueChange={(option) => {
                  if (!option?.value) {
                    return;
                  }

                  const nextType = option.value as GoalTargetType;
                  const defaultCategory =
                    nextType === "race_performance" || nextType === "pace_threshold"
                      ? "run"
                      : nextType === "power_threshold"
                        ? "bike"
                        : undefined;

                  onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                    targetType: nextType,
                    activityCategory:
                      nextType === "race_performance" ||
                      nextType === "pace_threshold" ||
                      nextType === "power_threshold"
                        ? (editingContext.target.activityCategory ?? defaultCategory)
                        : undefined,
                  });
                }}
              >
                <SelectTrigger
                  accessibilityLabel="Target type"
                  className={
                    getTargetFieldError(editingContext, "targetType", getError)
                      ? "border-destructive bg-destructive/5"
                      : undefined
                  }
                >
                  <SelectValue placeholder="Select target type" />
                </SelectTrigger>
                <SelectContent>
                  {targetTypeOptions.map((option) => (
                    <SelectItem key={option.value} label={option.label} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getTargetFieldError(editingContext, "targetType", getError) ? (
                <Text className="text-xs text-destructive">
                  {getTargetFieldError(editingContext, "targetType", getError)}
                </Text>
              ) : null}
            </View>

            {editingContext.target.targetType === "race_performance" ? (
              <>
                <View className="gap-2">
                  <Label nativeID="editor-race-category">
                    <Text className="text-sm font-medium">
                      Activity<Text className="text-destructive">*</Text>
                    </Text>
                  </Label>
                  <Select
                    value={
                      editingContext.target.activityCategory
                        ? {
                            value: editingContext.target.activityCategory,
                            label:
                              getActivityCategoryLabel(editingContext.target.activityCategory) ??
                              "Activity",
                          }
                        : undefined
                    }
                    onValueChange={(option) => {
                      if (!option?.value) {
                        return;
                      }

                      onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                        activityCategory: option.value as ActivityCategory,
                      });
                    }}
                  >
                    <SelectTrigger
                      accessibilityLabel="Activity"
                      className={
                        getTargetFieldError(editingContext, "activityCategory", getError)
                          ? "border-destructive bg-destructive/5"
                          : undefined
                      }
                    >
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
                  {getTargetFieldError(editingContext, "activityCategory", getError) ? (
                    <Text className="text-xs text-destructive">
                      {getTargetFieldError(editingContext, "activityCategory", getError)}
                    </Text>
                  ) : null}
                </View>

                <BoundedNumberInput
                  id="editor-distance"
                  label="Distance"
                  value={editingContext.target.distanceKm ?? ""}
                  onChange={(nextValue) => {
                    onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                      distanceKm: nextValue,
                    });
                  }}
                  min={0.1}
                  max={1000}
                  decimals={2}
                  unitLabel="km"
                  placeholder="e.g., 21.1"
                  helperText="Enter distance in kilometers"
                  required
                  presets={(
                    raceDistancePresetsByCategory[
                      editingContext.target.activityCategory ?? "run"
                    ] ?? raceDistancePresetsByCategory.run
                  ).map((preset) => ({
                    label: preset.label,
                    value: preset.km,
                  }))}
                  error={getTargetFieldError(editingContext, "distanceKm", getError)}
                  accessibilityHint="Enter distance in kilometers, for example 21.1"
                />

                <DurationInput
                  id="editor-race-time"
                  label="Completion Time"
                  value={editingContext.target.completionTimeHms ?? ""}
                  onChange={(nextValue) => {
                    onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                      completionTimeHms: nextValue,
                    });
                  }}
                  placeholder="e.g., 1:35:00"
                  required
                  error={getTargetFieldError(editingContext, "completionTimeHms", getError)}
                  accessibilityHint="Enter completion time in h:mm:ss format"
                />
              </>
            ) : null}

            {editingContext.target.targetType === "pace_threshold" ? (
              <>
                <View className="gap-2">
                  <Label nativeID="editor-pace-category">
                    <Text className="text-sm font-medium">
                      Activity<Text className="text-destructive">*</Text>
                    </Text>
                  </Label>
                  <Select
                    value={
                      editingContext.target.activityCategory
                        ? {
                            value: editingContext.target.activityCategory,
                            label:
                              getActivityCategoryLabel(editingContext.target.activityCategory) ??
                              "Activity",
                          }
                        : undefined
                    }
                    onValueChange={(option) => {
                      if (!option?.value) {
                        return;
                      }

                      onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                        activityCategory: option.value as ActivityCategory,
                      });
                    }}
                  >
                    <SelectTrigger
                      accessibilityLabel="Activity"
                      className={
                        getTargetFieldError(editingContext, "activityCategory", getError)
                          ? "border-destructive bg-destructive/5"
                          : undefined
                      }
                    >
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
                  {getTargetFieldError(editingContext, "activityCategory", getError) ? (
                    <Text className="text-xs text-destructive">
                      {getTargetFieldError(editingContext, "activityCategory", getError)}
                    </Text>
                  ) : null}
                </View>

                <PaceInput
                  id="editor-pace"
                  label="Target Pace"
                  value={editingContext.target.paceMmSs ?? ""}
                  onChange={(nextValue) => {
                    onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                      paceMmSs: nextValue,
                    });
                  }}
                  required
                  error={getTargetFieldError(editingContext, "paceMmSs", getError)}
                  accessibilityHint="Enter pace in mm:ss per kilometer"
                />

                <DurationInput
                  id="editor-pace-test-duration"
                  label="Required Test Duration"
                  value={editingContext.target.testDurationHms ?? ""}
                  onChange={(nextValue) => {
                    onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                      testDurationHms: nextValue,
                    });
                  }}
                  placeholder="e.g., 0:20:00"
                  required
                  error={getTargetFieldError(editingContext, "testDurationHms", getError)}
                  accessibilityHint="Enter test duration in h:mm:ss format"
                />
              </>
            ) : null}

            {editingContext.target.targetType === "power_threshold" ? (
              <>
                <View className="gap-2">
                  <Label nativeID="editor-power-category">
                    <Text className="text-sm font-medium">
                      Activity<Text className="text-destructive">*</Text>
                    </Text>
                  </Label>
                  <Select
                    value={
                      editingContext.target.activityCategory
                        ? {
                            value: editingContext.target.activityCategory,
                            label:
                              getActivityCategoryLabel(editingContext.target.activityCategory) ??
                              "Activity",
                          }
                        : undefined
                    }
                    onValueChange={(option) => {
                      if (!option?.value) {
                        return;
                      }

                      onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                        activityCategory: option.value as ActivityCategory,
                      });
                    }}
                  >
                    <SelectTrigger
                      accessibilityLabel="Activity"
                      className={
                        getTargetFieldError(editingContext, "activityCategory", getError)
                          ? "border-destructive bg-destructive/5"
                          : undefined
                      }
                    >
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
                  {getTargetFieldError(editingContext, "activityCategory", getError) ? (
                    <Text className="text-xs text-destructive">
                      {getTargetFieldError(editingContext, "activityCategory", getError)}
                    </Text>
                  ) : null}
                </View>

                <BoundedNumberInput
                  id="editor-power-watts"
                  label="Target Watts"
                  value={
                    editingContext.target.targetWatts === undefined
                      ? ""
                      : String(editingContext.target.targetWatts)
                  }
                  onChange={(value) => {
                    onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                      targetWatts: parseNumberOrUndefined(value),
                    });
                  }}
                  min={1}
                  max={2000}
                  decimals={0}
                  unitLabel="W"
                  required
                  placeholder="e.g., 285"
                  helperText="Enter whole watts"
                  error={getTargetFieldError(editingContext, "targetWatts", getError)}
                  accessibilityHint="Enter target power in whole watts"
                />

                <DurationInput
                  id="editor-power-test-duration"
                  label="Required Test Duration"
                  value={editingContext.target.testDurationHms ?? ""}
                  onChange={(nextValue) => {
                    onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                      testDurationHms: nextValue,
                    });
                  }}
                  placeholder="e.g., 0:20:00"
                  required
                  error={getTargetFieldError(editingContext, "testDurationHms", getError)}
                  accessibilityHint="Enter test duration in h:mm:ss format"
                />
              </>
            ) : null}

            {editingContext.target.targetType === "hr_threshold" ? (
              <BoundedNumberInput
                id="editor-lthr-bpm"
                label="LTHR"
                value={
                  editingContext.target.targetLthrBpm === undefined
                    ? ""
                    : String(editingContext.target.targetLthrBpm)
                }
                onChange={(value) => {
                  onUpdateTarget(editingContext.goalId, editingContext.target.id, {
                    targetLthrBpm: parseNumberOrUndefined(value),
                  });
                }}
                min={1}
                max={260}
                decimals={0}
                unitLabel="bpm"
                required
                placeholder="e.g., 168"
                helperText="Enter heart rate in beats per minute"
                error={getTargetFieldError(editingContext, "targetLthrBpm", getError)}
                accessibilityHint="Enter lactate threshold heart rate in bpm"
              />
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}
