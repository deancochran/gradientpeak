import type {
  BlockingIssue,
  CanonicalSport,
  CompositeWeightLocks,
  CreationAvailabilityConfig,
  CreationBehaviorControlsV1,
  CreationConfigLocks,
  CreationConstraints,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  CreationProvenance,
  CreationRecentInfluenceAction,
  CreationValueSource,
  NoHistoryProjectionMetadata,
  ProjectionChartPayload,
  ReadinessDeltaDiagnostics,
  TrainingPlanCalibrationConfig,
} from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { Form, FormTextField } from "@repo/ui/components/form";
import { NumberSliderInput } from "@repo/ui/components/number-slider-input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { Flag, Plus, ShieldAlert, Trash2, Trophy } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { z } from "zod";
import { toDateKey } from "@/lib/calendar/dateMath";
import { AvailabilityConfigSection } from "./AvailabilityConfigSection";
import { BehaviorControlsConfigSection } from "./BehaviorControlsConfigSection";
import { ConstraintsConfigSection } from "./ConstraintsConfigSection";
import { CreationProjectionChart } from "./CreationProjectionChart";
import { type GoalTargetEditorContext, GoalTargetEditorModal } from "./GoalTargetEditorModal";
import { GoalTargetsSection } from "./GoalTargetsSection";
import { TrainingPlanMetadataSection } from "./TrainingPlanMetadataSection";
import {
  emptyTrainingPlanMetadataFormData,
  type TrainingPlanMetadataFormData,
  type TrainingPlanMetadataFormValues,
  trainingPlanMetadataFormSchema,
} from "./trainingPlanMetadataForm";

export type GoalTargetType =
  | "race_performance"
  | "pace_threshold"
  | "power_threshold"
  | "hr_threshold";

export interface GoalTargetFormData {
  id: string;
  targetType: GoalTargetType;
  activityCategory?: CanonicalSport;
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
  behaviorControlsV1: CreationBehaviorControlsV1;
  startingCtlAssumption?: number;
  startingFatigueState?: "fresh" | "normal" | "fatigued";
  calibration: TrainingPlanCalibrationConfig;
  calibrationCompositeLocks: CompositeWeightLocks;
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
  metadataForm?: UseFormReturn<
    TrainingPlanMetadataFormData,
    undefined,
    TrainingPlanMetadataFormValues
  >;
  initialTab?: FormTabKey;
  formData: TrainingPlanFormData;
  onFormDataChange: (data: TrainingPlanFormData) => void;
  onResetGoals?: () => void;
  showCreationConfig?: boolean;
  projectionChart?: ProjectionChartPayload;
  configData: TrainingPlanConfigFormData;
  contextSummary?: CreationContextSummary;
  feasibilitySafetySummary?: CreationFeasibilitySafetySummary;
  informationalConflicts?: string[];
  blockingIssues?: BlockingIssue[];
  allowBlockingIssueOverride?: boolean;
  onAllowBlockingIssueOverrideChange?: (enabled: boolean) => void;
  isPreviewPending?: boolean;
  readinessDeltaDiagnostics?: ReadinessDeltaDiagnostics;
  onConfigChange: (data: TrainingPlanConfigFormData) => void;
  onResetAvailability?: () => void;
  onResetLimits?: () => void;
  onResetBehaviorControls?: () => void;
  errors?: Record<string, string>;
}

interface EditingTargetRef {
  goalId: string;
  targetId: string;
}

type FormTabKey = "plan" | "goals" | "availability" | "constraints" | "calibration" | "review";

const goalNameFormSchema = z.object({
  name: z.string().max(100),
});

const allFormTabs: { key: FormTabKey; label: string }[] = [
  { key: "plan", label: "Plan" },
  { key: "goals", label: "Goals" },
  { key: "availability", label: "Availability" },
  { key: "constraints", label: "Limits" },
  { key: "calibration", label: "Tuning" },
  { key: "review", label: "Review" },
];

type TabIssueCounts = Record<FormTabKey, number>;

const createLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
  targetDate: targetDate ?? toDateKey(new Date()),
  priority: 5,
  targets: [createEmptyTarget()],
});

const tabPanelClass = "gap-3 rounded-lg border border-border bg-card p-3";
const helperTextClass = "text-xs text-muted-foreground";

const formatReviewBandLabel = (band: string) => {
  if (band === "on-track") return "On track";
  return "Needs adjustment";
};

const formatSafetyBandLabel = (band: string) => {
  if (band === "safe") return "Low risk";
  if (band === "caution") return "Moderate risk";
  return "High risk";
};

const formatDirectionLabel = (direction: string) => {
  if (direction === "up") return "increased";
  if (direction === "down") return "decreased";
  return "stayed flat";
};

const formatDriverLabel = (driver: string) => {
  if (driver === "fatigue") return "fatigue";
  if (driver === "load") return "training load";
  if (driver === "feasibility") return "time pressure";
  return driver.replaceAll("_", " ");
};

