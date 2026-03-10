import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { IntegerStepper } from "@/components/training-plan/create/inputs/IntegerStepper";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import type { GoalEditorDraft } from "@/lib/goals/goalDraft";

interface GoalEditorModalProps {
  visible: boolean;
  initialValue: GoalEditorDraft;
  submitLabel?: string;
  title?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (value: GoalEditorDraft) => void;
}

const COMMON_GOALS = [
  "Marathon",
  "Half Marathon",
  "10K",
  "5K",
  "Sprint Triathlon",
  "Olympic Triathlon",
  "Century Ride",
];

const GOAL_TYPE_OPTIONS = [
  { value: "race_performance", label: "Race" },
  { value: "pace_threshold", label: "Pace" },
  { value: "power_threshold", label: "Power" },
  { value: "hr_threshold", label: "Heart Rate" },
  { value: "general", label: "General" },
];

type TargetMetricOption = {
  value: string | null;
  label: string;
};

const TARGET_METRIC_OPTIONS_BY_GOAL_TYPE: Record<string, TargetMetricOption[]> =
  {
    race_performance: [
      { value: "target_time_s", label: "Target time (seconds)" },
      { value: "target_speed_mps", label: "Target speed (m/s)" },
    ],
    pace_threshold: [
      { value: "target_speed_mps", label: "Target speed (m/s)" },
    ],
    power_threshold: [{ value: "target_watts", label: "Target watts" }],
    hr_threshold: [
      { value: "target_lthr_bpm", label: "Target threshold HR (bpm)" },
    ],
    general: [],
  };

function getMetricOptions(goalType: string): TargetMetricOption[] {
  const typedOptions = TARGET_METRIC_OPTIONS_BY_GOAL_TYPE[goalType] ?? [];
  return [{ value: null, label: "None" }, ...typedOptions];
}

function normalizeTargetMetric(
  goalType: string,
  metric: string | null | undefined,
) {
  const availableOptions = getMetricOptions(goalType);
  const hasMetric = availableOptions.some((option) => option.value === metric);
  return hasMetric ? (metric ?? null) : (availableOptions[0]?.value ?? null);
}

const toDateOnly = (value: Date) => value.toISOString().split("T")[0] ?? "";

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferRaceDistanceKmFromTitle(title: string): number | null {
  const normalized = title.trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("half marathon")) return 21.1;
  if (normalized.includes("marathon")) return 42.2;
  if (/\b5k\b/.test(normalized)) return 5;
  if (/\b10k\b/.test(normalized)) return 10;
  if (normalized.includes("century")) return 160.9;
  return null;
}

