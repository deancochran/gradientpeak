import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import type {
  GoalTargetV2,
  InferredStateSnapshot,
  TrainingPlanCreationConfig,
} from "../schemas/training_plan_structure";
import type { DailyLoadDistributionSchedulingConstraints } from "./dailyLoadDistribution";
import type { DailyRecommendedLoadSession } from "./dailyRecommendedLoad";
import type { NoHistoryAnchorContext } from "./projection/no-history";
import type { BuildDeterministicProjectionInput } from "./projectionCalculations";

type ExpandedPlanInput = {
  start_date: string;
  end_date: string;
  blocks: Array<{
    name: string;
    phase: string;
    start_date: string;
    end_date: string;
    target_weekly_tss_range?: { min: number; max: number };
  }>;
  goals: Array<{
    id?: string;
    name: string;
    target_date: string;
    priority?: number;
    targets?: GoalTargetV2[];
  }>;
};

type ProjectionRelevantCreationConfig = Pick<
  TrainingPlanCreationConfig,
  | "optimization_profile"
  | "post_goal_recovery_days"
  | "behavior_controls_v1"
  | "calibration"
  | "availability_config"
  | "constraints"
>;

export interface BuildProjectionEngineInputShape {
  expanded_plan: ExpandedPlanInput;
  normalized_creation_config?: ProjectionRelevantCreationConfig;
  starting_ctl?: number;
  starting_atl?: number;
  prior_inferred_snapshot?: InferredStateSnapshot;
  preference_profile?: AthletePreferenceProfile;
  planned_sessions?: DailyRecommendedLoadSession[];
  scheduling_constraints?: DailyLoadDistributionSchedulingConstraints;
  no_history_context?: NoHistoryAnchorContext;
  disable_weekly_tss_optimizer?: boolean;
}

function buildSchedulingConstraintsFromCreationConfig(
  config: ProjectionRelevantCreationConfig | undefined,
): DailyLoadDistributionSchedulingConstraints | undefined {
  if (!config) return undefined;

  const availabilityConfig = config.availability_config;
  const constraints = config.constraints;
  if (!availabilityConfig && !constraints) return undefined;

  return {
    ...optionalProperty(
      "availabilityDays",
      availabilityConfig?.days.map((day) => ({
        day: day.day,
        windows: day.windows,
        maxSessions: day.max_sessions,
      })),
    ),
    hardRestDays: constraints?.hard_rest_days,
    minSessionsPerWeek: constraints?.min_sessions_per_week,
    maxSessionsPerWeek: constraints?.max_sessions_per_week,
  };
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [Property in Key]?: Value } {
  if (value === undefined) {
    return {};
  }

  return { [key]: value } as { [Property in Key]?: Value };
}

/**
 * Builds the canonical deterministic projection engine input shape.
 *
 * This helper is shared between local preview and server recompute assembly
 * so both call paths feed identical engine input fields.
 */
export function buildProjectionEngineInput(
  input: BuildProjectionEngineInputShape,
): BuildDeterministicProjectionInput {
  return {
    timeline: {
      start_date: input.expanded_plan.start_date,
      end_date: input.expanded_plan.end_date,
    },
    blocks: input.expanded_plan.blocks.map((block) => ({
      name: block.name,
      phase: block.phase,
      start_date: block.start_date,
      end_date: block.end_date,
      ...optionalProperty("target_weekly_tss_range", block.target_weekly_tss_range),
    })),
    goals: input.expanded_plan.goals.map((goal) => ({
      name: goal.name,
      target_date: goal.target_date,
      ...optionalProperty("id", goal.id),
      ...optionalProperty("priority", goal.priority),
      ...optionalProperty("targets", goal.targets),
    })),
    ...optionalProperty("starting_ctl", input.starting_ctl),
    ...optionalProperty("starting_atl", input.starting_atl),
    ...optionalProperty("prior_inferred_snapshot", input.prior_inferred_snapshot),
    ...optionalProperty("preference_profile", input.preference_profile),
    ...optionalProperty("planned_sessions", input.planned_sessions),
    ...optionalProperty(
      "scheduling_constraints",
      input.scheduling_constraints ??
        buildSchedulingConstraintsFromCreationConfig(input.normalized_creation_config),
    ),
    ...optionalProperty("no_history_context", input.no_history_context),
    ...optionalProperty(
      "creation_config",
      input.normalized_creation_config
        ? {
            optimization_profile: input.normalized_creation_config.optimization_profile,
            post_goal_recovery_days: input.normalized_creation_config.post_goal_recovery_days,
            behavior_controls_v1: input.normalized_creation_config.behavior_controls_v1,
            calibration: input.normalized_creation_config.calibration,
          }
        : undefined,
    ),
    ...optionalProperty("disable_weekly_tss_optimizer", input.disable_weekly_tss_optimizer),
  };
}