const formatNoteLabel = (note: string) => note.replaceAll("_", " ").replaceAll("-", " ");

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const readNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const formatNumericDiagnostics = (record: Record<string, unknown> | undefined, limit: number) => {
  if (!record) {
    return "";
  }

  const parts = Object.entries(record)
    .map(([key, value]) => {
      const numeric = readNumber(value);
      if (numeric === undefined) {
        return null;
      }

      const formatted =
        Math.abs(numeric) >= 100
          ? numeric.toFixed(0)
          : Math.abs(numeric) >= 10
            ? numeric.toFixed(1)
            : numeric.toFixed(2);
      return `${formatNoteLabel(key)} ${formatted}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.slice(0, limit).join(", ");
};

const resolveProjectionReviewDiagnostics = (
  projectionChart: ProjectionChartPayload | undefined,
) => {
  const base = toRecord(projectionChart?.projection_diagnostics);
  const scoped =
    toRecord(base?.continuous_projection_diagnostics) ??
    toRecord(base?.continuous_projection) ??
    toRecord(base?.continuous) ??
    base;

  const effectiveOptimizer =
    toRecord(scoped?.effective_optimizer) ??
    toRecord(scoped?.effectiveOptimizer) ??
    toRecord(scoped?.effective_optimizer_values) ??
    toRecord(scoped?.effectiveOptimizerValues) ??
    toRecord(
      toRecord(scoped?.effective_optimizer_config)?.weights ??
        toRecord(scoped?.effectiveOptimizerConfig)?.weights,
    ) ??
    toRecord(scoped?.effective_optimizer_config) ??
    toRecord(scoped?.effectiveOptimizerConfig);
  const objectiveContributions =
    toRecord(scoped?.objective_contributions) ?? toRecord(scoped?.objectiveContributions);
  const objectiveComposition =
    toRecord(scoped?.objective_composition) ??
    toRecord(scoped?.objectiveComposition) ??
    toRecord(objectiveContributions?.weighted_terms) ??
    objectiveContributions;
  const activeConstraintsRaw = readStringArray(scoped?.active_constraints);
  const bindingConstraintsRaw = readStringArray(scoped?.binding_constraints);
  const clampCounts = toRecord(scoped?.clamp_counts) ?? toRecord(scoped?.clampCounts);
  const sampledWeeks =
    readNumber(objectiveContributions?.sampled_weeks) ??
    readNumber(objectiveContributions?.sampledWeeks);
  const derivedClampPressure =
    clampCounts && sampledWeeks && sampledWeeks > 0
      ? ((readNumber(clampCounts.tss) ?? 0) + (readNumber(clampCounts.ctl) ?? 0)) / sampledWeeks
      : undefined;

  return {
    effectiveOptimizerSummary: formatNumericDiagnostics(effectiveOptimizer, 3),
    objectiveSummary: formatNumericDiagnostics(objectiveComposition, 4),
    activeConstraints: (activeConstraintsRaw.length > 0
      ? activeConstraintsRaw
      : readStringArray(scoped?.activeConstraints)
    )
      .slice(0, 2)
      .map((value) => formatNoteLabel(value))
      .join(", "),
    bindingConstraints: (bindingConstraintsRaw.length > 0
      ? bindingConstraintsRaw
      : readStringArray(scoped?.bindingConstraints)
    )
      .slice(0, 2)
      .map((value) => formatNoteLabel(value))
      .join(", "),
    clampPressure:
      readNumber(scoped?.clamp_pressure) ??
      readNumber(scoped?.clampPressure) ??
      (derivedClampPressure !== undefined
        ? Math.max(0, Math.min(1, derivedClampPressure))
        : undefined),
    curvatureContribution:
      readNumber(scoped?.curvature_contribution) ??
      readNumber(scoped?.curvatureContribution) ??
      readNumber(objectiveComposition?.curvature_contribution) ??
      readNumber(objectiveComposition?.curvatureContribution) ??
      readNumber(objectiveComposition?.curvature) ??
      readNumber(objectiveComposition?.curve),
  };
};

const humanizeToken = (value: string) => {
  const cleaned = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  if (!cleaned) return value;
  return cleaned.slice(0, 1).toUpperCase() + cleaned.slice(1);
};

const formatContextAvailabilityLabel = (value: string) => {
  const map: Record<string, string> = {
    history_none: "no recent training history",
    history_limited: "limited recent training history",
    history_partial: "partial recent training history",
    history_good: "solid recent training history",
    history_full: "strong recent training history",
  };
  return map[value] ?? humanizeToken(value).toLowerCase();
};

const formatMarkerLabel = (value: string) => {
  const map: Record<string, string> = {
    consistency_low: "Low",
    consistency_medium: "Moderate",
    consistency_high: "High",
    effort_low: "Low",
    effort_medium: "Moderate",
    effort_high: "High",
    profile_low: "Low",
    profile_medium: "Moderate",
    profile_high: "High",
  };
  return map[value] ?? humanizeToken(value);
};

const formatCodeAsSentence = (code: string) => {
  if (code.includes("history_none")) {
    return "Little or no recent training history was found.";
  }
  if (code.includes("effort_high")) {
    return "Recent efforts suggest you can handle a stronger training load.";
  }
  if (code.includes("effort_low")) {
    return "Recent efforts suggest we should keep intensity conservative.";
  }
  if (code.includes("profile") && code.includes("missing")) {
    return "Some profile data is missing, so defaults are more conservative.";
  }
  return `${humanizeToken(code)}.`;
};

const formatDriverText = (message: string, code?: string) => {
  if (message?.includes(" ")) return message;
  if (message) return formatCodeAsSentence(message);
  if (code) return formatCodeAsSentence(code);
  return "Adjustment noted.";
};

const formatGoalTargetTypeLabel = (targetType: GoalTargetType) => {
  switch (targetType) {
    case "race_performance":
      return "Race performance";
    case "pace_threshold":
      return "Pace threshold";
    case "power_threshold":
      return "Power threshold";
    case "hr_threshold":
      return "Heart-rate threshold";
  }
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
  metadataForm,
  initialTab,
  formData,
  onFormDataChange,
  onResetGoals,
  showCreationConfig = true,
  projectionChart,
  configData,
  contextSummary,
  feasibilitySafetySummary,
  blockingIssues = [],
  allowBlockingIssueOverride = false,
  onAllowBlockingIssueOverrideChange,
  isPreviewPending = false,
  readinessDeltaDiagnostics,
  onConfigChange,
  onResetAvailability,
  onResetLimits,
  onResetBehaviorControls,
  errors = {},
}: SinglePageFormProps) {
  const fallbackMetadataForm = useZodForm({
    schema: trainingPlanMetadataFormSchema,
    defaultValues: emptyTrainingPlanMetadataFormData,
    mode: "onChange",
    reValidateMode: "onChange",
  });
  const resolvedMetadataForm = metadataForm ?? fallbackMetadataForm;
  const { height: windowHeight } = useWindowDimensions();
  const previewChartMaxHeight = Math.floor(windowHeight * 0.2);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(
    () => formData.goals[0]?.id ?? null,
  );
  const [editingTargetRef, setEditingTargetRef] = useState<EditingTargetRef | null>(null);
  const visibleTabKeys = useMemo<FormTabKey[]>(
    () =>
      showCreationConfig
        ? allFormTabs.filter((tab) => tab.key !== "goals").map((tab) => tab.key)
        : ["plan"],
    [showCreationConfig],
  );

  const resolveActiveTab = useCallback(
    (tab: FormTabKey | undefined): FormTabKey => {
      const fallbackTab = "plan" as const;
      if (!tab) {
        return fallbackTab;
      }

      return visibleTabKeys.includes(tab) ? tab : fallbackTab;
    },
    [visibleTabKeys],
  );

  const [activeTab, setActiveTab] = useState<FormTabKey>(() =>
    resolveActiveTab(initialTab ?? "plan"),
  );
  const [tabSnapOffsets, setTabSnapOffsets] = useState<Partial<Record<FormTabKey, number>>>({});

  useEffect(() => {
    if (!initialTab) {
      return;
    }

    setActiveTab(resolveActiveTab(initialTab));
  }, [initialTab, resolveActiveTab]);

  useEffect(() => {
    setActiveTab((current) => resolveActiveTab(current));
  }, [resolveActiveTab]);

  const handleTabChange = useCallback((tab: FormTabKey) => {
    setActiveTab(tab);
  }, []);
  const recordTabLayout = useCallback((tabKey: FormTabKey, event: LayoutChangeEvent) => {
    const offset = Math.max(0, Math.floor(event.nativeEvent.layout.x));
    setTabSnapOffsets((current) =>
      current[tabKey] === offset ? current : { ...current, [tabKey]: offset },
    );
  }, []);

  const noHistoryMetadata = projectionChart?.no_history;
  const noHistoryReasons = noHistoryMetadata?.fitness_inference_reasons ?? [];
  const projectionStartingState = projectionChart?.constraint_summary?.starting_state;
  const noHistoryConfidenceLabel = noHistoryMetadata
    ? toNoHistoryConfidenceLabel(noHistoryMetadata.projection_floor_confidence)
    : "n/a";
  const noHistoryFloorAppliedLabel = noHistoryMetadata?.projection_floor_applied ? "Yes" : "No";
  const noHistoryAvailabilityClampLabel = noHistoryMetadata?.floor_clamped_by_availability
    ? "Yes"
    : "No";
  const noHistoryFitnessSignal =
    typeof noHistoryMetadata?.fitness_signal_0_1 === "number"
      ? Math.round(noHistoryMetadata.fitness_signal_0_1 * 100)
      : null;
  const noHistoryDemandScore =
    typeof noHistoryMetadata?.goal_demand_score_0_1 === "number"
      ? Math.round(noHistoryMetadata.goal_demand_score_0_1 * 100)
      : null;
  const projectionRiskScore =
    typeof projectionChart?.risk_score === "number" ? Math.round(projectionChart.risk_score) : null;
  const noHistoryAccessibilitySummary = noHistoryMetadata
    ? `No-history cues. Confidence ${noHistoryConfidenceLabel}. Floor applied ${noHistoryFloorAppliedLabel}. Availability clamp ${noHistoryAvailabilityClampLabel}.${noHistoryFitnessSignal !== null ? ` Fitness signal ${noHistoryFitnessSignal} percent.` : ""}${noHistoryDemandScore !== null ? ` Goal demand ${noHistoryDemandScore} percent.` : ""}${projectionRiskScore !== null ? ` Risk score ${projectionRiskScore} percent.` : ""}`
    : undefined;

  useEffect(() => {
    if (metadataForm) {
      return;
    }

    void fallbackMetadataForm.trigger();
  }, [fallbackMetadataForm, metadataForm]);

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

    const goal = formData.goals.find((item) => item.id === editingTargetRef.goalId);
    const target = goal?.targets.find((item) => item.id === editingTargetRef.targetId);
    if (!goal || !target) {
      setEditingTargetRef(null);
    }
  }, [editingTargetRef, formData.goals]);

  const editingContext = useMemo<GoalTargetEditorContext | null>(() => {
    if (!editingTargetRef) {
      return null;
    }

    const goalIndex = formData.goals.findIndex((goal) => goal.id === editingTargetRef.goalId);
    if (goalIndex < 0) {
      return null;
    }

    const goal = formData.goals[goalIndex];
    const targetIndex = goal.targets.findIndex((target) => target.id === editingTargetRef.targetId);
    if (targetIndex < 0) {
      return null;
    }

    return {
      goalId: goal.id,
      goalIndex,
      target: goal.targets[targetIndex],
      targetIndex,
    };
  }, [editingTargetRef, formData.goals]);

  const updateGoal = useCallback(
    (goalId: string, updates: Partial<GoalFormData>) => {
      onFormDataChange({
        ...formData,
        goals: formData.goals.map((goal) => (goal.id === goalId ? { ...goal, ...updates } : goal)),
      });
    },
    [formData, onFormDataChange],
  );

  const updateTarget = (goalId: string, targetId: string, updates: Partial<GoalTargetFormData>) => {
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
    const referenceTargetDate = formData.goals[0]?.targetDate ?? toDateKey(new Date());

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

  const addTargetWithType = useCallback(
    (goalId: string, targetType: GoalTargetType) => {
      const target = createTargetByType(targetType);
      onFormDataChange({
        ...formData,
        goals: formData.goals.map((goal) =>
          goal.id === goalId ? { ...goal, targets: [...goal.targets, target] } : goal,
        ),
      });
      setEditingTargetRef({ goalId, targetId: target.id });
    },
    [formData, onFormDataChange],
  );

  const removeTarget = useCallback(
    (goalId: string, targetId: string) => {
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
    },
    [formData, onFormDataChange],
  );

  const getError = useCallback((path: string) => errors[path], [errors]);

  const formValidationErrors = errors;

  const goalErrorCountsById = useMemo(() => {
    const map = new Map<string, number>();

    formData.goals.forEach((goal) => {
      map.set(goal.id, 0);
    });

    for (const path of Object.keys(formValidationErrors)) {
      const match = /^goals\.(\d+)\./.exec(path);
      if (!match) {
        continue;
      }

      const goalIndex = Number(match[1]);
      const goal = formData.goals[goalIndex];
      if (!goal) {
        continue;
      }

      map.set(goal.id, (map.get(goal.id) ?? 0) + 1);
    }

    return map;
  }, [formData.goals, formValidationErrors]);

  const getTargetRowError = useCallback(
    (goalIndex: number, targetIndex: number) => {
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
    },
    [getError],
  );

  const activeGoal = useMemo(
    () => formData.goals.find((goal) => goal.id === activeGoalId) ?? formData.goals[0],
    [activeGoalId, formData.goals],
  );
  const activeGoalIndex = activeGoal
    ? formData.goals.findIndex((goal) => goal.id === activeGoal.id)
    : -1;
  const goalNameForm = useZodForm({
    schema: goalNameFormSchema,
    values: { name: activeGoal?.name ?? "" },
  });
  const goalName = useWatch({
    control: goalNameForm.control,
    name: "name",
  });
  const activeGoalNameError =
    activeGoalIndex >= 0 ? getError(`goals.${activeGoalIndex}.name`) : undefined;

  useEffect(() => {
    if (activeGoal && goalName !== activeGoal.name) {
      updateGoal(activeGoal.id, { name: goalName });
    }
  }, [activeGoal, goalName, updateGoal]);

  useEffect(() => {
    if (activeGoalNameError) {
      goalNameForm.setError("name", { message: activeGoalNameError });
      return;
    }

    goalNameForm.clearErrors("name");
  }, [activeGoalNameError, goalNameForm]);

  const closeTargetEditor = () => setEditingTargetRef(null);

  const getActiveGoalTargetRowError = useCallback(
    (targetIndex: number) => {
      if (activeGoalIndex < 0) {
        return undefined;
      }

      return getTargetRowError(activeGoalIndex, targetIndex);
    },
    [activeGoalIndex, getTargetRowError],
  );

  const openActiveGoalTargetEditor = useCallback(
    (targetId: string) => {
      if (!activeGoal) {
        return;
      }

      setEditingTargetRef({ goalId: activeGoal.id, targetId });
    },
    [activeGoal],
  );

  const addTargetToActiveGoal = useCallback(
    (targetType: GoalTargetType) => {
      if (!activeGoal) {
        return;
      }

      addTargetWithType(activeGoal.id, targetType);
    },
    [activeGoal, addTargetWithType],
  );

  const removeTargetFromActiveGoal = useCallback(
    (targetId: string) => {
      if (!activeGoal) {
        return;
      }

      removeTarget(activeGoal.id, targetId);
    },
    [activeGoal, removeTarget],
  );
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
  const tabIssueCounts = useMemo<TabIssueCounts>(() => {
    const counts: TabIssueCounts = {
      plan: resolvedMetadataForm.formState.errors.name ? 1 : 0,
      goals: 0,
      availability: 0,
      constraints: 0,
      calibration: 0,
      review: reviewNoticeCount,
    };

    for (const path of Object.keys(formValidationErrors)) {
      if (path === "goals" || path.startsWith("goals.")) {
        counts.goals += 1;
        continue;
      }

      if (path === "planStartDate") {
        counts.availability += 1;
      }
    }

    return counts;
  }, [formValidationErrors, resolvedMetadataForm.formState.errors.name, reviewNoticeCount]);
  const visibleTabs = useMemo(
    () => allFormTabs.filter((tab) => visibleTabKeys.includes(tab.key)),
    [visibleTabKeys],
  );
  const tabsWithIssues = useMemo(
    () => visibleTabs.filter((tab) => tabIssueCounts[tab.key] > 0),
    [tabIssueCounts, visibleTabs],
  );
  const orderedTabSnapOffsets = useMemo(
    () =>
      visibleTabs
        .map((tab) => tabSnapOffsets[tab.key])
        .filter((offset): offset is number => typeof offset === "number"),
    [tabSnapOffsets, visibleTabs],
  );
  const hasBlockingIssues = blockingIssues.length > 0;
  const projectionReviewDiagnostics = useMemo(
    () => resolveProjectionReviewDiagnostics(projectionChart),
    [projectionChart],
  );
  const hasProjectionReviewDiagnostics =
    projectionReviewDiagnostics.effectiveOptimizerSummary.length > 0 ||
    projectionReviewDiagnostics.objectiveSummary.length > 0 ||
    projectionReviewDiagnostics.activeConstraints.length > 0 ||
    projectionReviewDiagnostics.bindingConstraints.length > 0 ||
    projectionReviewDiagnostics.clampPressure !== undefined ||
    projectionReviewDiagnostics.curvatureContribution !== undefined;

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
          decelerationRate="fast"
          disableIntervalMomentum={false}
          snapToAlignment="start"
          snapToOffsets={orderedTabSnapOffsets.length > 1 ? orderedTabSnapOffsets : undefined}
          accessibilityRole="tablist"
          accessibilityLabel="Training plan setup sections"
          accessibilityHint="Swipe horizontally to browse sections, then double tap to open one"
        >
          {visibleTabs.map((tab) => {
            const isActive = tab.key === activeTab;
            const issueCount = tabIssueCounts[tab.key];
            const hasIssues = issueCount > 0;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabChange(tab.key)}
                onLayout={(event) => recordTabLayout(tab.key, event)}
                className={`border-b-2 px-1.5 py-2 ${isActive ? "border-primary" : hasIssues ? "border-amber-400" : "border-transparent"}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${tab.label} tab`}
                testID={`training-plan-tab-${tab.key}`}
                accessibilityHint={
                  isActive
                    ? `Currently selected. Shows ${tab.label.toLowerCase()} section`
                    : `Shows ${tab.label.toLowerCase()} section`
                }
                hitSlop={8}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <View className="flex-row items-center gap-1">
                  <Text
                    className={`text-sm ${isActive ? "font-semibold text-foreground" : hasIssues ? "font-medium text-amber-700" : "text-muted-foreground"}`}
                  >
                    {tab.label}
                  </Text>
                  {hasIssues ? (
                    <View className="min-w-4 rounded-full bg-amber-100 px-1 py-0.5">
                      <Text className="text-center text-[10px] font-semibold text-amber-700">
                        {issueCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {tabsWithIssues.length > 0 ? (
          <Text className="pt-1 text-xs text-amber-700">
            Needs attention: {tabsWithIssues.map((tab) => tab.label).join(", ")}
          </Text>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pt-3 pb-8">
        {activeTab === "plan" && <TrainingPlanMetadataSection form={resolvedMetadataForm} />}

        {showCreationConfig && (
          <>
            {activeTab === "review" && (
              <View className="gap-3 rounded-lg border border-border bg-card p-3">
                <View className="gap-1">
                  <Text className="font-semibold">Suggested setup context</Text>
                  <Text className="text-xs text-muted-foreground">
                    {contextSummary
                      ? `Based on ${formatContextAvailabilityLabel(contextSummary.history_availability_state)} and signal quality ${(contextSummary.signal_quality * 100).toFixed(0)}%`
                      : isPreviewPending
                        ? "Loading profile-aware defaults..."
                        : "Using conservative defaults until profile-aware suggestions are available."}
                  </Text>
                </View>

                {contextSummary && (
                  <View className="gap-1 rounded-md bg-muted/40 p-2">
                    <Text className="text-xs text-muted-foreground">
                      Consistency: {formatMarkerLabel(contextSummary.recent_consistency_marker)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Effort confidence:{" "}
                      {formatMarkerLabel(contextSummary.effort_confidence_marker)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Profile completeness:{" "}
                      {formatMarkerLabel(contextSummary.profile_metric_completeness_marker)}
                    </Text>
                    {contextSummary.rationale_codes.slice(0, 4).map((code) => (
                      <Text key={code} className="text-xs text-muted-foreground">
                        - {formatCodeAsSentence(code)}
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
                {noHistoryFitnessSignal !== null ? (
                  <Text className="text-xs text-muted-foreground">
                    Fitness signal: {noHistoryFitnessSignal}%
                  </Text>
                ) : null}
                {noHistoryDemandScore !== null ? (
                  <Text className="text-xs text-muted-foreground">
                    Goal demand: {noHistoryDemandScore}%
                  </Text>
                ) : null}
                {projectionRiskScore !== null ? (
                  <Text className="text-xs text-muted-foreground">
                    Risk score: {projectionRiskScore}%
                  </Text>
                ) : null}
                {noHistoryReasons.slice(0, 2).map((reason) => (
                  <Text key={reason} className="text-xs text-muted-foreground">
                    - {formatCodeAsSentence(reason)}
                  </Text>
                ))}
              </View>
            ) : null}

            {activeTab === "availability" && (
              <AvailabilityConfigSection
                planStartDate={formData.planStartDate}
                availabilityConfig={configData.availabilityConfig}
                availabilityProvenance={configData.availabilityProvenance}
                onChange={({ planStartDate, availabilityConfig, availabilityProvenance }) => {
                  onFormDataChange({
                    ...formData,
                    planStartDate,
                  });

                  const availabilityChanged =
                    JSON.stringify(availabilityConfig) !==
                      JSON.stringify(configData.availabilityConfig) ||
                    JSON.stringify(availabilityProvenance) !==
                      JSON.stringify(configData.availabilityProvenance);

                  if (availabilityChanged) {
                    onConfigChange({
                      ...configData,
                      availabilityConfig,
                      availabilityProvenance,
                    });
                  }
                }}
                onReset={onResetAvailability}
              />
            )}

            {activeTab === "constraints" && (
              <ConstraintsConfigSection
                postGoalRecoveryDays={configData.postGoalRecoveryDays}
                projectionStartingCtl={projectionStartingState?.starting_ctl}
                startingCtlAssumption={configData.startingCtlAssumption}
                onChange={(values) => {
                  onConfigChange({
                    ...configData,
                    postGoalRecoveryDays: values.postGoalRecoveryDays,
                    startingCtlAssumption: values.startingCtlAssumption,
                  });
                }}
                onReset={onResetLimits}
              />
            )}

            {activeTab === "calibration" && (
              <BehaviorControlsConfigSection
                behaviorControls={configData.behaviorControlsV1}
                onChange={(behaviorControlsV1) => {
                  onConfigChange({
                    ...configData,
                    behaviorControlsV1,
                  });
                }}
                onReset={onResetBehaviorControls}
              />
            )}

            {activeTab === "review" && (
              <View className={tabPanelClass}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Plan check</Text>
                  <View className="flex-row items-center gap-2">
                    <View
                      className="flex-row items-center gap-1 rounded-full border border-border px-2 py-1"
                      accessibilityRole="text"
                      accessibilityLabel={`${reviewNoticeCount} plan notice${reviewNoticeCount === 1 ? "" : "s"} to review`}
                    >
                      <Trophy size={12} className="text-muted-foreground" />
                      <Text className="text-xs font-medium">{reviewNoticeCount}</Text>
                    </View>
                    {isPreviewPending && (
                      <Text className="text-xs text-muted-foreground">Refreshing...</Text>
                    )}
                  </View>
                </View>
                <Text className={helperTextClass}>
                  Review plan fit, risk, and trend changes before create. Unresolved blocking issues
                  prevent create unless you explicitly acknowledge an override.
                </Text>
                {feasibilitySafetySummary ? (
                  <>
                    <View className="flex-row gap-2">
                      <Badge
                        variant={
                          feasibilitySafetySummary.feasibility_band === "on-track"
                            ? "default"
                            : "secondary"
                        }
                      >
                        <Text>
                          Plan fit:{" "}
                          {formatReviewBandLabel(feasibilitySafetySummary.feasibility_band)}
                        </Text>
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
                        <Text>
                          Risk: {formatSafetyBandLabel(feasibilitySafetySummary.safety_band)}
                        </Text>
                      </Badge>
                    </View>
                    {feasibilitySafetySummary.top_drivers.slice(0, 3).map((driver) => (
                      <Text key={driver.code} className="text-xs text-muted-foreground">
                        - {formatDriverText(driver.message, driver.code)}
                      </Text>
                    ))}
                    {hasProjectionReviewDiagnostics ? (
                      <>
                        {projectionReviewDiagnostics.effectiveOptimizerSummary ? (
                          <Text className="text-xs text-muted-foreground">
                            Effective optimizer:{" "}
                            {projectionReviewDiagnostics.effectiveOptimizerSummary}.
                          </Text>
                        ) : null}
                        {projectionReviewDiagnostics.activeConstraints ? (
                          <Text className="text-xs text-muted-foreground">
                            Active constraints: {projectionReviewDiagnostics.activeConstraints}.
                          </Text>
                        ) : null}
                        {projectionReviewDiagnostics.bindingConstraints ||
                        projectionReviewDiagnostics.clampPressure !== undefined ? (
                          <Text className="text-xs text-muted-foreground">
                            Binding constraints:{" "}
                            {projectionReviewDiagnostics.bindingConstraints || "none"}
                            {projectionReviewDiagnostics.clampPressure !== undefined
                              ? ` | clamp pressure ${Math.round(
                                  Math.max(
                                    0,
                                    Math.min(100, projectionReviewDiagnostics.clampPressure * 100),
                                  ),
                                )}%`
                              : ""}
                            .
                          </Text>
                        ) : null}
                        {projectionReviewDiagnostics.objectiveSummary ? (
                          <Text className="text-xs text-muted-foreground">
                            Objective mix: {projectionReviewDiagnostics.objectiveSummary}
                            {projectionReviewDiagnostics.curvatureContribution !== undefined
                              ? ` | curvature ${projectionReviewDiagnostics.curvatureContribution.toFixed(2)}`
                              : ""}
                            .
                          </Text>
                        ) : projectionReviewDiagnostics.curvatureContribution !== undefined ? (
                          <Text className="text-xs text-muted-foreground">
                            Curvature contribution:{" "}
                            {projectionReviewDiagnostics.curvatureContribution.toFixed(2)}.
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                    <Text className="text-xs text-muted-foreground">
                      The planner always prefers a safer progression that still moves you toward
                      your goals.
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      If a blocking issue remains unresolved, create stays disabled until you
                      explicitly acknowledge an override.
                    </Text>
                  </>
                ) : (
                  <Text className="text-xs text-muted-foreground">
                    Your plan check appears here once enough setup details are available.
                  </Text>
                )}
              </View>
            )}

            {activeTab === "review" && readinessDeltaDiagnostics ? (
              <View className={tabPanelClass}>
                <Text className="font-semibold">What changed most recently</Text>
                <Text className="text-xs text-muted-foreground">
                  Readiness {formatDirectionLabel(readinessDeltaDiagnostics.readiness.direction)} by{" "}
                  {Math.abs(readinessDeltaDiagnostics.readiness.delta).toFixed(2)} points ({" "}
                  {readinessDeltaDiagnostics.readiness.previous_score.toFixed(2)}
                  {" -> "}
                  {readinessDeltaDiagnostics.readiness.current_score.toFixed(2)}
                  ).
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Main reason: {formatDriverLabel(readinessDeltaDiagnostics.dominant_driver)}.
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Training load{" "}
                  {formatDirectionLabel(readinessDeltaDiagnostics.impacts.load.direction)} by{" "}
                  {Math.abs(readinessDeltaDiagnostics.impacts.load.delta).toFixed(2)} ({" "}
                  {readinessDeltaDiagnostics.impacts.load.previous_value.toFixed(2)}
                  {" -> "}
                  {readinessDeltaDiagnostics.impacts.load.current_value.toFixed(2)}
                  ).
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Fatigue{" "}
                  {formatDirectionLabel(readinessDeltaDiagnostics.impacts.fatigue.direction)} by{" "}
                  {Math.abs(readinessDeltaDiagnostics.impacts.fatigue.delta).toFixed(2)} ({" "}
                  {readinessDeltaDiagnostics.impacts.fatigue.previous_value.toFixed(2)}
                  {" -> "}
                  {readinessDeltaDiagnostics.impacts.fatigue.current_value.toFixed(2)}
                  ).
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Timeline pressure{" "}
                  {formatDirectionLabel(readinessDeltaDiagnostics.impacts.feasibility.direction)} by{" "}
                  {Math.abs(readinessDeltaDiagnostics.impacts.feasibility.delta).toFixed(2)} ({" "}
                  {readinessDeltaDiagnostics.impacts.feasibility.previous_value.toFixed(2)}
                  {" -> "}
                  {readinessDeltaDiagnostics.impacts.feasibility.current_value.toFixed(2)}
                  ).
                </Text>
              </View>
            ) : null}

            {activeTab === "review" && formData.goals.length > 0 && (
              <View className={tabPanelClass}>
                <Text className="font-semibold">Goals in this plan</Text>
                {formData.goals.map((goal, index) => {
                  const title = goal.name.trim() || `Goal ${index + 1}`;
                  const targetTypes = goal.targets.map((target) =>
                    formatGoalTargetTypeLabel(target.targetType),
                  );

                  return (
                    <View
                      key={goal.id}
                      className="gap-1 rounded-md border border-border bg-muted/20 p-2.5"
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
                          {title}
                        </Text>
                        <Badge variant="outline">
                          <Text>P{goal.priority}</Text>
                        </Badge>
                      </View>
                      <Text className="text-xs text-muted-foreground">
                        Target date: {goal.targetDate || "Not set"}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Targets: {targetTypes.length > 0 ? targetTypes.join(", ") : "None added"}
                      </Text>
                      <Text className="text-xs text-muted-foreground">Included in this plan.</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {activeTab === "review" && hasBlockingIssues && (
              <View className="gap-2 rounded-lg border border-amber-300 bg-amber-100/40 p-3">
                <View className="flex-row items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-800" />
                  <Text className="font-semibold text-amber-800">Blocking issues</Text>
                </View>
                <Text className="text-xs text-amber-800">
                  Resolve these issues, or acknowledge an override to allow create.
                </Text>
                {blockingIssues.map((conflict) => (
                  <View
                    key={`${conflict.code}-${conflict.message}`}
                    className="gap-1 rounded-md border border-amber-300 p-2"
                  >
                    <Text className="text-sm text-amber-800">{conflict.message}</Text>
                  </View>
                ))}
                <View className="gap-2 rounded-md border border-amber-300 p-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-medium text-amber-900">
                        Allow create despite blockers
                      </Text>
                      <Text className="text-xs text-amber-800">
                        I understand this create may violate safety or feasibility guardrails.
                      </Text>
                    </View>
                    <Switch
                      checked={allowBlockingIssueOverride}
                      onCheckedChange={(checked) => {
                        onAllowBlockingIssueOverrideChange?.(checked);
                      }}
                      accessibilityLabel="Allow create despite blockers"
                      accessibilityHint="Acknowledges an override and enables create while blockers remain"
                    />
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        {activeTab === "goals" && (
          <View className={tabPanelClass}>
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold">Goals</Text>
              <Button variant="outline" size="sm" onPress={() => onResetGoals?.()}>
                <Text>Reset</Text>
              </Button>
            </View>
            <Text className={helperTextClass}>
              Add one or more goals and mix race, pace, power, or heart-rate targets.
            </Text>
            {errors.goals ? <Text className="text-xs text-destructive">{errors.goals}</Text> : null}

            <View className="relative">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="flex-row gap-2 pr-2"
              >
                {formData.goals.map((goal, goalIndex) => {
                  const isActive = activeGoal?.id === goal.id;
                  const goalIssueCount = goalErrorCountsById.get(goal.id) ?? 0;
                  const goalHasIssues = goalIssueCount > 0;
                  return (
                    <Pressable
                      key={goal.id}
                      onPress={() => setActiveGoalId(goal.id)}
                      className={`rounded-md border px-3 py-2 ${isActive ? "border-primary bg-primary/10" : goalHasIssues ? "border-amber-300 bg-amber-100/40" : "border-border bg-background"}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Goal ${goalIndex + 1}`}
                    >
                      <View className="flex-row items-center gap-1.5">
                        <Flag
                          size={13}
                          className={isActive ? "text-primary" : "text-muted-foreground"}
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
                        {goalHasIssues ? (
                          <View className="h-2 w-2 rounded-full bg-amber-500" />
                        ) : null}
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

            {activeGoal && activeGoalIndex >= 0 ? (
              <View className="gap-2 rounded-md border border-border bg-muted/20 p-2.5">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <Form {...goalNameForm}>
                      <FormTextField
                        control={goalNameForm.control}
                        label="Goal name"
                        maxLength={100}
                        name="name"
                        placeholder="Goal name"
                      />
                    </Form>
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
                    updateGoal(activeGoal.id, { targetDate: nextDate });
                  }}
                  required
                  minimumDate={new Date()}
                  error={getError(`goals.${activeGoalIndex}.targetDate`)}
                  accessibilityHint="Sets goal target date. Format yyyy-mm-dd"
                />

                <NumberSliderInput
                  id={`goal-priority-${activeGoal.id}`}
                  label="Goal importance"
                  value={activeGoal.priority}
                  onChange={(value) => {
                    updateGoal(activeGoal.id, { priority: value });
                  }}
                  min={0}
                  max={10}
                  step={1}
                  decimals={0}
                  showNumericInput
                  helperText="Rank from 0 (least important) to 10 (most important)."
                  error={getError(`goals.${activeGoalIndex}.priority`)}
                />

                <GoalTargetsSection
                  activeGoal={activeGoal}
                  getTargetRowError={getActiveGoalTargetRowError}
                  onAddTargetWithType={addTargetToActiveGoal}
                  onEditTarget={openActiveGoalTargetEditor}
                  onRemoveTarget={removeTargetFromActiveGoal}
                />
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <GoalTargetEditorModal
        editingContext={editingContext}
        getError={getError}
        onClose={closeTargetEditor}
        onUpdateTarget={updateTarget}
      />
    </View>
  );
}