function formatGoalTypeSummary(goalType: string) {
  const option = GOAL_TYPE_OPTIONS.find((item) => item.value === goalType);
  return option?.label ?? "General";
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
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft(initialValue);
  }, [initialValue, visible]);

  const parsedDate = useMemo(() => {
    if (!draft.targetDate) {
      return new Date();
    }

    const date = new Date(`${draft.targetDate}T12:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }, [draft.targetDate]);

  const targetMetricOptions = useMemo(
    () => getMetricOptions(draft.goalType),
    [draft.goalType],
  );
  const selectedTargetMetric = normalizeTargetMetric(
    draft.goalType,
    draft.targetMetric,
  );
  const showTargetControls = draft.goalType !== "general";

  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.targetDate.length > 0 &&
    !isSubmitting;

  const handleDateChange = (_: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (!selectedDate) {
      return;
    }

    setDraft((current) => ({
      ...current,
      targetDate: toDateOnly(selectedDate),
    }));

    if (Platform.OS === "ios") {
      setShowDatePicker(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="px-4 py-4 border-b border-border flex-row items-center justify-between">
          <Text className="text-lg font-semibold">{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            className="rounded-md bg-muted px-3 py-2"
            activeOpacity={0.8}
          >
            <Text className="text-xs">Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 py-4 gap-4"
        >
          <View className="rounded-md border border-border bg-muted/10 px-3 py-3 gap-1">
            <Text className="text-sm font-medium text-foreground">
              {formatGoalTypeSummary(draft.goalType)} goal
            </Text>
            <Text className="text-xs text-muted-foreground">
              Pick a title and date first. Metric details are only shown when
              they matter.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium">Goal title</Text>
            <Input
              value={draft.title}
              onChangeText={(text) =>
                setDraft((current) => ({
                  ...current,
                  title: text,
                }))
              }
              placeholder="e.g., Boston Marathon"
              editable={!isSubmitting}
            />
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium">Quick picks</Text>
            <View className="flex-row flex-wrap gap-2">
              {COMMON_GOALS.map((goal) => (
                <Pressable
                  key={goal}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      title: goal,
                      raceDistanceKm:
                        current.goalType === "race_performance"
                          ? (inferRaceDistanceKmFromTitle(goal) ??
                            current.raceDistanceKm ??
                            null)
                          : current.raceDistanceKm,
                    }))
                  }
                  className="rounded-full bg-secondary px-3 py-2"
                >
                  <Text className="text-xs text-secondary-foreground">
                    {goal}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium">Target date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="rounded-md border border-border bg-card px-3 py-3"
              activeOpacity={0.8}
            >
              <Text className="text-sm">
                {draft.targetDate
                  ? new Date(
                      `${draft.targetDate}T12:00:00.000Z`,
                    ).toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Select date"}
              </Text>
            </TouchableOpacity>
            {showDatePicker ? (
              <DateTimePicker
                value={parsedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={handleDateChange}
              />
            ) : null}
          </View>

          <View className="gap-2">
            <Text className="text-sm font-medium">Goal type</Text>
            <View className="flex-row flex-wrap gap-2">
              {GOAL_TYPE_OPTIONS.map((option) => {
                const isActive = option.value === draft.goalType;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        goalType: option.value,
                        targetMetric: normalizeTargetMetric(
                          option.value,
                          current.targetMetric,
                        ),
                      }))
                    }
                    className={`rounded-full border px-3 py-1.5 ${
                      isActive
                        ? "bg-primary border-primary"
                        : "bg-background border-border"
                    }`}
                    activeOpacity={0.8}
                  >
                    <Text
                      className={`text-xs ${
                        isActive ? "text-primary-foreground" : "text-foreground"
                      }`}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <IntegerStepper
              id="goal-importance"
              label="Importance"
              value={draft.importance}
              min={0}
              max={10}
              onChange={(nextImportance) =>
                setDraft((current) =>
                  isSubmitting
                    ? current
                    : {
                        ...current,
                        importance: nextImportance,
                      },
                )
              }
            />
          </View>

          {showTargetControls ? (
            <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
              <Text className="text-sm font-medium text-foreground">
                Performance target
              </Text>
              <View className="gap-2">
                <Text className="text-sm font-medium">Target metric</Text>
                <Select
                  disabled={isSubmitting}
                  value={{
                    value: selectedTargetMetric ?? "none",
                    label:
                      targetMetricOptions.find(
                        (option) => option.value === selectedTargetMetric,
                      )?.label ?? "None",
                  }}
                  onValueChange={(option) =>
                    setDraft((current) => ({
                      ...current,
                      targetMetric:
                        option?.value && option.value !== "none"
                          ? option.value
                          : null,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetMetricOptions.map((option) => (
                      <SelectItem
                        key={option.value ?? "none"}
                        label={option.label}
                        value={option.value ?? "none"}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </View>

              <View className="gap-2">
                <Text className="text-sm font-medium">Target value</Text>
                <Input
                  value={
                    draft.targetValue === null ||
                    draft.targetValue === undefined
                      ? ""
                      : String(draft.targetValue)
                  }
                  onChangeText={(text) =>
                    setDraft((current) => ({
                      ...current,
                      targetValue: toNullableNumber(text),
                    }))
                  }
                  placeholder="Optional"
                  keyboardType="numeric"
                  editable={!isSubmitting}
                />
              </View>

              {draft.goalType === "race_performance" ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium">
                    Race distance (km)
                  </Text>
                  <Input
                    value={
                      draft.raceDistanceKm === null ||
                      draft.raceDistanceKm === undefined
                        ? ""
                        : String(draft.raceDistanceKm)
                    }
                    onChangeText={(text) =>
                      setDraft((current) => ({
                        ...current,
                        raceDistanceKm: toNullableNumber(text),
                      }))
                    }
                    placeholder="e.g. 42.2"
                    keyboardType="numeric"
                    editable={!isSubmitting}
                  />
                  <Text className="text-xs text-muted-foreground">
                    Distance helps the projection estimate realistic demand for
                    new athletes with limited history.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View className="px-4 py-4 border-t border-border">
          <Button
            onPress={() => onSubmit(draft)}
            disabled={!canSubmit}
            className="w-full"
          >
            <Text className="text-primary-foreground">
              {isSubmitting ? "Saving..." : submitLabel}
            </Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
