import { stringifyCanonicalJson } from "../athlete-intelligence/canonical-json";
import {
  type CanonicalTrainingPlanStructure,
  type TrainingPlanPreferences,
  type TrainingPlanSessionEventOverrides,
  trainingPlanSchema,
} from "../schemas/training-plan-structure";
import { sha256Hex, sha256Uuid } from "../utils/sha256";
import type { DailyLoadDistributionPoint } from "./dailyLoadDistribution";
import type { DailyLoadRecommendationPrimaryFocus } from "./dailyLoadRecommendation";
import { diffDateOnlyUtcDays } from "./dateOnlyUtc";
import type { GoalAnchoredProjectionPlan } from "./goalAnchoredProjectionPlan";
import type { NormalizedSystemActivityTemplateCatalogEntry } from "./verification/activityTemplateCatalog";

export const CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION = 1 as const;

type ProjectionPoint = DailyLoadDistributionPoint & {
  event_overrides?: TrainingPlanSessionEventOverrides;
};

export type CanonicalTrainingPlanResolutionManifestEntry = {
  session_id: string;
  date: string;
  offset_days: number;
  activity_category: DailyLoadDistributionPoint["activity_category"];
  focus: DailyLoadRecommendationPrimaryFocus;
  recommended_load: number;
  phase: string | null;
  selected_activity_plan_id: string;
  selected_template_signature: string;
  event_overrides?: TrainingPlanSessionEventOverrides;
};

export type CanonicalTrainingPlanResolutionFailure = {
  date: string;
  activity_category: DailyLoadDistributionPoint["activity_category"];
  focus: DailyLoadRecommendationPrimaryFocus;
  recommended_load: number;
  phase: string | null;
  reason: "missing_exact_activity_category_focus_coverage" | "no_positive_training_days";
};

export type ProjectCanonicalTrainingPlanResult =
  | {
      status: "resolved";
      policy_version: typeof CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION;
      fingerprint: string;
      structure: CanonicalTrainingPlanStructure & { id: string };
      resolution_manifest: CanonicalTrainingPlanResolutionManifestEntry[];
      unresolved: [];
    }
  | {
      status: "unresolved";
      policy_version: typeof CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION;
      fingerprint: string;
      structure: null;
      resolution_manifest: CanonicalTrainingPlanResolutionManifestEntry[];
      unresolved: CanonicalTrainingPlanResolutionFailure[];
    };

const loadBandOrder = ["low", "moderate", "high", "very-high"] as const;
const recoveryCostOrder = ["low", "moderate", "high"] as const;
const progressionOrder = [
  "conservative",
  "foundation",
  "progressive",
  "advanced",
  "race_specific",
  "support",
] as const;

function compatibleFocus(
  focus: DailyLoadRecommendationPrimaryFocus,
  candidate: NormalizedSystemActivityTemplateCatalogEntry,
): boolean {
  switch (focus) {
    case "recovery":
      return (
        candidate.training_intent === "recovery" ||
        (candidate.training_intent === "general_maintenance" &&
          candidate.load_band === "low" &&
          candidate.recovery_cost_band === "low")
      );
    case "endurance":
      return candidate.training_intent === "aerobic_base";
    case "long_endurance":
      return candidate.training_intent === "durable_endurance";
    case "tempo":
      return (
        candidate.intensity_family === "tempo" ||
        candidate.training_intent === "threshold_development"
      );
    case "threshold":
      return candidate.training_intent === "threshold_development";
    case "vo2":
      return candidate.training_intent === "vo2max";
    case "anaerobic":
      return candidate.session_archetype === "anaerobic_power";
    case "race_specific":
      return candidate.training_intent === "race_specific";
    case "strength_endurance":
    case "hypertrophy":
    case "max_strength":
    case "power":
      return candidate.training_intent === "strength_support";
    case "mobility":
    case "mixed_conditioning":
      return candidate.training_intent === "general_maintenance";
    case "rest":
      return false;
  }
}

function desiredLoadBand(load: number): (typeof loadBandOrder)[number] {
  if (load < 35) return "low";
  if (load < 70) return "moderate";
  if (load < 105) return "high";
  return "very-high";
}

