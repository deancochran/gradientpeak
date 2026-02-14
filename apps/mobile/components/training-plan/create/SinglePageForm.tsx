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
import { BoundedNumberInput } from "./inputs/BoundedNumberInput";
import { DateField } from "./inputs/DateField";
import { DurationInput } from "./inputs/DurationInput";
import { IntegerStepper } from "./inputs/IntegerStepper";
import { PaceInput } from "./inputs/PaceInput";
import { PercentSliderInput } from "./inputs/PercentSliderInput";
import {
  Flag,
  Gauge,
  Heart,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  ShieldAlert,
  Trophy,
  Trash2,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { CreationProjectionChart } from "./CreationProjectionChart";
import { parseNumberOrUndefined } from "@/lib/training-plan-form/input-parsers";
import type { BlockingIssue } from "@/lib/training-plan-form/validation";
import { validateTrainingPlanForm } from "@/lib/training-plan-form/validation";
import type {
  CreationAvailabilityConfig,
  CreationConfigLocks,
  CreationConstraints,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  NoHistoryProjectionMetadata,
  ProjectionChartPayload,
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
  planStartDate?: string;
  goals: GoalFormData[];
}

export interface TrainingPlanConfigFormData {
  availabilityConfig: CreationAvailabilityConfig;
  availabilityProvenance: CreationProvenance;
  recentInfluenceScore: number;
  recentInfluenceAction: CreationRecentInfluenceAction;
  recentInfluenceProvenance: CreationProvenance;
  constraints: CreationConstraints;
  optimizationProfile: "outcome_first" | "balanced" | "sustainable";
  postGoalRecoveryDays: number;
  maxWeeklyTssRampPct: number;
  maxCtlRampPerWeek: number;
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
  projectionChart?: ProjectionChartPayload;
  configData: TrainingPlanConfigFormData;
  contextSummary?: CreationContextSummary;
  feasibilitySafetySummary?: CreationFeasibilitySafetySummary;
  informationalConflicts?: string[];
  blockingIssues?: BlockingIssue[];
  createDisabledReason?: string;
  riskAcknowledged?: boolean;
  onRiskAcknowledgedChange?: (value: boolean) => void;
  isPreviewPending?: boolean;
  onConfigChange: (data: TrainingPlanConfigFormData) => void;
  onResolveConflict: (code: string) => void;
  errors?: Record<string, string>;
}

interface EditingTargetRef {
  goalId: string;
  targetId: string;
}

type FormTabKey = "goals" | "availability" | "constraints" | "review";

const formTabs: Array<{ key: FormTabKey; label: string }> = [
  { key: "goals", label: "Goals" },
  { key: "availability", label: "Avail" },
  { key: "constraints", label: "Limits" },
  { key: "review", label: "Review" },
];

const createLocalId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createEmptyTarget = (): GoalTargetFormData => ({
  id: createLocalId(),
  targetType: "race_performance",
  activityCategory: "run",
});

const createTargetByType = (targetType: GoalTargetType): GoalTargetFormData => {
  const target = createEmptyTarget();
  if (targetType === "race_performance") {
    return target;
  }

  if (targetType === "pace_threshold") {
    return {
      ...target,
      targetType,
      activityCategory: "run",
      testDurationHms: "0:20:00",
    };
  }

  if (targetType === "power_threshold") {
    return {
      ...target,
      targetType,
      activityCategory: "bike",
      testDurationHms: "0:20:00",
    };
  }

  return {
    ...target,
    targetType,
  };
};

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
  { value: "race_performance", label: "Race goal" },
  { value: "pace_threshold", label: "Pace test" },
  { value: "power_threshold", label: "Power test" },
  { value: "hr_threshold", label: "Heart-rate threshold" },
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

const optimizationProfileOptions: Array<{
  value: TrainingPlanConfigFormData["optimizationProfile"];
  label: string;
}> = [
  { value: "outcome_first", label: "Fast progress" },
  { value: "balanced", label: "Balanced" },
  { value: "sustainable", label: "Steady" },
];

const optimizationProfileHelperCopy: Record<
  TrainingPlanConfigFormData["optimizationProfile"],
  string
> = {
  outcome_first: "Pushes progress faster.",
  balanced: "Balances progress and recovery.",
  sustainable: "Builds fitness more gradually.",
};

const optimizationProfileDetailCopy: Record<
  TrainingPlanConfigFormData["optimizationProfile"],
  string
> = {
  outcome_first:
    "Prioritizes outcome progression, but still never exceeds your weekly TSS and CTL safety caps.",
  balanced:
    "Balances progress and recovery using moderate defaults so you can improve without sustained overload.",
  sustainable:
    "Prioritizes durability with slower ramps and longer recovery to support consistent training across long horizons.",
};

const optimizationProfileVisualPresets: Record<
  TrainingPlanConfigFormData["optimizationProfile"],
  {
    postGoalRecoveryDays: number;
    maxWeeklyTssRampPct: number;
    maxCtlRampPerWeek: number;
  }
> = {
  outcome_first: {
    postGoalRecoveryDays: 2,
    maxWeeklyTssRampPct: 12,
    maxCtlRampPerWeek: 5,
  },
  balanced: {
    postGoalRecoveryDays: 5,
    maxWeeklyTssRampPct: 7,
    maxCtlRampPerWeek: 3,
  },
  sustainable: {
    postGoalRecoveryDays: 9,
    maxWeeklyTssRampPct: 4,
    maxCtlRampPerWeek: 2,
  },
};

const postGoalRecoveryHelperCopy = "Adds easy days after each goal.";

const postGoalRecoveryDetailCopy =
  "Inserts a lower-load window after each goal before the next build. Fewer days increase momentum but raise risk of accumulated fatigue.";

const maxWeeklyTssRampHelperCopy = "Caps weekly load increase.";

const maxWeeklyTssRampDetailCopy =
  "Hard cap on week-to-week load growth. Lower values improve durability; higher values can reach targets faster but increase strain.";

const maxCtlRampHelperCopy = "Caps weekly CTL increase.";

const maxCtlRampDetailCopy =
  "Hard cap on weekly CTL gain. Lower values smooth fitness progression; higher values speed adaptation but can increase risk when sustained.";

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

const getGoalSummary = (goal: GoalFormData) => {
  const trimmedName = goal.name.trim();
  const label = trimmedName || "Untitled goal";
  return `${label} - ${goal.targetDate || "No date"} - ${goal.targets.length} target(s)`;
};

const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const toNoHistoryConfidenceLabel = (
  confidence: NoHistoryProjectionMetadata["projection_floor_confidence"],
) => {
  if (!confidence) {
    return "n/a";
  }

  return confidence;
};

export function SinglePageForm({
  formData,
  onFormDataChange,
  showCreationConfig = true,
  projectionChart,
  configData,
  contextSummary,
  feasibilitySafetySummary,
  informationalConflicts = [],
  blockingIssues = [],
  createDisabledReason,
  riskAcknowledged = false,
  onRiskAcknowledgedChange,
  isPreviewPending = false,
  onConfigChange,
  onResolveConflict,
  errors = {},
}: SinglePageFormProps) {
  const { height: windowHeight } = useWindowDimensions();
  const previewChartMaxHeight = Math.floor(windowHeight * 0.2);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(
    () => formData.goals[0]?.id ?? null,
  );
  const [editingTargetRef, setEditingTargetRef] =
    useState<EditingTargetRef | null>(null);
  const [showContextDetails, setShowContextDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<FormTabKey>("goals");
  const [touchedFieldPaths, setTouchedFieldPaths] = useState<string[]>([]);

  const handleTabChange = useCallback((tab: FormTabKey) => {
    setActiveTab(tab);
  }, []);

  const updateConfig = useCallback(
    (updater: (draft: TrainingPlanConfigFormData) => void) => {
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
    },
    [configData, onConfigChange],
  );

  const setFieldLock = useCallback(
    (field: keyof CreationConfigLocks, locked: boolean) => {
      updateConfig((draft) => {
        draft.locks[field] = locked
          ? { locked: true, locked_by: "user" }
          : { locked: false };
      });
    },
    [updateConfig],
  );

  const selectedAvailabilityDays = configData.availabilityConfig.days.filter(
    (day) => day.windows.length > 0,
  ).length;
  const noHistoryMetadata = projectionChart?.no_history;
  const noHistoryReasons = noHistoryMetadata?.fitness_inference_reasons ?? [];
  const noHistoryConfidenceLabel = noHistoryMetadata
    ? toNoHistoryConfidenceLabel(noHistoryMetadata.projection_floor_confidence)
    : "n/a";
  const noHistoryFloorAppliedLabel = noHistoryMetadata?.projection_floor_applied
    ? "Yes"
    : "No";
  const noHistoryAvailabilityClampLabel =
    noHistoryMetadata?.floor_clamped_by_availability ? "Yes" : "No";
  const noHistoryAccessibilitySummary = noHistoryMetadata
    ? `No-history cues. Confidence ${noHistoryConfidenceLabel}. Floor applied ${noHistoryFloorAppliedLabel}. Availability clamp ${noHistoryAvailabilityClampLabel}.`
    : undefined;

  useEffect(() => {
    if (!formData.goals.length) {
      setActiveGoalId(null);
      return;
    }

    const stillExists = activeGoalId
      ? formData.goals.some((goal) => goal.id === activeGoalId)
      : false;

    if (!stillExists) {
      setActiveGoalId(formData.goals[0]?.id ?? null);
    }
  }, [activeGoalId, formData.goals]);

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
      ...formData,
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
      ...formData,
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

    const newGoalIndex = formData.goals.length + 1;
    const newGoal = {
      ...createEmptyGoal(referenceTargetDate),
      name: `Goal ${newGoalIndex}`,
    };
    onFormDataChange({
      ...formData,
      goals: [...formData.goals, newGoal],
    });
    setActiveGoalId(newGoal.id);
  };

  const removeGoal = (goalId: string) => {
    if (formData.goals.length <= 1) {
      return;
    }

    onFormDataChange({
      ...formData,
      goals: formData.goals.filter((goal) => goal.id !== goalId),
    });
  };

  const addTarget = (goalId: string) => {
    const target = createTargetByType("race_performance");
    onFormDataChange({
      ...formData,
      goals: formData.goals.map((goal) =>
        goal.id === goalId
          ? { ...goal, targets: [...goal.targets, target] }
          : goal,
      ),
    });
    setEditingTargetRef({ goalId, targetId: target.id });
  };

  const addTargetWithType = (goalId: string, targetType: GoalTargetType) => {
    const target = createTargetByType(targetType);
    onFormDataChange({
      ...formData,
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
      ...formData,
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

  const getError = (path: string) => errors[path] ?? inlineErrors[path];

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

  const markFieldTouched = useCallback((path: string) => {
    setTouchedFieldPaths((previous) =>
      previous.includes(path) ? previous : [...previous, path],
    );
  }, []);

  const inlineErrors = useMemo(() => {
    if (touchedFieldPaths.length === 0) {
      return {} as Record<string, string>;
    }

    const touched = new Set(touchedFieldPaths);
    const nextErrors = validateTrainingPlanForm(formData);
    const visibleErrors: Record<string, string> = {};

    for (const [path, message] of Object.entries(nextErrors)) {
      if (touched.has(path)) {
        visibleErrors[path] = message;
      }
    }

    return visibleErrors;
  }, [formData, touchedFieldPaths]);

  const activeGoal = useMemo(
    () =>
      formData.goals.find((goal) => goal.id === activeGoalId) ??
      formData.goals[0],
    [activeGoalId, formData.goals],
  );
  const activeGoalIndex = activeGoal
    ? formData.goals.findIndex((goal) => goal.id === activeGoal.id)
    : -1;
  const reviewNoticeCount = useMemo(() => {
    const blockingCount = blockingIssues.length;
    const cautionDriverCount = feasibilitySafetySummary
      ? feasibilitySafetySummary.feasibility_band === "on-track" &&
        feasibilitySafetySummary.safety_band === "safe"
        ? 0
        : feasibilitySafetySummary.top_drivers.slice(0, 3).length
      : 0;

    return blockingCount + cautionDriverCount;
  }, [blockingIssues.length, feasibilitySafetySummary]);

  return (
    <View className="flex-1">
      {showCreationConfig && (
        <CreationProjectionChart
          projectionChart={projectionChart}
          isPreviewPending={isPreviewPending}
          compact
          chartMaxHeight={previewChartMaxHeight}
        />
      )}

      <View className="px-4 pt-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-2"
          accessibilityRole="tablist"
          accessibilityLabel="Training plan setup sections"
          accessibilityHint="Swipe horizontally to browse sections, then double tap to open one"
        >
          {formTabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabChange(tab.key)}
                className={`border-b-2 px-1.5 py-2 ${isActive ? "border-primary" : "border-transparent"}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${tab.label} tab`}
                accessibilityHint={
                  isActive
                    ? `Currently selected. Shows ${tab.label.toLowerCase()} section`
                    : `Shows ${tab.label.toLowerCase()} section`
                }
                hitSlop={8}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text
                  className={`text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-3 pb-8"
      >
        {showCreationConfig && (
          <>
            {activeTab === "review" && (
              <View className="gap-3 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="font-semibold">
                      Suggested setup context
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {contextSummary
                        ? `Based on ${contextSummary.history_availability_state} history and signal quality ${(contextSummary.signal_quality * 100).toFixed(0)}%`
                        : isPreviewPending
                          ? "Loading profile-aware defaults..."
                          : "Using conservative defaults until profile-aware suggestions are available."}
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
            )}

            {activeTab === "review" && noHistoryMetadata ? (
              <View
                className="gap-2 rounded-lg border border-border bg-muted/20 p-3"
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                accessibilityLabel={noHistoryAccessibilitySummary}
              >
                <Text className="text-xs font-medium">No-history cues</Text>
                <Text className="text-xs text-muted-foreground">
                  Confidence: {noHistoryConfidenceLabel}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Floor applied: {noHistoryFloorAppliedLabel}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Availability clamp: {noHistoryAvailabilityClampLabel}
                </Text>
                {noHistoryReasons.slice(0, 2).map((reason) => (
                  <Text key={reason} className="text-xs text-muted-foreground">
                    - {reason}
                  </Text>
                ))}
              </View>
            ) : null}

            {activeTab === "availability" && (
              <View className="gap-3 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Availability</Text>
                  <Badge
                    variant={getSourceBadgeVariant(
                      configData.availabilityProvenance.source,
                    )}
                  >
                    <Text>{configData.availabilityProvenance.source}</Text>
                  </Badge>
                </View>

                <DateField
                  id="plan-start-date"
                  label="Plan start date"
                  value={formData.planStartDate}
                  onChange={(nextDate) => {
                    markFieldTouched("planStartDate");
                    onFormDataChange({
                      ...formData,
                      planStartDate: nextDate,
                    });
                  }}
                  placeholder="Use today (default)"
                  clearable
                  error={getError("planStartDate")}
                  accessibilityHint="Sets your training plan start date. Format yyyy-mm-dd"
                />

                <View className="flex-row items-center justify-between">
                  <Text className="text-sm">Lock availability</Text>
                  <View className="flex-row items-center gap-2">
                    {configData.locks.availability_config.locked ? (
                      <Lock size={14} className="text-primary" />
                    ) : (
                      <LockOpen size={14} className="text-muted-foreground" />
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

                <View className="gap-1">
                  <Text className="text-xs text-muted-foreground">
                    Training days ({selectedAvailabilityDays}/7)
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {weekDays.map((day) => {
                      const dayConfig =
                        configData.availabilityConfig.days.find(
                          (item) => item.day === day,
                        ) ?? configData.availabilityConfig.days[0];
                      if (!dayConfig) {
                        return null;
                      }

                      const isAvailable = dayConfig.windows.length > 0;
                      return (
                        <Button
                          key={`availability-${day}`}
                          variant={isAvailable ? "default" : "outline"}
                          size="sm"
                          onPress={() => {
                            updateConfig((draft) => {
                              draft.availabilityConfig = {
                                ...draft.availabilityConfig,
                                template: "custom",
                                days: draft.availabilityConfig.days.map(
                                  (candidate) =>
                                    candidate.day === day
                                      ? {
                                          ...candidate,
                                          windows: isAvailable
                                            ? []
                                            : [
                                                {
                                                  start_minute_of_day: 360,
                                                  end_minute_of_day: 450,
                                                },
                                              ],
                                          max_sessions: isAvailable ? 0 : 1,
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
                        >
                          <Text>{getWeekDayLabel(day)}</Text>
                        </Button>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {activeTab === "constraints" && (
              <View className="gap-3 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Limits</Text>
                  <Badge
                    variant={getSourceBadgeVariant(
                      configData.constraintsSource,
                    )}
                  >
                    <Text>{configData.constraintsSource}</Text>
                  </Badge>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm">Plan style</Text>
                    <Switch
                      checked={configData.locks.optimization_profile.locked}
                      onCheckedChange={(value) =>
                        setFieldLock("optimization_profile", Boolean(value))
                      }
                    />
                  </View>
                  <Select
                    value={{
                      value: configData.optimizationProfile,
                      label:
                        optimizationProfileOptions.find(
                          (option) =>
                            option.value === configData.optimizationProfile,
                        )?.label ?? "Balanced",
                    }}
                    onValueChange={(option) => {
                      if (!option?.value) return;
                      updateConfig((draft) => {
                        const nextProfile =
                          option.value as TrainingPlanConfigFormData["optimizationProfile"];
                        draft.optimizationProfile = nextProfile;

                        const preset =
                          optimizationProfileVisualPresets[nextProfile];
                        if (!draft.locks.post_goal_recovery_days.locked) {
                          draft.postGoalRecoveryDays =
                            preset.postGoalRecoveryDays;
                        }
                        if (!draft.locks.max_weekly_tss_ramp_pct.locked) {
                          draft.maxWeeklyTssRampPct =
                            preset.maxWeeklyTssRampPct;
                        }
                        if (!draft.locks.max_ctl_ramp_per_week.locked) {
                          draft.maxCtlRampPerWeek = preset.maxCtlRampPerWeek;
                        }
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {optimizationProfileOptions.map((option) => (
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
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm">Recovery days after goal</Text>
                    <Switch
                      checked={configData.locks.post_goal_recovery_days.locked}
                      onCheckedChange={(value) =>
                        setFieldLock("post_goal_recovery_days", Boolean(value))
                      }
                    />
                  </View>
                  <IntegerStepper
                    id="post-goal-recovery-days"
                    value={configData.postGoalRecoveryDays}
                    min={0}
                    max={28}
                    onChange={(nextValue) => {
                      updateConfig((draft) => {
                        draft.postGoalRecoveryDays = nextValue;
                      });
                    }}
                  />
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm">
                      Weekly load increase cap (%)
                    </Text>
                    <Switch
                      checked={configData.locks.max_weekly_tss_ramp_pct.locked}
                      onCheckedChange={(value) =>
                        setFieldLock("max_weekly_tss_ramp_pct", Boolean(value))
                      }
                    />
                  </View>
                  <PercentSliderInput
                    id="max-weekly-load-ramp"
                    value={configData.maxWeeklyTssRampPct}
                    min={0}
                    max={20}
                    step={0.25}
                    onChange={(nextValue) => {
                      updateConfig((draft) => {
                        draft.maxWeeklyTssRampPct = nextValue;
                      });
                    }}
                  />
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm">Weekly fitness increase cap</Text>
                    <Switch
                      checked={configData.locks.max_ctl_ramp_per_week.locked}
                      onCheckedChange={(value) =>
                        setFieldLock("max_ctl_ramp_per_week", Boolean(value))
                      }
                    />
                  </View>
                  <BoundedNumberInput
                    id="max-weekly-ctl-ramp"
                    label="Cap"
                    value={String(configData.maxCtlRampPerWeek)}
                    min={0}
                    max={8}
                    decimals={2}
                    unitLabel="CTL/wk"
                    onChange={(value) => {
                      const parsed = parseNumberOrUndefined(value);
                      if (parsed === undefined) {
                        return;
                      }
                      updateConfig((draft) => {
                        draft.maxCtlRampPerWeek = Math.max(
                          0,
                          Math.min(8, Number(parsed.toFixed(2))),
                        );
                      });
                    }}
                  />
                </View>

                {informationalConflicts.length > 0 && (
                  <View className="gap-1 rounded-md border border-amber-300 bg-amber-100/40 p-2">
                    <Text className="text-xs font-medium text-amber-800">
                      Locked field notices
                    </Text>
                    {informationalConflicts.map((conflict) => (
                      <Text key={conflict} className="text-xs text-amber-800">
                        - {conflict}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {activeTab === "review" && (
              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Feasibility and safety</Text>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="flex-row items-center gap-1 rounded-full border border-border px-2 py-1"
                      accessibilityRole="text"
                      accessibilityLabel={`${reviewNoticeCount} plan notice${reviewNoticeCount === 1 ? "" : "s"} to review`}
                    >
                      <Trophy size={12} className="text-muted-foreground" />
                      <Text className="text-xs font-medium">
                        {reviewNoticeCount}
                      </Text>
                    </View>
                    {isPreviewPending && (
                      <Text className="text-xs text-muted-foreground">
                        Refreshing...
                      </Text>
                    )}
                  </View>
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
                    Safety summary appears here as your setup is completed.
                  </Text>
                )}
              </View>
            )}

            {activeTab === "review" && createDisabledReason && (
              <View
                className={`gap-1 rounded-lg p-3 ${blockingIssues.length > 0 ? "border border-amber-300 bg-amber-100/40" : "border border-destructive/40 bg-destructive/5"}`}
              >
                <Text
                  className={`text-xs font-medium ${blockingIssues.length > 0 ? "text-amber-800" : "text-destructive"}`}
                >
                  {createDisabledReason}
                </Text>
                {blockingIssues.length > 0 && onRiskAcknowledgedChange && (
                  <View className="mt-1 flex-row items-center justify-between rounded-md border border-amber-300 px-2 py-2">
                    <Text className="mr-2 flex-1 text-xs text-amber-800">
                      I understand the feasibility/safety risk and want to
                      create this plan anyway.
                    </Text>
                    <Switch
                      checked={riskAcknowledged}
                      onCheckedChange={(value) =>
                        onRiskAcknowledgedChange(Boolean(value))
                      }
                      accessibilityLabel="Acknowledge plan risk"
                      accessibilityHint="Enable to allow creating a plan with unresolved feasibility or safety issues"
                    />
                  </View>
                )}
              </View>
            )}

            {activeTab === "review" && blockingIssues.length > 0 && (
              <View className="gap-2 rounded-lg border border-amber-300 bg-amber-100/40 p-3">
                <View className="flex-row items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-800" />
                  <Text className="font-semibold text-amber-800">
                    Observations based on known standards
                  </Text>
                </View>
                {blockingIssues.map((conflict) => (
                  <View
                    key={`${conflict.code}-${conflict.message}`}
                    className="gap-1 rounded-md border border-amber-300 p-2"
                  >
                    <Text className="text-sm text-amber-800">
                      {conflict.message}
                    </Text>
                    {conflict.suggestions.map((suggestion) => (
                      <Text
                        key={`${conflict.code}-${suggestion}`}
                        className="text-xs text-amber-800"
                      >
                        - {suggestion}
                      </Text>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => onResolveConflict(conflict.code)}
                    >
                      <Text>Apply suggested fix</Text>
                    </Button>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {activeTab === "goals" && errors.goals && (
          <Text className="text-xs text-destructive">{errors.goals}</Text>
        )}

        {activeTab === "goals" && (
          <View className="gap-2">
            <View className="relative">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="flex-row gap-2 pr-2"
              >
                {formData.goals.map((goal, goalIndex) => {
                  const isActive = activeGoal?.id === goal.id;
                  return (
                    <Pressable
                      key={goal.id}
                      onPress={() => setActiveGoalId(goal.id)}
                      className={`rounded-md border px-3 py-2 ${isActive ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Goal ${goalIndex + 1}`}
                    >
                      <View className="flex-row items-center gap-1.5">
                        <Flag
                          size={13}
                          className={
                            isActive ? "text-primary" : "text-muted-foreground"
                          }
                        />
                        <Text
                          className={`text-xs ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                          numberOfLines={1}
                        >
                          {goal.name.trim() || `Goal ${goalIndex + 1}`}
                        </Text>
                        <Badge variant={isActive ? "default" : "outline"}>
                          <Text>{goal.targets.length}</Text>
                        </Badge>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View className="absolute right-0 top-0 bottom-0 justify-center pl-2 z-10">
                <Button
                  variant="outline"
                  size="icon"
                  onPress={addGoal}
                  accessibilityLabel="Add goal"
                  accessibilityHint="Adds a new goal"
                  hitSlop={8}
                >
                  <Plus size={16} className="text-muted-foreground" />
                </Button>
              </View>
            </View>
          </View>
        )}

        {activeTab === "goals" && activeGoal && activeGoalIndex >= 0 && (
          <View className="gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
            <View className="flex-row items-center gap-2">
              <View className="flex-1 gap-1.5">
                <Input
                  aria-label="Goal name"
                  placeholder="Goal name"
                  value={activeGoal.name}
                  onChangeText={(value) =>
                    updateGoal(activeGoal.id, { name: value })
                  }
                  maxLength={100}
                />
                {getError(`goals.${activeGoalIndex}.name`) && (
                  <Text className="text-xs text-destructive">
                    {getError(`goals.${activeGoalIndex}.name`)}
                  </Text>
                )}
              </View>
              <Button
                variant="outline"
                size="icon"
                onPress={() => removeGoal(activeGoal.id)}
                disabled={formData.goals.length <= 1 || activeGoalIndex === 0}
                accessibilityLabel="Delete goal"
              >
                <Trash2 size={16} className="text-muted-foreground" />
              </Button>
            </View>

            <DateField
              id={`target-date-${activeGoal.id}`}
              label="Target date"
              value={activeGoal.targetDate}
              onChange={(nextDate) => {
                if (!nextDate) {
                  return;
                }
                markFieldTouched(`goals.${activeGoalIndex}.targetDate`);
                updateGoal(activeGoal.id, { targetDate: nextDate });
              }}
              required
              minimumDate={new Date()}
              error={getError(`goals.${activeGoalIndex}.targetDate`)}
              accessibilityHint="Sets goal target date. Format yyyy-mm-dd"
            />

            <View className="gap-2 rounded-md border border-border bg-background/70 p-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">Targets</Text>
                <View className="flex-row gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    onPress={() =>
                      addTargetWithType(activeGoal.id, "race_performance")
                    }
                    accessibilityLabel="Add race target"
                  >
                    <Flag size={14} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onPress={() =>
                      addTargetWithType(activeGoal.id, "pace_threshold")
                    }
                    accessibilityLabel="Add pace target"
                  >
                    <Gauge size={14} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onPress={() =>
                      addTargetWithType(activeGoal.id, "power_threshold")
                    }
                    accessibilityLabel="Add power target"
                  >
                    <Zap size={14} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onPress={() =>
                      addTargetWithType(activeGoal.id, "hr_threshold")
                    }
                    accessibilityLabel="Add heart-rate target"
                  >
                    <Heart size={14} className="text-muted-foreground" />
                  </Button>
                </View>
              </View>

              {activeGoal.targets.map((target, targetIndex) => {
                const rowError = getTargetRowError(
                  activeGoalIndex,
                  targetIndex,
                );
                const icon =
                  target.targetType === "race_performance" ? (
                    <Flag size={13} className="text-muted-foreground" />
                  ) : target.targetType === "pace_threshold" ? (
                    <Gauge size={13} className="text-muted-foreground" />
                  ) : target.targetType === "power_threshold" ? (
                    <Zap size={13} className="text-muted-foreground" />
                  ) : (
                    <Heart size={13} className="text-muted-foreground" />
                  );

                return (
                  <View
                    key={target.id}
                    className="gap-1 rounded-md border border-border bg-background/80 px-2 py-2"
                  >
                    <View className="flex-row items-center gap-2">
                      {icon}
                      <Pressable
                        onPress={() =>
                          setEditingTargetRef({
                            goalId: activeGoal.id,
                            targetId: target.id,
                          })
                        }
                        className="flex-1 gap-0.5"
                      >
                        <Text className="text-xs font-medium">
                          {getTargetTypeLabel(target.targetType)}
                        </Text>
                        <Text
                          className="text-xs text-muted-foreground"
                          numberOfLines={1}
                        >
                          {getTargetSummary(target)}
                        </Text>
                      </Pressable>
                      <Button
                        variant="outline"
                        size="icon"
                        onPress={() =>
                          setEditingTargetRef({
                            goalId: activeGoal.id,
                            targetId: target.id,
                          })
                        }
                        accessibilityLabel="Edit target"
                      >
                        <Pencil size={14} className="text-muted-foreground" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onPress={() => removeTarget(activeGoal.id, target.id)}
                        disabled={activeGoal.targets.length <= 1}
                        accessibilityLabel="Delete target"
                      >
                        <Trash2 size={14} className="text-muted-foreground" />
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
          </View>
        )}
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
                    Target Type<Text className="text-destructive">*</Text>
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
                        Activity<Text className="text-destructive">*</Text>
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

                  <BoundedNumberInput
                    id="editor-distance"
                    label="Distance"
                    value={editingContext.target.distanceKm ?? ""}
                    onChange={(nextValue) => {
                      markFieldTouched(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.distanceKm`,
                      );
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          distanceKm: nextValue,
                        },
                      );
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
                    error={getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.distanceKm`,
                    )}
                    accessibilityHint="Enter distance in kilometers, for example 21.1"
                  />

                  <DurationInput
                    id="editor-race-time"
                    label="Completion Time"
                    value={editingContext.target.completionTimeHms ?? ""}
                    onChange={(nextValue) => {
                      markFieldTouched(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.completionTimeHms`,
                      );
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          completionTimeHms: nextValue,
                        },
                      );
                    }}
                    placeholder="e.g., 1:35:00"
                    required
                    error={getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.completionTimeHms`,
                    )}
                    accessibilityHint="Enter completion time in h:mm:ss format"
                  />
                </>
              )}

              {editingContext.target.targetType === "pace_threshold" && (
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

                  <PaceInput
                    id="editor-pace"
                    label="Target Pace"
                    value={editingContext.target.paceMmSs ?? ""}
                    onChange={(nextValue) => {
                      markFieldTouched(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.paceMmSs`,
                      );
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          paceMmSs: nextValue,
                        },
                      );
                    }}
                    required
                    error={getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.paceMmSs`,
                    )}
                    accessibilityHint="Enter pace in mm:ss per kilometer"
                  />

                  <DurationInput
                    id="editor-pace-test-duration"
                    label="Required Test Duration"
                    value={editingContext.target.testDurationHms ?? ""}
                    onChange={(nextValue) => {
                      markFieldTouched(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                      );
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          testDurationHms: nextValue,
                        },
                      );
                    }}
                    placeholder="e.g., 0:20:00"
                    required
                    error={getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                    )}
                    accessibilityHint="Enter test duration in h:mm:ss format"
                  />
                </>
              )}

              {editingContext.target.targetType === "power_threshold" && (
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

                  <BoundedNumberInput
                    id="editor-power-watts"
                    label="Target Watts"
                    value={
                      editingContext.target.targetWatts === undefined
                        ? ""
                        : String(editingContext.target.targetWatts)
                    }
                    onChange={(value) => {
                      markFieldTouched(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetWatts`,
                      );
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          targetWatts: parseNumberOrUndefined(value),
                        },
                      );
                    }}
                    min={1}
                    max={2000}
                    decimals={0}
                    unitLabel="W"
                    required
                    placeholder="e.g., 285"
                    helperText="Enter whole watts"
                    error={getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetWatts`,
                    )}
                    accessibilityHint="Enter target power in whole watts"
                  />

                  <DurationInput
                    id="editor-power-test-duration"
                    label="Required Test Duration"
                    value={editingContext.target.testDurationHms ?? ""}
                    onChange={(nextValue) => {
                      markFieldTouched(
                        `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                      );
                      updateTarget(
                        editingContext.goal.id,
                        editingContext.target.id,
                        {
                          testDurationHms: nextValue,
                        },
                      );
                    }}
                    placeholder="e.g., 0:20:00"
                    required
                    error={getError(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.testDurationHms`,
                    )}
                    accessibilityHint="Enter test duration in h:mm:ss format"
                  />
                </>
              )}

              {editingContext.target.targetType === "hr_threshold" && (
                <BoundedNumberInput
                  id="editor-lthr-bpm"
                  label="LTHR"
                  value={
                    editingContext.target.targetLthrBpm === undefined
                      ? ""
                      : String(editingContext.target.targetLthrBpm)
                  }
                  onChange={(value) => {
                    markFieldTouched(
                      `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetLthrBpm`,
                    );
                    updateTarget(
                      editingContext.goal.id,
                      editingContext.target.id,
                      {
                        targetLthrBpm: parseNumberOrUndefined(value),
                      },
                    );
                  }}
                  min={1}
                  max={260}
                  decimals={0}
                  unitLabel="bpm"
                  required
                  placeholder="e.g., 168"
                  helperText="Enter heart rate in beats per minute"
                  error={getError(
                    `goals.${editingContext.goalIndex}.targets.${editingContext.targetIndex}.targetLthrBpm`,
                  )}
                  accessibilityHint="Enter lactate threshold heart rate in bpm"
                />
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}
