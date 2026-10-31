import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import type {
  InferredStateSnapshot,
  TrainingPlanCreationConfig,
  TrainingPlanGoalTarget,
} from "../schemas/training-plan-structure";
import type { DailyLoadDistributionSchedulingConstraints } from "./dailyLoadDistribution";
import type { DailyLoadRecommendationSession } from "./dailyLoadRecommendation";
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
    target_weekly_load_range?: { min: number; max: number };
  }>;
  goals: Array<{
    id?: string;
    name: string;
    target_date: string;
    priority?: number;
    targets?: TrainingPlanGoalTarget[];
  }>;
};

type ProjectionRelevantCreationConfig = Pick<
  Pick<
    TrainingPlanCreationConfig,
    "optimization_profile" | "post_goal_recovery_days" | "behavior_controls"
  >,
  "optimization_profile" | "post_goal_recovery_days" | "behavior_controls"
> &
  Partial<Pick<TrainingPlanCreationConfig, "calibration" | "availability_config" | "constraints">>;

export interface BuildProjectionEngineInputShape {
  expanded_plan: ExpandedPlanInput;
  normalized_creation_config?: ProjectionRelevantCreationConfig;
  starting_longTermLoad?: number;
  starting_recentLoad?: number;
  prior_inferred_snapshot?: InferredStateSnapshot;
  preference_profile?: AthletePreferenceProfile;
  planned_sessions?: DailyLoadRecommendationSession[];
  scheduling_constraints?: DailyLoadDistributionSchedulingConstraints;
  no_history_context?: NoHistoryAnchorContext;
  disable_weekly_load_optimizer?: boolean;
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
        ...(day.max_sessions === undefined ? {} : { maxSessions: day.max_sessions }),
      })),
    ),
    ...(constraints?.hard_rest_days === undefined
      ? {}
      : { hardRestDays: constraints.hard_rest_days }),
    ...optionalProperty("minSessionsPerWeek", constraints?.min_sessions_per_week),
    ...optionalProperty("maxSessionsPerWeek", constraints?.max_sessions_per_week),
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
      ...optionalProperty("target_weekly_load_range", block.target_weekly_load_range),
    })),
    goals: input.expanded_plan.goals.map((goal) => ({
      name: goal.name,
      target_date: goal.target_date,
      ...optionalProperty("id", goal.id),
      ...optionalProperty("priority", goal.priority),
      ...optionalProperty("targets", goal.targets),
    })),
    ...optionalProperty("starting_longTermLoad", input.starting_longTermLoad),
    ...optionalProperty("starting_recentLoad", input.starting_recentLoad),
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
            behavior_controls: input.normalized_creation_config.behavior_controls,
            ...(input.normalized_creation_config.calibration === undefined
              ? {}
              : { calibration: input.normalized_creation_config.calibration }),
          }
        : undefined,
    ),
    ...optionalProperty("disable_weekly_load_optimizer", input.disable_weekly_load_optimizer),
  };
}
