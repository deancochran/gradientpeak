import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import type {
  CreationAvailabilityConfig,
  CreationConfigLocks,
  CreationConstraints,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  CreationProvenance,
  CreationRecentInfluenceAction,
  CreationValueSource,
} from "@repo/core";

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

export interface TrainingPlanConfigFormData {
  availabilityConfig: CreationAvailabilityConfig;
  availabilityProvenance: CreationProvenance;
  baselineLoadWeeklyTss: number;
  baselineLoadProvenance: CreationProvenance;
  recentInfluenceScore: number;
  recentInfluenceAction: CreationRecentInfluenceAction;
  recentInfluenceProvenance: CreationProvenance;
  constraints: CreationConstraints;
  constraintsSource: CreationValueSource;
  locks: CreationConfigLocks;
}

export interface TrainingPlanConfigConflict {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  suggestions: string[];
}

interface SinglePageFormProps {
  formData: TrainingPlanFormData;
  onFormDataChange: (data: TrainingPlanFormData) => void;
  showCreationConfig?: boolean;
  configData: TrainingPlanConfigFormData;
  contextSummary?: CreationContextSummary;
  feasibilitySafetySummary?: CreationFeasibilitySafetySummary;
  conflictItems?: TrainingPlanConfigConflict[];
  informationalConflicts?: string[];
  isPreviewPending?: boolean;
  onConfigChange: (data: TrainingPlanConfigFormData) => void;
  onResolveConflict: (code: string) => void;
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

const availabilityTemplateOptions: Array<{
  value: CreationAvailabilityConfig["template"];
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "custom", label: "Custom" },
];

const goalDifficultyOptions: Array<{
  value: NonNullable<CreationConstraints["goal_difficulty_preference"]>;
  label: string;
}> = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced" },
  { value: "stretch", label: "Stretch" },
];

const weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]> = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const getWeekDayLabel = (day: string) =>
  day.slice(0, 1).toUpperCase() + day.slice(1, 3);