function desiredProgressionIndex(phase: string | null): number {
  switch (phase) {
    case "base":
      return progressionOrder.indexOf("foundation");
    case "build":
      return progressionOrder.indexOf("progressive");
    case "peak":
      return progressionOrder.indexOf("advanced");
    case "taper":
    case "recovery":
      return progressionOrder.indexOf("conservative");
    default:
      return progressionOrder.indexOf("foundation");
  }
}

function phaseForDate(plan: GoalAnchoredProjectionPlan, date: string): string | null {
  return (
    plan.blocks.find((block) => block.start_date <= date && block.end_date >= date)?.phase ?? null
  );
}

function rankCandidates(input: {
  candidates: NormalizedSystemActivityTemplateCatalogEntry[];
  load: number;
  phase: string | null;
}) {
  const desiredLoad = loadBandOrder.indexOf(desiredLoadBand(input.load));
  const desiredRecovery = input.phase === "recovery" || input.phase === "taper" ? 0 : 1;
  const desiredProgression = desiredProgressionIndex(input.phase);
  return [...input.candidates].sort((left, right) => {
    const comparisons = [
      Math.abs(loadBandOrder.indexOf(left.load_band) - desiredLoad) -
        Math.abs(loadBandOrder.indexOf(right.load_band) - desiredLoad),
      Math.abs(recoveryCostOrder.indexOf(left.recovery_cost_band) - desiredRecovery) -
        Math.abs(recoveryCostOrder.indexOf(right.recovery_cost_band) - desiredRecovery),
      Math.abs(progressionOrder.indexOf(left.progression_level) - desiredProgression) -
        Math.abs(progressionOrder.indexOf(right.progression_level) - desiredProgression),
      (left.duration_seconds ?? Number.POSITIVE_INFINITY) -
        (right.duration_seconds ?? Number.POSITIVE_INFINITY),
      left.template_id.localeCompare(right.template_id),
    ];
    return comparisons.find((comparison) => comparison !== 0) ?? 0;
  });
}

function goalBlueprints(plan: GoalAnchoredProjectionPlan) {
  return plan.goals.map((goal) => ({
    title: goal.name,
    priority: goal.priority,
    target_offset_days: diffDateOnlyUtcDays(plan.start_date, goal.target_date),
    activity_category:
      goal.targets.find(
        (target): target is typeof target & { activity_category: string } =>
          "activity_category" in target && typeof target.activity_category === "string",
      )?.activity_category ?? null,
    objective: goal.targets,
  }));
}

function trainingIntentForFocus(
  focus: DailyLoadRecommendationPrimaryFocus,
): NormalizedSystemActivityTemplateCatalogEntry["training_intent"] {
  switch (focus) {
    case "recovery":
      return "recovery";
    case "endurance":
      return "aerobic_base";
    case "long_endurance":
      return "durable_endurance";
    case "tempo":
    case "threshold":
      return "threshold_development";
    case "vo2":
      return "vo2max";
    case "anaerobic":
      return "anaerobic_capacity";
    case "race_specific":
      return "race_specific";
    case "strength_endurance":
    case "hypertrophy":
    case "max_strength":
    case "power":
      return "strength_support";
    case "mobility":
    case "mixed_conditioning":
      return "general_maintenance";
    case "rest":
      return "recovery";
  }
}

function importanceForFocus(focus: DailyLoadRecommendationPrimaryFocus) {
  switch (focus) {
    case "recovery":
    case "mobility":
      return "support" as const;
    case "tempo":
    case "threshold":
    case "vo2":
    case "anaerobic":
    case "race_specific":
    case "max_strength":
    case "power":
      return "key" as const;
    default:
      return "normal" as const;
  }
}

function durationMinutes(durationSeconds: number | null | undefined): number | null {
  return durationSeconds === null || durationSeconds === undefined
    ? null
    : Math.round(durationSeconds / 60);
}

function deterministicSessionId(value: unknown): string {
  return sha256Uuid(stringifyCanonicalJson(value));
}

