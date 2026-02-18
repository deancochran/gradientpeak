import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Text } from "../../ui/text";
import { BoundedNumberInput } from "./inputs/BoundedNumberInput";
import { DateField } from "./inputs/DateField";
import { DurationInput } from "./inputs/DurationInput";
import { NumberSliderInput } from "./inputs/NumberSliderInput";
import { PaceInput } from "./inputs/PaceInput";
import { PercentSliderInput } from "./inputs/PercentSliderInput";
import {
  Flag,
  Gauge,
  Heart,
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
import Svg, { Circle } from "react-native-svg";
import { CreationProjectionChart } from "./CreationProjectionChart";
import { type CompositeWeightLocks } from "../../../lib/training-plan-form/calibration";
import { parseNumberOrUndefined } from "../../../lib/training-plan-form/input-parsers";
import type { BlockingIssue } from "../../../lib/training-plan-form/validation";
import { validateTrainingPlanForm } from "../../../lib/training-plan-form/validation";
import type {
  CreationAvailabilityConfig,
  CreationConfigLocks,
  CreationConstraints,
  CreationContextSummary,
  CreationFeasibilitySafetySummary,
  NoHistoryProjectionMetadata,
  ProjectionChartPayload,
  ReadinessDeltaDiagnostics,
  CreationProvenance,
  CreationRecentInfluenceAction,
  TrainingPlanCalibrationConfig,
  CreationValueSource,
  ProjectionControlV2,
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
  startingCtlAssumption?: number;
  startingFatigueState?: "fresh" | "normal" | "fatigued";
  projectionControlV2: ProjectionControlV2;
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
  onResetProjectionAll?: () => void;
  errors?: Record<string, string>;
}

interface EditingTargetRef {
  goalId: string;
  targetId: string;
}

type FormTabKey =
  | "goals"
  | "availability"
  | "constraints"
  | "calibration"
  | "review";

const formTabs: Array<{ key: FormTabKey; label: string }> = [
  { key: "goals", label: "Goals" },
  { key: "availability", label: "Availability" },
  { key: "constraints", label: "Limits" },
  { key: "calibration", label: "Tuning" },
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
  priority: 5,
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

const weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]> = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const tabPanelClass = "gap-3 rounded-lg border border-border bg-card p-3";
const sectionCardClass = "gap-2";
const helperTextClass = "text-xs text-muted-foreground";

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

const formatFeasibilityBandLabel = (
  band:
    | "feasible"
    | "stretch"
    | "aggressive"
    | "nearly_impossible"
    | "infeasible",
) => {
  if (band === "feasible") return "On track";
  if (band === "stretch") return "Challenging";
  if (band === "aggressive") return "Very challenging";
  if (band === "nearly_impossible") return "Unlikely";
  return "Not realistic";
};

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

const formatNoteLabel = (note: string) =>
  note.replaceAll("_", " ").replaceAll("-", " ");

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const toBoundedPercent = (value: number): number => {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
};

const readPercent = (value: unknown): number | undefined => {
  const numeric = readNumber(value);
  if (numeric !== undefined) {
    return toBoundedPercent(numeric);
  }

  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  const candidateKeys = [
    "score",
    "value",
    "percent",
    "percentage",
    "confidence",
    "confidence_score",
    "confidence_0_100",
    "uncertainty",
    "uncertainty_score",
    "uncertainty_0_100",
    "prediction_uncertainty",
    "prediction_confidence",
  ];

  for (const key of candidateKeys) {
    const candidate = readNumber(record[key]);
    if (candidate !== undefined) {
      return toBoundedPercent(candidate);
    }
  }

  return undefined;
};

const average = (values: number[]): number | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const resolveGoalAssessmentConfidenceHint = (
  assessment: NonNullable<ProjectionChartPayload["goal_assessments"]>[number],
  projectionChart: ProjectionChartPayload | undefined,
) => {
  const assessmentRecord = toRecord(assessment as unknown);
  const predictionUncertainty =
    readPercent(assessmentRecord?.prediction_uncertainty) ??
    readPercent(assessmentRecord?.predictionUncertainty);
  if (predictionUncertainty !== undefined) {
    return `Uncertainty hint: forecast spread ${Math.round(predictionUncertainty)}%.`;
  }

  const targetUncertainty = average(
    assessment.target_scores
      .map(
        (
          target: NonNullable<
            ProjectionChartPayload["goal_assessments"]
          >[number]["target_scores"][number],
        ) => {
          const record = toRecord(target as unknown);
          return (
            readPercent(record?.prediction_uncertainty) ??
            readPercent(record?.predictionUncertainty)
          );
        },
      )
      .filter(
        (value: number | undefined): value is number => value !== undefined,
      ),
  );
  if (targetUncertainty !== undefined) {
    return `Uncertainty hint: forecast spread ${Math.round(targetUncertainty)}%.`;
  }

  const confidenceScore =
    readPercent(assessmentRecord?.prediction_confidence) ??
    readPercent(assessmentRecord?.predictionConfidence) ??
    readPercent(assessmentRecord?.confidence) ??
    readPercent(assessmentRecord?.confidence_score) ??
    readPercent(projectionChart?.readiness_confidence) ??
    readPercent(projectionChart?.no_history?.evidence_confidence?.score);
  if (confidenceScore !== undefined) {
    return `Confidence hint: model confidence ${Math.round(confidenceScore)}%.`;
  }

  const confidenceState =
    projectionChart?.no_history?.evidence_confidence?.state ??
    projectionChart?.no_history?.projection_floor_confidence;
  if (confidenceState) {
    return `Confidence hint: evidence confidence ${confidenceState}.`;
  }

  return undefined;
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

const formatNumericDiagnostics = (
  record: Record<string, unknown> | undefined,
  limit: number,
) => {
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
    toRecord(scoped?.objective_contributions) ??
    toRecord(scoped?.objectiveContributions);
  const objectiveComposition =
    toRecord(scoped?.objective_composition) ??
    toRecord(scoped?.objectiveComposition) ??
    toRecord(objectiveContributions?.weighted_terms) ??
    objectiveContributions;
  const activeConstraintsRaw = readStringArray(scoped?.active_constraints);
  const bindingConstraintsRaw = readStringArray(scoped?.binding_constraints);
  const clampCounts =
    toRecord(scoped?.clamp_counts) ?? toRecord(scoped?.clampCounts);
  const sampledWeeks =
    readNumber(objectiveContributions?.sampled_weeks) ??
    readNumber(objectiveContributions?.sampledWeeks);
  const derivedClampPressure =
    clampCounts && sampledWeeks && sampledWeeks > 0
      ? ((readNumber(clampCounts.tss) ?? 0) +
          (readNumber(clampCounts.ctl) ?? 0)) /
        sampledWeeks
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
  if (message && message.includes(" ")) return message;
  if (message) return formatCodeAsSentence(message);
  if (code) return formatCodeAsSentence(code);
  return "Adjustment noted.";
};

const getAssessmentTargetKindLabel = (kind: string) => {
  switch (kind) {
    case "finish_time":
      return "Finish time";
    case "pace":
      return "Pace";
    case "power":
      return "Power";
    case "split":
      return "Split";
    case "completion_probability":
      return "Completion probability";
    default:
      return kind.replaceAll("_", " ");
  }
};

const GOAL_READINESS_RING_SIZE = 48;
const GOAL_READINESS_RING_STROKE = 5;

const clampReadinessScore = (value: number | undefined): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
};

const getGoalReadinessColor = (score: number): string => {
  if (score >= 80) {
    return "#16a34a";
  }

  if (score >= 60) {
    return "#d97706";
  }

  return "#dc2626";
};

function GoalReadinessRing(props: { score: number; goalTitle: string }) {
  const normalizedScore = clampReadinessScore(props.score);
  const radius = GOAL_READINESS_RING_SIZE / 2 - GOAL_READINESS_RING_STROKE / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - normalizedScore / 100);
  const readinessColor = getGoalReadinessColor(normalizedScore);

  return (
    <View
      accessible
      accessibilityLabel={`Projected readiness ${Math.round(normalizedScore)} out of 100 for ${props.goalTitle}`}
      className="relative items-center justify-center"
      style={{
        width: GOAL_READINESS_RING_SIZE,
        height: GOAL_READINESS_RING_SIZE,
      }}
    >
      <Svg width={GOAL_READINESS_RING_SIZE} height={GOAL_READINESS_RING_SIZE}>
        <Circle
          cx={GOAL_READINESS_RING_SIZE / 2}
          cy={GOAL_READINESS_RING_SIZE / 2}
          r={radius}
          stroke="#d4d4d8"
          strokeWidth={GOAL_READINESS_RING_STROKE}
          fill="none"
        />
        <Circle
          cx={GOAL_READINESS_RING_SIZE / 2}
          cy={GOAL_READINESS_RING_SIZE / 2}
          r={radius}
          stroke={readinessColor}
          strokeWidth={GOAL_READINESS_RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${GOAL_READINESS_RING_SIZE / 2} ${GOAL_READINESS_RING_SIZE / 2})`}
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-xs font-semibold text-foreground">
          {Math.round(normalizedScore)}
        </Text>
      </View>
    </View>
  );
}

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
  onResetGoals,
  showCreationConfig = true,
  projectionChart,
  configData,
  contextSummary,
  feasibilitySafetySummary,
  informationalConflicts = [],
  blockingIssues = [],
  allowBlockingIssueOverride = false,
  onAllowBlockingIssueOverrideChange,
  isPreviewPending = false,
  readinessDeltaDiagnostics,
  onConfigChange,
  onResetAvailability,
  onResetLimits,
  onResetProjectionAll,
  errors = {},
}: SinglePageFormProps) {
  const { height: windowHeight } = useWindowDimensions();
  const previewChartMaxHeight = Math.floor(windowHeight * 0.2);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(
    () => formData.goals[0]?.id ?? null,
  );
  const [editingTargetRef, setEditingTargetRef] =
    useState<EditingTargetRef | null>(null);
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
        calibration: {
          ...configData.calibration,
          readiness_composite: {
            ...configData.calibration.readiness_composite,
          },
          readiness_timeline: {
            ...configData.calibration.readiness_timeline,
          },
          envelope_penalties: {
            ...configData.calibration.envelope_penalties,
          },
          durability_penalties: {
            ...configData.calibration.durability_penalties,
          },
          no_history: {
            ...configData.calibration.no_history,
          },
          optimizer: {
            ...configData.calibration.optimizer,
          },
        },
        projectionControlV2: {
          ...configData.projectionControlV2,
          user_owned: {
            ...configData.projectionControlV2.user_owned,
          },
        },
        calibrationCompositeLocks: { ...configData.calibrationCompositeLocks },
      };
      updater(next);
      onConfigChange(next);
    },
    [configData, onConfigChange],
  );

  const selectedAvailabilityDays = configData.availabilityConfig.days.filter(
    (day) => day.windows.length > 0,
  ).length;
  const noHistoryMetadata = projectionChart?.no_history;
  const noHistoryReasons = noHistoryMetadata?.fitness_inference_reasons ?? [];
  const projectionStartingState =
    projectionChart?.constraint_summary?.starting_state;
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
  const goalAssessments = projectionChart?.goal_assessments ?? [];
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
  const goalMarkersById = useMemo(
    () =>
      new Map(
        (projectionChart?.goal_markers ?? []).map((marker) => [
          marker.id,
          marker,
        ]),
      ),
    [projectionChart?.goal_markers],
  );

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
                      Consistency:{" "}
                      {formatMarkerLabel(
                        contextSummary.recent_consistency_marker,
                      )}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Effort confidence:{" "}
                      {formatMarkerLabel(
                        contextSummary.effort_confidence_marker,
                      )}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Profile completeness:{" "}
                      {formatMarkerLabel(
                        contextSummary.profile_metric_completeness_marker,
                      )}
                    </Text>
                    {contextSummary.rationale_codes.slice(0, 4).map((code) => (
                      <Text
                        key={code}
                        className="text-xs text-muted-foreground"
                      >
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
                {noHistoryReasons.slice(0, 2).map((reason) => (
                  <Text key={reason} className="text-xs text-muted-foreground">
                    - {formatCodeAsSentence(reason)}
                  </Text>
                ))}
              </View>
            ) : null}

            {activeTab === "availability" && (
              <View className={tabPanelClass}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Availability</Text>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => onResetAvailability?.()}
                  >
                    <Text>Reset</Text>
                  </Button>
                </View>
                <Text className={helperTextClass}>
                  Set your plan start date and weekly availability.
                </Text>

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
              <View className={tabPanelClass}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Limits</Text>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => onResetLimits?.()}
                  >
                    <Text>Reset</Text>
                  </Button>
                </View>
                <View className={sectionCardClass}>
                  <NumberSliderInput
                    id="starting-ctl-assumption"
                    label="Initial CTL (fitness)"
                    value={
                      configData.startingCtlAssumption ??
                      projectionStartingState?.starting_ctl ??
                      0
                    }
                    min={0}
                    max={250}
                    step={0.5}
                    decimals={1}
                    unitLabel="CTL"
                    helperText="Higher values raise your starting fitness line before progression is projected."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.startingCtlAssumption = Number(value.toFixed(1));
                      });
                    }}
                    showCurrentValueInRange={false}
                  />
                </View>

                <View className={sectionCardClass}>
                  <Text className="text-sm">Recovery days after goal</Text>
                  <NumberSliderInput
                    id="post-goal-recovery-days"
                    value={configData.postGoalRecoveryDays}
                    min={0}
                    max={28}
                    decimals={0}
                    step={1}
                    unitLabel="days"
                    helperText="Adds easy days between goal peaks."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.postGoalRecoveryDays = value;
                      });
                    }}
                  />
                </View>

                <View className={sectionCardClass}>
                  <Text className="text-sm">Weekly load increase cap (%)</Text>
                  <PercentSliderInput
                    id="max-weekly-load-ramp"
                    value={configData.maxWeeklyTssRampPct}
                    min={0}
                    max={40}
                    step={0.25}
                    showNumericInput={false}
                    helperText="Caps weekly load growth."
                    onChange={(nextValue) => {
                      updateConfig((draft) => {
                        draft.maxWeeklyTssRampPct = nextValue;
                      });
                    }}
                  />
                </View>

                <View className={sectionCardClass}>
                  <Text className="text-sm">Weekly fitness increase cap</Text>
                  <NumberSliderInput
                    id="max-weekly-ctl-ramp"
                    label="Cap"
                    value={configData.maxCtlRampPerWeek}
                    min={0}
                    max={12}
                    step={0.1}
                    decimals={2}
                    unitLabel="CTL/wk"
                    helperText="Caps weekly CTL growth."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.maxCtlRampPerWeek = Math.max(
                          0,
                          Math.min(12, Number(value.toFixed(2))),
                        );
                      });
                    }}
                  />
                </View>
              </View>
            )}

            {activeTab === "calibration" && (
              <View className={tabPanelClass}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-semibold">Tuning</Text>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => onResetProjectionAll?.()}
                  >
                    <Text>Reset</Text>
                  </Button>
                </View>
                <View className={sectionCardClass}>
                  <NumberSliderInput
                    id="proj-ambition"
                    label="Ambition"
                    value={configData.projectionControlV2.ambition}
                    min={0}
                    max={1}
                    decimals={2}
                    step={0.01}
                    helperText="Higher values push for bigger readiness gains."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.projectionControlV2.ambition = value;
                        draft.projectionControlV2.user_owned.ambition = true;
                      });
                    }}
                  />
                  <NumberSliderInput
                    id="proj-risk-tolerance"
                    label="Risk tolerance"
                    value={configData.projectionControlV2.risk_tolerance}
                    min={0}
                    max={1}
                    decimals={2}
                    step={0.01}
                    helperText="Higher values allow riskier progression choices."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.projectionControlV2.risk_tolerance = value;
                        draft.projectionControlV2.user_owned.risk_tolerance = true;
                      });
                    }}
                  />
                  <NumberSliderInput
                    id="proj-curvature"
                    label="Curvature"
                    value={configData.projectionControlV2.curvature}
                    min={-1}
                    max={1}
                    decimals={2}
                    step={0.05}
                    helperText="Negative front-loads. Positive back-loads."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.projectionControlV2.curvature = value;
                        draft.projectionControlV2.user_owned.curvature = true;
                      });
                    }}
                  />
                  <NumberSliderInput
                    id="proj-curvature-strength"
                    label="Curvature strength"
                    value={configData.projectionControlV2.curvature_strength}
                    min={0}
                    max={1}
                    decimals={2}
                    step={0.01}
                    helperText="Controls how strongly curvature preference is enforced."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.projectionControlV2.curvature_strength = value;
                        draft.projectionControlV2.user_owned.curvature_strength = true;
                      });
                    }}
                  />
                </View>
                <View className={sectionCardClass}>
                  <NumberSliderInput
                    id="cal-preparedness-weight"
                    label="Push fitness multiplier"
                    value={configData.calibration.optimizer.preparedness_weight}
                    min={0}
                    max={30}
                    decimals={1}
                    step={0.1}
                    unitLabel="x"
                    helperText="Higher values prioritize readiness gains more strongly."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.calibration.optimizer.preparedness_weight = value;
                      });
                    }}
                  />
                  <NumberSliderInput
                    id="cal-risk-penalty"
                    label="Overload risk multiplier"
                    value={configData.calibration.optimizer.risk_penalty_weight}
                    min={0}
                    max={2}
                    decimals={2}
                    step={0.05}
                    unitLabel="x"
                    helperText="Higher values penalize fatigue-risky progression more."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.calibration.optimizer.risk_penalty_weight = value;
                      });
                    }}
                  />
                  <NumberSliderInput
                    id="cal-volatility-penalty"
                    label="Volatility multiplier"
                    value={
                      configData.calibration.optimizer.volatility_penalty_weight
                    }
                    min={0}
                    max={2}
                    decimals={2}
                    step={0.05}
                    unitLabel="x"
                    helperText="Higher values reduce week-to-week load swings."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.calibration.optimizer.volatility_penalty_weight =
                          value;
                      });
                    }}
                  />
                  <NumberSliderInput
                    id="cal-churn-penalty"
                    label="Schedule stability multiplier"
                    value={
                      configData.calibration.optimizer.churn_penalty_weight
                    }
                    min={0}
                    max={2}
                    decimals={2}
                    step={0.05}
                    unitLabel="x"
                    helperText="Higher values reduce frequent plan rewrites."
                    onChange={(value) => {
                      updateConfig((draft) => {
                        draft.calibration.optimizer.churn_penalty_weight =
                          value;
                      });
                    }}
                  />
                </View>
              </View>
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
                <Text className={helperTextClass}>
                  Review plan fit, risk, and trend changes before create.
                  Unresolved blocking issues prevent create unless you
                  explicitly acknowledge an override.
                </Text>
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
                        <Text>
                          Plan fit:{" "}
                          {formatReviewBandLabel(
                            feasibilitySafetySummary.feasibility_band,
                          )}
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
                          Risk:{" "}
                          {formatSafetyBandLabel(
                            feasibilitySafetySummary.safety_band,
                          )}
                        </Text>
                      </Badge>
                    </View>
                    {feasibilitySafetySummary.top_drivers
                      .slice(0, 3)
                      .map((driver) => (
                        <Text
                          key={driver.code}
                          className="text-xs text-muted-foreground"
                        >
                          - {formatDriverText(driver.message, driver.code)}
                        </Text>
                      ))}
                    {hasProjectionReviewDiagnostics ? (
                      <>
                        {projectionReviewDiagnostics.effectiveOptimizerSummary ? (
                          <Text className="text-xs text-muted-foreground">
                            Effective optimizer:{" "}
                            {
                              projectionReviewDiagnostics.effectiveOptimizerSummary
                            }
                            .
                          </Text>
                        ) : null}
                        {projectionReviewDiagnostics.activeConstraints ? (
                          <Text className="text-xs text-muted-foreground">
                            Active constraints:{" "}
                            {projectionReviewDiagnostics.activeConstraints}.
                          </Text>
                        ) : null}
                        {projectionReviewDiagnostics.bindingConstraints ||
                        projectionReviewDiagnostics.clampPressure !==
                          undefined ? (
                          <Text className="text-xs text-muted-foreground">
                            Binding constraints:{" "}
                            {projectionReviewDiagnostics.bindingConstraints ||
                              "none"}
                            {projectionReviewDiagnostics.clampPressure !==
                            undefined
                              ? ` | clamp pressure ${Math.round(
                                  Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      projectionReviewDiagnostics.clampPressure *
                                        100,
                                    ),
                                  ),
                                )}%`
                              : ""}
                            .
                          </Text>
                        ) : null}
                        {projectionReviewDiagnostics.objectiveSummary ? (
                          <Text className="text-xs text-muted-foreground">
                            Objective mix:{" "}
                            {projectionReviewDiagnostics.objectiveSummary}
                            {projectionReviewDiagnostics.curvatureContribution !==
                            undefined
                              ? ` | curvature ${projectionReviewDiagnostics.curvatureContribution.toFixed(2)}`
                              : ""}
                            .
                          </Text>
                        ) : projectionReviewDiagnostics.curvatureContribution !==
                          undefined ? (
                          <Text className="text-xs text-muted-foreground">
                            Curvature contribution:{" "}
                            {projectionReviewDiagnostics.curvatureContribution.toFixed(
                              2,
                            )}
                            .
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                    <Text className="text-xs text-muted-foreground">
                      The planner always prefers a safer progression that still
                      moves you toward your goals.
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      If a blocking issue remains unresolved, create stays
                      disabled until you explicitly acknowledge an override.
                    </Text>
                  </>
                ) : (
                  <Text className="text-xs text-muted-foreground">
                    Your plan check appears here once enough setup details are
                    available.
                  </Text>
                )}
              </View>
            )}

            {activeTab === "review" && readinessDeltaDiagnostics ? (
              <View className={tabPanelClass}>
                <Text className="font-semibold">
                  What changed most recently
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Readiness{" "}
                  {formatDirectionLabel(
                    readinessDeltaDiagnostics.readiness.direction,
                  )}{" "}
                  by{" "}
                  {Math.abs(readinessDeltaDiagnostics.readiness.delta).toFixed(
                    2,
                  )}{" "}
                  points ({" "}
                  {readinessDeltaDiagnostics.readiness.previous_score.toFixed(
                    2,
                  )}
                  {" -> "}
                  {readinessDeltaDiagnostics.readiness.current_score.toFixed(2)}
                  ).
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Main reason:{" "}
                  {formatDriverLabel(readinessDeltaDiagnostics.dominant_driver)}
                  .
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Training load{" "}
                  {formatDirectionLabel(
                    readinessDeltaDiagnostics.impacts.load.direction,
                  )}{" "}
                  by{" "}
                  {Math.abs(
                    readinessDeltaDiagnostics.impacts.load.delta,
                  ).toFixed(2)}{" "}
                  ({" "}
                  {readinessDeltaDiagnostics.impacts.load.previous_value.toFixed(
                    2,
                  )}
                  {" -> "}
                  {readinessDeltaDiagnostics.impacts.load.current_value.toFixed(
                    2,
                  )}
                  ).
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Fatigue{" "}
                  {formatDirectionLabel(
                    readinessDeltaDiagnostics.impacts.fatigue.direction,
                  )}{" "}
                  by{" "}
                  {Math.abs(
                    readinessDeltaDiagnostics.impacts.fatigue.delta,
                  ).toFixed(2)}{" "}
                  ({" "}
                  {readinessDeltaDiagnostics.impacts.fatigue.previous_value.toFixed(
                    2,
                  )}
                  {" -> "}
                  {readinessDeltaDiagnostics.impacts.fatigue.current_value.toFixed(
                    2,
                  )}
                  ).
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Timeline pressure{" "}
                  {formatDirectionLabel(
                    readinessDeltaDiagnostics.impacts.feasibility.direction,
                  )}{" "}
                  by{" "}
                  {Math.abs(
                    readinessDeltaDiagnostics.impacts.feasibility.delta,
                  ).toFixed(2)}{" "}
                  ({" "}
                  {readinessDeltaDiagnostics.impacts.feasibility.previous_value.toFixed(
                    2,
                  )}
                  {" -> "}
                  {readinessDeltaDiagnostics.impacts.feasibility.current_value.toFixed(
                    2,
                  )}
                  ).
                </Text>
              </View>
            ) : null}

            {activeTab === "review" && goalAssessments.length > 0 && (
              <View className={tabPanelClass}>
                <Text className="font-semibold">Goal-by-goal check</Text>
                {goalAssessments.map((assessment, index) => {
                  const marker = goalMarkersById.get(assessment.goal_id);
                  const title = marker?.name?.trim()
                    ? marker.name
                    : `Goal ${index + 1}`;
                  const fallbackReadinessScore =
                    assessment.target_scores.length > 0
                      ? assessment.target_scores.reduce(
                          (sum, target) => sum + target.score_0_100,
                          0,
                        ) / assessment.target_scores.length
                      : 0;
                  const goalReadinessScore =
                    assessment.goal_readiness_score ?? fallbackReadinessScore;
                  const confidenceHint = resolveGoalAssessmentConfidenceHint(
                    assessment,
                    projectionChart,
                  );

                  return (
                    <View
                      key={`${assessment.goal_id}-${assessment.priority}-${index}`}
                      className="gap-2 rounded-md border border-border bg-muted/20 p-2.5"
                    >
                      <View className="flex-row items-center gap-3">
                        <GoalReadinessRing
                          score={goalReadinessScore}
                          goalTitle={title}
                        />
                        <View className="flex-1 gap-1">
                          <View className="flex-row items-center justify-between gap-2">
                            <Text
                              className="flex-1 text-sm font-medium"
                              numberOfLines={1}
                            >
                              {title}
                            </Text>
                            <Badge variant="outline">
                              <Text>P{assessment.priority}</Text>
                            </Badge>
                          </View>
                          <Text className="text-xs text-muted-foreground">
                            Goal readiness (state + difficulty)
                          </Text>
                          {assessment.state_readiness_score !== undefined ? (
                            <Text className="text-xs text-muted-foreground">
                              State readiness:{" "}
                              {Math.round(assessment.state_readiness_score)} /
                              100
                            </Text>
                          ) : null}
                          {assessment.goal_alignment_loss_0_100 !==
                          undefined ? (
                            <Text className="text-xs text-muted-foreground">
                              Alignment loss:{" "}
                              {Math.round(assessment.goal_alignment_loss_0_100)}{" "}
                              / 100
                            </Text>
                          ) : null}
                          <Badge variant="outline" className="self-start">
                            <Text>
                              {formatFeasibilityBandLabel(
                                assessment.feasibility_band,
                              )}
                            </Text>
                          </Badge>
                        </View>
                      </View>
                      {assessment.target_scores.map((target, targetIndex) => (
                        <Text
                          key={`${assessment.goal_id}-${target.kind}-${targetIndex}`}
                          className="text-xs text-muted-foreground"
                        >
                          {getAssessmentTargetKindLabel(target.kind)}{" "}
                          confidence: {Math.round(target.score_0_100)} / 100
                          {target.unmet_gap !== undefined
                            ? ` | shortfall ${Number(target.unmet_gap.toFixed(2))}`
                            : ""}
                        </Text>
                      ))}
                      {assessment.conflict_notes.slice(0, 2).map((note) => (
                        <Text
                          key={`${assessment.goal_id}-${note}`}
                          className="text-xs text-muted-foreground"
                        >
                          Plan note: {formatNoteLabel(note)}
                        </Text>
                      ))}
                      {confidenceHint ? (
                        <Text className="text-xs text-muted-foreground">
                          {confidenceHint} Readiness remains the primary signal.
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {activeTab === "review" && hasBlockingIssues && (
              <View className="gap-2 rounded-lg border border-amber-300 bg-amber-100/40 p-3">
                <View className="flex-row items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-800" />
                  <Text className="font-semibold text-amber-800">
                    Blocking issues
                  </Text>
                </View>
                <Text className="text-xs text-amber-800">
                  Resolve these issues, or acknowledge an override to allow
                  create.
                </Text>
                {blockingIssues.map((conflict) => (
                  <View
                    key={`${conflict.code}-${conflict.message}`}
                    className="gap-1 rounded-md border border-amber-300 p-2"
                  >
                    <Text className="text-sm text-amber-800">
                      {conflict.message}
                    </Text>
                  </View>
                ))}
                <View className="gap-2 rounded-md border border-amber-300 p-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-medium text-amber-900">
                        Allow create despite blockers
                      </Text>
                      <Text className="text-xs text-amber-800">
                        I understand this create may violate safety or
                        feasibility guardrails.
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
              <Button
                variant="outline"
                size="sm"
                onPress={() => onResetGoals?.()}
              >
                <Text>Reset</Text>
              </Button>
            </View>
            <Text className={helperTextClass}>
              Add one or more goals and mix race, pace, power, or heart-rate
              targets.
            </Text>
            {errors.goals ? (
              <Text className="text-xs text-destructive">{errors.goals}</Text>
            ) : null}

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

            {activeGoal && activeGoalIndex >= 0 ? (
              <View className="gap-2 rounded-md border border-border bg-muted/20 p-2.5">
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
                    disabled={
                      formData.goals.length <= 1 || activeGoalIndex === 0
                    }
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

                <NumberSliderInput
                  id={`goal-priority-${activeGoal.id}`}
                  label="Goal importance"
                  value={activeGoal.priority}
                  onChange={(value) => {
                    markFieldTouched(`goals.${activeGoalIndex}.priority`);
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

                <View className="gap-2 rounded-md border border-border bg-background/70 p-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-muted-foreground">
                      Targets
                    </Text>
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
                            <Pencil
                              size={14}
                              className="text-muted-foreground"
                            />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onPress={() =>
                              removeTarget(activeGoal.id, target.id)
                            }
                            disabled={activeGoal.targets.length <= 1}
                            accessibilityLabel="Delete target"
                          >
                            <Trash2
                              size={14}
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
              </View>
            ) : null}
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
