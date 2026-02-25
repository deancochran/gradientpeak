import type { BuildDeterministicProjectionInput } from "./projectionCalculations";
import type {
  GoalTargetV2,
  InferredStateSnapshot,
  TrainingPlanCreationConfig,
} from "../schemas/training_plan_structure";
import type { NoHistoryAnchorContext } from "./projection/no-history";

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
>;

export interface BuildProjectionEngineInputShape {
  expanded_plan: ExpandedPlanInput;
  normalized_creation_config?: ProjectionRelevantCreationConfig;
  starting_ctl?: number;
  starting_atl?: number;
  prior_inferred_snapshot?: InferredStateSnapshot;
  no_history_context?: NoHistoryAnchorContext;
  disable_weekly_tss_optimizer?: boolean;
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
      target_weekly_tss_range: block.target_weekly_tss_range,
    })),
    goals: input.expanded_plan.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      target_date: goal.target_date,
      priority: goal.priority,
      targets: goal.targets,
    })),
    starting_ctl: input.starting_ctl,
    starting_atl: input.starting_atl,
    prior_inferred_snapshot: input.prior_inferred_snapshot,
    no_history_context: input.no_history_context,
    creation_config: input.normalized_creation_config
      ? {
          optimization_profile:
            input.normalized_creation_config.optimization_profile,
          post_goal_recovery_days:
            input.normalized_creation_config.post_goal_recovery_days,
          behavior_controls_v1:
            input.normalized_creation_config.behavior_controls_v1,
          calibration: input.normalized_creation_config.calibration,
        }
      : undefined,
    disable_weekly_tss_optimizer: input.disable_weekly_tss_optimizer,
  };
}