export function projectCanonicalTrainingPlan(input: {
  planId: string;
  preferences: TrainingPlanPreferences;
  projection: GoalAnchoredProjectionPlan;
  dailyLoadPoints: ProjectionPoint[];
  candidates: NormalizedSystemActivityTemplateCatalogEntry[];
}): ProjectCanonicalTrainingPlanResult {
  const points = input.dailyLoadPoints
    .map((point, sourceIndex) => ({ point, sourceIndex }))
    .filter(({ point }) => point.recommended_load > 0 && point.primary_focus !== "rest")
    .sort(
      (left, right) =>
        left.point.date.localeCompare(right.point.date) ||
        stringifyCanonicalJson(left.point).localeCompare(stringifyCanonicalJson(right.point)) ||
        left.sourceIndex - right.sourceIndex,
    );
  const resolutionManifest: CanonicalTrainingPlanResolutionManifestEntry[] = [];
  const unresolved: CanonicalTrainingPlanResolutionFailure[] = [];

  for (const [pointOrdinal, { point }] of points.entries()) {
    const phase = phaseForDate(input.projection, point.date);
    const compatible = input.candidates.filter(
      (candidate) =>
        candidate.activity_category === point.activity_category &&
        compatibleFocus(point.primary_focus, candidate),
    );
    const selected = rankCandidates({
      candidates: compatible,
      load: point.recommended_load,
      phase,
    })[0];
    if (!selected) {
      unresolved.push({
        date: point.date,
        activity_category: point.activity_category,
        focus: point.primary_focus,
        recommended_load: point.recommended_load,
        phase,
        reason: "missing_exact_activity_category_focus_coverage",
      });
      continue;
    }
    resolutionManifest.push({
      session_id: deterministicSessionId({
        plan_id: input.planId,
        point,
        selected_activity_plan_id: selected.template_id,
        selected_template_signature: selected.structure_signature,
        point_ordinal: pointOrdinal,
      }),
      date: point.date,
      offset_days: diffDateOnlyUtcDays(input.projection.start_date, point.date),
      activity_category: point.activity_category,
      focus: point.primary_focus,
      recommended_load: point.recommended_load,
      phase,
      selected_activity_plan_id: selected.template_id,
      selected_template_signature: selected.structure_signature,
      ...(point.event_overrides ? { event_overrides: point.event_overrides } : {}),
    });
  }

  const fingerprintPayload = {
    policy_version: CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION,
    plan_id: input.planId,
    preferences: input.preferences,
    projection: input.projection,
    daily_load_points: input.dailyLoadPoints,
    candidates: [...input.candidates].sort((left, right) =>
      stringifyCanonicalJson(left).localeCompare(stringifyCanonicalJson(right)),
    ),
    resolution_manifest: resolutionManifest,
    unresolved,
  };
  const fingerprint = `v1:sha256:${sha256Hex(stringifyCanonicalJson(fingerprintPayload))}`;
  if (unresolved.length > 0 || resolutionManifest.length === 0) {
    return {
      status: "unresolved",
      policy_version: CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION,
      fingerprint,
      structure: null,
      resolution_manifest: resolutionManifest,
      unresolved:
        unresolved.length > 0
          ? unresolved
          : [
              {
                date: input.projection.start_date,
                activity_category: "other",
                focus: "rest",
                recommended_load: 0,
                phase: null,
                reason: "no_positive_training_days",
              },
            ],
    };
  }

  const selectedCandidateById = new Map(
    input.candidates.map((candidate) => [candidate.template_id, candidate]),
  );
  const blueprints = goalBlueprints(input.projection);
  const structure = trainingPlanSchema.parse({
    id: input.planId,
    version: 1,
    activity_category: [...new Set(points.map(({ point }) => point.activity_category))].sort(),
    plan_preferences: input.preferences,
    goal_blueprints: blueprints,
    sessions: resolutionManifest.map((entry) => ({
      id: entry.session_id,
      offset_days: entry.offset_days,
      activity_plan_id: entry.selected_activity_plan_id,
      demand: {
        activity_category: entry.activity_category,
        training_intent: trainingIntentForFocus(entry.focus),
        target_duration_minutes: durationMinutes(
          selectedCandidateById.get(entry.selected_activity_plan_id)?.duration_seconds,
        ),
        target_common_load: entry.recommended_load,
        importance: importanceForFocus(entry.focus),
      },
      ...(entry.event_overrides ? { event_overrides: entry.event_overrides } : {}),
    })),
  });

  return {
    status: "resolved",
    policy_version: CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION,
    fingerprint,
    structure,
    resolution_manifest: resolutionManifest,
    unresolved: [],
  };
}
