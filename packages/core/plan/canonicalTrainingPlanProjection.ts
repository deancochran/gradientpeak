import {
  type CanonicalTrainingPlanStructure,
  type TrainingPlanSessionEventOverrides,
  trainingPlanSchema,
} from "../schemas/training_plan_structure";
import type { DailyLoadDistributionPoint } from "./dailyLoadDistribution";
import type { DailyLoadRecommendationPrimaryFocus } from "./dailyLoadRecommendation";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";
import type { GoalAnchoredProjectionPlan } from "./goalAnchoredProjectionPlan";
import { deterministicUuidFromSeed } from "./normalizeGoalInput";
import type { NormalizedSystemActivityTemplateCatalogEntry } from "./verification/activityTemplateCatalog";

export const CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION = 1 as const;

type ProjectionPoint = DailyLoadDistributionPoint & {
  event_overrides?: TrainingPlanSessionEventOverrides;
};

export type CanonicalTrainingPlanResolutionManifestEntry = {
  date: string;
  offset_days: number;
  sport: DailyLoadDistributionPoint["activity_category"];
  focus: DailyLoadRecommendationPrimaryFocus;
  recommended_load_tss: number;
  phase: string | null;
  selected_activity_plan_id: string;
  selected_template_signature: string;
};

export type CanonicalTrainingPlanResolutionFailure = {
  date: string;
  sport: DailyLoadDistributionPoint["activity_category"];
  focus: DailyLoadRecommendationPrimaryFocus;
  recommended_load_tss: number;
  phase: string | null;
  reason: "missing_exact_sport_focus_coverage" | "no_positive_training_days";
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

export function projectCanonicalTrainingPlan(input: {
  planId: string;
  projection: GoalAnchoredProjectionPlan;
  dailyLoadPoints: ProjectionPoint[];
  candidates: NormalizedSystemActivityTemplateCatalogEntry[];
}): ProjectCanonicalTrainingPlanResult {
  const points = input.dailyLoadPoints
    .filter((point) => point.recommended_load_tss > 0 && point.primary_focus !== "rest")
    .sort((left, right) => left.date.localeCompare(right.date));
  const resolutionManifest: CanonicalTrainingPlanResolutionManifestEntry[] = [];
  const unresolved: CanonicalTrainingPlanResolutionFailure[] = [];

  for (const point of points) {
    const phase = phaseForDate(input.projection, point.date);
    const compatible = input.candidates.filter(
      (candidate) =>
        candidate.sport === point.activity_category &&
        compatibleFocus(point.primary_focus, candidate),
    );
    const selected = rankCandidates({
      candidates: compatible,
      load: point.recommended_load_tss,
      phase,
    })[0];
    if (!selected) {
      unresolved.push({
        date: point.date,
        sport: point.activity_category,
        focus: point.primary_focus,
        recommended_load_tss: point.recommended_load_tss,
        phase,
        reason: "missing_exact_sport_focus_coverage",
      });
      continue;
    }
    resolutionManifest.push({
      date: point.date,
      offset_days: diffDateOnlyUtcDays(input.projection.start_date, point.date),
      sport: point.activity_category,
      focus: point.primary_focus,
      recommended_load_tss: point.recommended_load_tss,
      phase,
      selected_activity_plan_id: selected.template_id,
      selected_template_signature: selected.structure_signature,
    });
  }

  const fingerprintPayload = {
    policy_version: CANONICAL_TRAINING_PLAN_PROJECTION_POLICY_VERSION,
    resolution_manifest: resolutionManifest,
    unresolved,
  };
  const fingerprint = deterministicUuidFromSeed(
    `canonical-training-plan-projection|${JSON.stringify(fingerprintPayload)}`,
  );
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
                sport: "other",
                focus: "rest",
                recommended_load_tss: 0,
                phase: null,
                reason: "no_positive_training_days",
              },
            ],
    };
  }

  const pointByDate = new Map(points.map((point) => [point.date, point]));
  const blueprints = goalBlueprints(input.projection);
  const durationWeeks = Math.max(
    1,
    Math.ceil(
      (diffDateOnlyUtcDays(input.projection.start_date, input.projection.end_date) + 1) / 7,
    ),
  );
  const weeklySessionCount = Math.max(
    1,
    Math.min(14, Math.round(resolutionManifest.length / durationWeeks)),
  );
  const preferredWeekdays = [
    ...new Set(
      resolutionManifest.map((entry) => new Date(`${entry.date}T00:00:00.000Z`).getUTCDay()),
    ),
  ].sort((left, right) => left - right);
  const structure = trainingPlanSchema.parse({
    id: input.planId,
    version: 1,
    sport: [...new Set(points.map((point) => point.activity_category))].sort(),
    durationWeeks: {
      recommended: durationWeeks,
    },
    goal_blueprints: blueprints,
    builder_planning_snapshot: {
      version: 1,
      plan_preferences: {
        duration_weeks: durationWeeks,
        weekly_session_count: weeklySessionCount,
        target_weekly_hours: null,
        rest_days_per_week: null,
      },
      scheduling: {
        start_date: input.projection.start_date,
        preferred_weekdays: preferredWeekdays,
      },
      goal_context: {
        selected_goals: blueprints.map((goal) => ({
          title: goal.title,
          target_offset_days: goal.target_offset_days ?? null,
          target_date:
            goal.target_offset_days === undefined
              ? null
              : addDaysDateOnlyUtc(input.projection.start_date, goal.target_offset_days),
          priority: goal.priority,
          activity_category: goal.activity_category ?? null,
          objective: goal.objective ?? null,
        })),
      },
    },
    sessions: resolutionManifest.map((entry) => ({
      offset_days: entry.offset_days,
      activity_plan_id: entry.selected_activity_plan_id,
      ...(pointByDate.get(entry.date)?.event_overrides
        ? { event_overrides: pointByDate.get(entry.date)?.event_overrides }
        : {}),
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