const formatMinutesAsTime = (minuteOfDay: number) => {
  const clamped = Math.max(0, Math.min(1439, minuteOfDay));
  const hours = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (clamped % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const getSourceBadgeVariant = (source: CreationValueSource) => {
  if (source === "user") return "default";
  if (source === "suggested") return "secondary";
  return "outline";
};

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
  showCreationConfig = true,
  configData,
  contextSummary,
  feasibilitySafetySummary,
  conflictItems = [],
  informationalConflicts = [],
  isPreviewPending = false,
  onConfigChange,
  onResolveConflict,
  errors = {},
}: SinglePageFormProps) {
  const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>(() => {
    const firstGoal = formData.goals[0];
    return firstGoal ? [firstGoal.id] : [];
  });
  const [editingTargetRef, setEditingTargetRef] =
    useState<EditingTargetRef | null>(null);
  const [datePickerGoalId, setDatePickerGoalId] = useState<string | null>(null);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>(
    {
      availability: false,
      baseline: false,
      influence: false,
      constraints: false,
    },
  );
  const [showContextDetails, setShowContextDetails] = useState(false);

  const setPanelExpanded = (panel: keyof typeof expandedPanels) => {
    setExpandedPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const updateConfig = (
    updater: (draft: TrainingPlanConfigFormData) => void,
  ) => {
    const next = {
      ...configData,
      constraints: {
        ...configData.constraints,
        hard_rest_days: [...configData.constraints.hard_rest_days],
      },
      locks: { ...configData.locks },
    };
    updater(next);
    onConfigChange(next);
  };

  const setFieldLock = (field: keyof CreationConfigLocks, locked: boolean) => {
    updateConfig((draft) => {
      draft.locks[field] = locked
        ? { locked: true, locked_by: "user" }
        : { locked: false };
    });
  };

  const selectedAvailabilityDays = configData.availabilityConfig.days.filter(
    (day) => day.windows.length > 0,
  ).length;
  const restDaysCount = configData.constraints.hard_rest_days.length;
  const baselineSource = configData.baselineLoadProvenance.source;
  const influenceSource = configData.recentInfluenceProvenance.source;

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
          {showCreationConfig && (
            <>
              <View className="gap-3 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="font-semibold">
                      Suggested setup context
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {contextSummary
                        ? `Based on ${contextSummary.history_availability_state} history and signal quality ${(contextSummary.signal_quality * 100).toFixed(0)}%`
                        : "Loading profile-aware defaults..."}
                    </Text>
                  </View>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => setShowContextDetails((prev) => !prev)}
                  >
                    <Text>{showContextDetails ? "Hide why" : "View why"}</Text>
                  </Button>
                </View>
                {showContextDetails && contextSummary && (
                  <View className="gap-1 rounded-md bg-muted/40 p-2">
                    <Text className="text-xs text-muted-foreground">
                      Consistency: {contextSummary.recent_consistency_marker}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Effort confidence:{" "}
                      {contextSummary.effort_confidence_marker}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Profile completeness:{" "}
                      {contextSummary.profile_metric_completeness_marker}
                    </Text>
                    {contextSummary.rationale_codes.slice(0, 4).map((code) => (
                      <Text
                        key={code}
                        className="text-xs text-muted-foreground"
                      >
                        - {code}
                      </Text>
                    ))}
                  </View>
                )}
              </View>

              {informationalConflicts.length > 0 && (
                <View className="gap-2 rounded-lg border border-amber-300 bg-amber-100/40 p-3">
                  <View className="flex-row items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <Text className="font-medium text-amber-800">
                      Locked field notices
                    </Text>
                  </View>
                  {informationalConflicts.map((conflict) => (
                    <Text key={conflict} className="text-xs text-amber-800">
                      - {conflict}
                    </Text>
                  ))}
                </View>
              )}

              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="font-semibold">Configuration</Text>

                <Pressable
                  onPress={() => setPanelExpanded("availability")}
                  className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium">Availability</Text>
                    <Text className="text-xs text-muted-foreground">
                      {selectedAvailabilityDays} training day(s), template{" "}
                      {configData.availabilityConfig.template}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge
                      variant={getSourceBadgeVariant(
                        configData.availabilityProvenance.source,
                      )}
                    >
                      <Text>{configData.availabilityProvenance.source}</Text>
                    </Badge>
                    {expandedPanels.availability ? (
                      <ChevronUp size={16} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-muted-foreground"
                      />
                    )}
                  </View>
                </Pressable>

                {expandedPanels.availability && (
                  <View className="gap-3 rounded-md border border-border bg-muted/20 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-medium">
                        Lock availability
                      </Text>
                      <View className="flex-row items-center gap-2">
                        {configData.locks.availability_config.locked ? (
                          <Lock size={14} className="text-primary" />
                        ) : (
                          <LockOpen
                            size={14}
                            className="text-muted-foreground"
                          />
                        )}
                        <Switch
                          checked={configData.locks.availability_config.locked}
                          onCheckedChange={(value) =>
                            setFieldLock("availability_config", Boolean(value))
                          }
                        />
                      </View>
                    </View>

                    <View className="gap-2">
                      <Label nativeID="availability-template">
                        <Text className="text-sm font-medium">Template</Text>
                      </Label>
                      <Select
                        value={{
                          value: configData.availabilityConfig.template,
                          label:
                            availabilityTemplateOptions.find(
                              (option) =>
                                option.value ===
                                configData.availabilityConfig.template,
                            )?.label ?? "Moderate",
                        }}
                        onValueChange={(option) => {
                          if (!option?.value) return;
                          updateConfig((draft) => {
                            draft.availabilityConfig = {
                              ...draft.availabilityConfig,
                              template:
                                option.value as CreationAvailabilityConfig["template"],
                            };
                            draft.availabilityProvenance = {
                              ...draft.availabilityProvenance,
                              source: "user",
                              updated_at: new Date().toISOString(),
                            };
                          });
                        }}
                      >
                        <SelectTrigger aria-labelledby="availability-template">
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          {availabilityTemplateOptions.map((option) => (
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
                    </View>

                    <View className="gap-2">
                      <Text className="text-xs text-muted-foreground">
                        Optional day-level edits
                      </Text>
                      {weekDays.map((day) => {
                        const dayConfig =
                          configData.availabilityConfig.days.find(
                            (item) => item.day === day,
                          ) ?? configData.availabilityConfig.days[0];
                        if (!dayConfig) {
                          return null;
                        }

                        const isAvailable = dayConfig.windows.length > 0;
                        const startLabel = isAvailable
                          ? formatMinutesAsTime(
                              dayConfig.windows[0]?.start_minute_of_day ?? 360,
                            )
                          : "-";
                        const endLabel = isAvailable
                          ? formatMinutesAsTime(
                              dayConfig.windows[0]?.end_minute_of_day ?? 450,
                            )
                          : "-";

                        return (
                          <View
                            key={day}
                            className="flex-row items-center justify-between rounded-md border border-border px-2 py-2"
                          >
                            <Text className="text-sm">
                              {getWeekDayLabel(day)}
                            </Text>
                            <View className="flex-row items-center gap-2">
                              <Text className="text-xs text-muted-foreground">
                                {startLabel}-{endLabel}
                              </Text>
                              <Switch
                                checked={isAvailable}
                                onCheckedChange={(value) => {
                                  const nextValue = Boolean(value);
                                  updateConfig((draft) => {
                                    draft.availabilityConfig = {
                                      ...draft.availabilityConfig,
                                      template: "custom",
                                      days: draft.availabilityConfig.days.map(
                                        (candidate) =>
                                          candidate.day === day
                                            ? {
                                                ...candidate,
                                                windows: nextValue
                                                  ? [
                                                      {
                                                        start_minute_of_day: 360,
                                                        end_minute_of_day: 450,
                                                      },
                                                    ]
                                                  : [],
                                                max_sessions: nextValue ? 1 : 0,
                                              }
                                            : candidate,
                                      ),
                                    };
                                    draft.availabilityProvenance = {
                                      ...draft.availabilityProvenance,
                                      source: "user",
                                      updated_at: new Date().toISOString(),
                                    };
                                  });
                                }}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                <Pressable
                  onPress={() => setPanelExpanded("baseline")}
                  className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium">Baseline load</Text>
                    <Text className="text-xs text-muted-foreground">
                      {configData.baselineLoadWeeklyTss} weekly TSS
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={getSourceBadgeVariant(baselineSource)}>
                      <Text>{baselineSource}</Text>
                    </Badge>
                    {expandedPanels.baseline ? (
                      <ChevronUp size={16} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-muted-foreground"
                      />
                    )}
                  </View>
                </Pressable>

                {expandedPanels.baseline && (
                  <View className="gap-3 rounded-md border border-border bg-muted/20 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-medium">
                        Lock baseline load
                      </Text>
                      <View className="flex-row items-center gap-2">
                        {configData.locks.baseline_load.locked ? (
                          <Lock size={14} className="text-primary" />
                        ) : (
                          <LockOpen
                            size={14}
                            className="text-muted-foreground"
                          />
                        )}
                        <Switch
                          checked={configData.locks.baseline_load.locked}
                          onCheckedChange={(value) =>
                            setFieldLock("baseline_load", Boolean(value))
                          }
                        />
                      </View>
                    </View>
                    <View className="gap-1">
                      <Text className="text-xs text-muted-foreground">
                        Confidence:{" "}
                        {(
                          (configData.baselineLoadProvenance.confidence ?? 0) *
                          100
                        ).toFixed(0)}
                        %
                      </Text>
                    </View>
                    <Input
                      keyboardType="numeric"
                      value={String(configData.baselineLoadWeeklyTss)}
                      onChangeText={(value) => {
                        const parsed = Number(value);
                        if (!Number.isFinite(parsed)) return;
                        updateConfig((draft) => {
                          draft.baselineLoadWeeklyTss = Math.max(
                            30,
                            Math.round(parsed),
                          );
                          draft.baselineLoadProvenance = {
                            ...draft.baselineLoadProvenance,
                            source: "user",
                            updated_at: new Date().toISOString(),
                          };
                        });
                      }}
                    />
                  </View>
                )}

                <Pressable
                  onPress={() => setPanelExpanded("influence")}
                  className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium">
                      Recent influence
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {configData.recentInfluenceAction} (
                      {configData.recentInfluenceScore.toFixed(2)})
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge variant={getSourceBadgeVariant(influenceSource)}>
                      <Text>{influenceSource}</Text>
                    </Badge>
                    {expandedPanels.influence ? (
                      <ChevronUp size={16} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-muted-foreground"
                      />
                    )}
                  </View>
                </Pressable>

                {expandedPanels.influence && (
                  <View className="gap-3 rounded-md border border-border bg-muted/20 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-medium">
                        Lock recent influence
                      </Text>
                      <View className="flex-row items-center gap-2">
                        {configData.locks.recent_influence.locked ? (
                          <Lock size={14} className="text-primary" />
                        ) : (
                          <LockOpen
                            size={14}
                            className="text-muted-foreground"
                          />
                        )}
                        <Switch
                          checked={configData.locks.recent_influence.locked}
                          onCheckedChange={(value) =>
                            setFieldLock("recent_influence", Boolean(value))
                          }
                        />
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      {(["accepted", "edited", "disabled"] as const).map(
                        (action) => (
                          <Button
                            key={action}
                            variant={
                              configData.recentInfluenceAction === action
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onPress={() => {
                              updateConfig((draft) => {
                                draft.recentInfluenceAction = action;
                                if (action === "disabled") {
                                  draft.recentInfluenceScore = 0;
                                  draft.recentInfluenceProvenance = {
                                    ...draft.recentInfluenceProvenance,
                                    source: "user",
                                    updated_at: new Date().toISOString(),
                                  };
                                }
                                if (action === "accepted") {
                                  draft.recentInfluenceProvenance = {
                                    ...draft.recentInfluenceProvenance,
                                    source: "suggested",
                                    updated_at: new Date().toISOString(),
                                  };
                                }
                              });
                            }}
                          >
                            <Text>{action}</Text>
                          </Button>
                        ),
                      )}
                    </View>

                    <Input
                      keyboardType="numbers-and-punctuation"
                      value={String(configData.recentInfluenceScore)}
                      onChangeText={(value) => {
                        const parsed = Number(value);
                        if (!Number.isFinite(parsed)) return;
                        updateConfig((draft) => {
                          draft.recentInfluenceScore = Math.max(
                            -1,
                            Math.min(1, Number(parsed.toFixed(3))),
                          );
                          draft.recentInfluenceAction = "edited";
                          draft.recentInfluenceProvenance = {
                            ...draft.recentInfluenceProvenance,
                            source: "user",
                            updated_at: new Date().toISOString(),
                          };
                        });
                      }}
                    />
                  </View>
                )}

                <Pressable
                  onPress={() => setPanelExpanded("constraints")}
                  className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium">Constraints</Text>
                    <Text className="text-xs text-muted-foreground">
                      Rest {restDaysCount}d, sessions{" "}
                      {configData.constraints.min_sessions_per_week ?? 0}-
                      {configData.constraints.max_sessions_per_week ?? 0}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Badge
                      variant={getSourceBadgeVariant(
                        configData.constraintsSource,
                      )}
                    >
                      <Text>{configData.constraintsSource}</Text>
                    </Badge>
                    {expandedPanels.constraints ? (
                      <ChevronUp size={16} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="text-muted-foreground"
                      />
                    )}
                  </View>
                </Pressable>

                {expandedPanels.constraints && (
                  <View className="gap-3 rounded-md border border-border bg-muted/20 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm">Weekly floor TSS</Text>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-xs text-muted-foreground">
                          Lock
                        </Text>
                        <Switch
                          checked={
                            configData.locks.weekly_load_floor_tss.locked
                          }
                          onCheckedChange={(value) =>
                            setFieldLock(
                              "weekly_load_floor_tss",
                              Boolean(value),
                            )
                          }
                        />
                      </View>
                    </View>
                    <Input
                      keyboardType="numeric"
                      value={String(
                        configData.constraints.weekly_load_floor_tss ?? "",
                      )}
                      onChangeText={(value) => {
                        const parsed = Number(value);
                        if (!Number.isFinite(parsed)) return;
                        updateConfig((draft) => {
                          draft.constraints.weekly_load_floor_tss = Math.max(
                            0,
                            Math.round(parsed),
                          );
                          draft.constraintsSource = "user";
                        });
                      }}
                    />

                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm">Weekly cap TSS</Text>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-xs text-muted-foreground">
                          Lock
                        </Text>
                        <Switch
                          checked={configData.locks.weekly_load_cap_tss.locked}
                          onCheckedChange={(value) =>
                            setFieldLock("weekly_load_cap_tss", Boolean(value))
                          }
                        />
                      </View>
                    </View>
                    <Input
                      keyboardType="numeric"
                      value={String(
                        configData.constraints.weekly_load_cap_tss ?? "",
                      )}
                      onChangeText={(value) => {
                        const parsed = Number(value);
                        if (!Number.isFinite(parsed)) return;
                        updateConfig((draft) => {
                          draft.constraints.weekly_load_cap_tss = Math.max(
                            0,
                            Math.round(parsed),
                          );
                          draft.constraintsSource = "user";
                        });
                      }}
                    />

                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm">Sessions / week</Text>
                      <View className="flex-row items-center gap-2">
                        <Switch
                          checked={
                            configData.locks.min_sessions_per_week.locked
                          }
                          onCheckedChange={(value) =>
                            setFieldLock(
                              "min_sessions_per_week",
                              Boolean(value),
                            )
                          }
                        />
                        <Switch
                          checked={
                            configData.locks.max_sessions_per_week.locked
                          }
                          onCheckedChange={(value) =>
                            setFieldLock(
                              "max_sessions_per_week",
                              Boolean(value),
                            )
                          }
                        />
                      </View>
                    </View>
                    <View className="flex-row gap-2">
                      <Input
                        keyboardType="numeric"
                        value={String(
                          configData.constraints.min_sessions_per_week ?? "",
                        )}
                        onChangeText={(value) => {
                          const parsed = Number(value);
                          if (!Number.isFinite(parsed)) return;
                          updateConfig((draft) => {
                            draft.constraints.min_sessions_per_week = Math.max(
                              0,
                              Math.round(parsed),
                            );
                            draft.constraintsSource = "user";
                          });
                        }}
                        className="flex-1"
                      />
                      <Input
                        keyboardType="numeric"
                        value={String(
                          configData.constraints.max_sessions_per_week ?? "",
                        )}
                        onChangeText={(value) => {
                          const parsed = Number(value);
                          if (!Number.isFinite(parsed)) return;
                          updateConfig((draft) => {
                            draft.constraints.max_sessions_per_week = Math.max(
                              0,
                              Math.round(parsed),
                            );
                            draft.constraintsSource = "user";
                          });
                        }}
                        className="flex-1"
                      />
                    </View>

                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm">Hard rest days</Text>
                        <Switch
                          checked={configData.locks.hard_rest_days.locked}
                          onCheckedChange={(value) =>
                            setFieldLock("hard_rest_days", Boolean(value))
                          }
                        />
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        {weekDays.map((day) => {
                          const selected =
                            configData.constraints.hard_rest_days.includes(day);
                          return (
                            <Button
                              key={`rest-${day}`}
                              variant={selected ? "default" : "outline"}
                              size="sm"
                              onPress={() => {
                                updateConfig((draft) => {
                                  draft.constraints.hard_rest_days = selected
                                    ? draft.constraints.hard_rest_days.filter(
                                        (candidate) => candidate !== day,
                                      )
                                    : [
                                        ...draft.constraints.hard_rest_days,
                                        day,
                                      ];
                                  draft.constraintsSource = "user";
                                });
                              }}
                            >
                              <Text>{getWeekDayLabel(day)}</Text>
                            </Button>
                          );
                        })}
                      </View>
                    </View>

                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm">
                          Max session duration (min)
                        </Text>
                        <Switch
                          checked={
                            configData.locks.max_single_session_duration_minutes
                              .locked
                          }
                          onCheckedChange={(value) =>
                            setFieldLock(
                              "max_single_session_duration_minutes",
                              Boolean(value),
                            )
                          }
                        />
                      </View>
                      <Input
                        keyboardType="numeric"
                        value={String(
                          configData.constraints
                            .max_single_session_duration_minutes ?? "",
                        )}
                        onChangeText={(value) => {
                          const parsed = Number(value);
                          if (!Number.isFinite(parsed)) return;
                          updateConfig((draft) => {
                            draft.constraints.max_single_session_duration_minutes =
                              Math.max(20, Math.round(parsed));
                            draft.constraintsSource = "user";
                          });
                        }}
                      />
                    </View>

                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm">Goal difficulty</Text>
                        <Switch
                          checked={
                            configData.locks.goal_difficulty_preference.locked
                          }
                          onCheckedChange={(value) =>
                            setFieldLock(
                              "goal_difficulty_preference",
                              Boolean(value),
                            )
                          }
                        />
                      </View>
                      <Select
                        value={{
                          value:
                            configData.constraints.goal_difficulty_preference ??
                            "balanced",
                          label:
                            goalDifficultyOptions.find(
                              (option) =>
                                option.value ===
                                configData.constraints
                                  .goal_difficulty_preference,
                            )?.label ?? "Balanced",
                        }}
                        onValueChange={(option) => {
                          if (!option?.value) return;
                          updateConfig((draft) => {
                            draft.constraints.goal_difficulty_preference =
                              option.value as
                                | "conservative"
                                | "balanced"
                                | "stretch";
                            draft.constraintsSource = "user";
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose preference" />
                        </SelectTrigger>
                        <SelectContent>
                          {goalDifficultyOptions.map((option) => (
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
                    </View>
                  </View>
                )}
              </View>

              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Feasibility and safety</Text>
                  {isPreviewPending && (
                    <Text className="text-xs text-muted-foreground">
                      Refreshing...
                    </Text>
                  )}
                </View>
                {feasibilitySafetySummary ? (
                  <>
                    <View className="flex-row gap-2">
                      <Badge
                        variant={
                          feasibilitySafetySummary.feasibility_band ===
                          "on-track"
                            ? "default"
                            : "secondary"
                        }
                      >
                        <Text>{feasibilitySafetySummary.feasibility_band}</Text>
                      </Badge>
                      <Badge
                        variant={
                          feasibilitySafetySummary.safety_band === "safe"
                            ? "default"
                            : feasibilitySafetySummary.safety_band === "caution"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        <Text>{feasibilitySafetySummary.safety_band}</Text>
                      </Badge>
                    </View>
                    {feasibilitySafetySummary.top_drivers
                      .slice(0, 3)
                      .map((driver) => (
                        <Text
                          key={driver.code}
                          className="text-xs text-muted-foreground"
                        >
                          - {driver.message}
                        </Text>
                      ))}
                  </>
                ) : (
                  <Text className="text-xs text-muted-foreground">
                    Complete required goal fields to compute pre-submit safety.
                  </Text>
                )}
              </View>

              {conflictItems.length > 0 && (
                <View className="gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <View className="flex-row items-center gap-2">
                    <ShieldAlert size={16} className="text-destructive" />
                    <Text className="font-semibold text-destructive">
                      Resolve blocking conflicts
                    </Text>
                  </View>
                  {conflictItems.map((conflict) => (
                    <View
                      key={`${conflict.code}-${conflict.message}`}
                      className="gap-1 rounded-md border border-destructive/30 p-2"
                    >
                      <Text className="text-sm text-destructive">
                        {conflict.message}
                      </Text>
                      {conflict.suggestions.map((suggestion) => (
                        <Text
                          key={`${conflict.code}-${suggestion}`}
                          className="text-xs text-destructive"
                        >
                          - {suggestion}
                        </Text>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => onResolveConflict(conflict.code)}
                      >
                        <Text>Apply quick fix</Text>
                      </Button>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

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
