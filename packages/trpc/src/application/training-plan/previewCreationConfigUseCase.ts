import {
  buildPreviewReadinessSnapshot,
  buildReadinessDeltaDiagnostics,
  inferredStateSnapshotSchema,
  previewCreationConfigInputSchema,
  type OverridePolicy,
  type CreationFeasibilitySafetySummary,
  type CreationContextSummary,
  type InferredStateSnapshot,
  type LoadBootstrapState,
  type ProjectionConstraintSummary,
  type ReadinessDeltaDiagnostics,
  type PreviewReadinessSnapshot,
  type TrainingPlanCreationConfig,
} from "@repo/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { TrainingPlanRepository } from "../../repositories";

type PreviewCreationConfigInput = z.infer<
  typeof previewCreationConfigInputSchema
> & {
  prior_inferred_snapshot?: InferredStateSnapshot;
};

type CreationConflictItem = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  field_paths: string[];
  suggestions: string[];
};

type OverrideAudit = {
  request: {
    requested: boolean;
    allow_blocking_conflicts: boolean;
    scope: "objective_risk_budget" | null;
    reason: string | null;
  };
  effective: {
    enabled: boolean;
    overridden_conflict_codes: string[];
    unresolved_blocking_conflict_codes: string[];
    rationale_codes: string[];
  };
};

const OVERRIDABLE_BLOCKING_CONFLICT_CODES = new Set([
  "post_goal_recovery_overlaps_next_goal",
  "post_goal_recovery_compresses_next_goal_prep",
]);

function evaluateOverrideAudit(input: {
  conflicts: CreationConflictItem[];
  overridePolicy?: OverridePolicy;
}): { isBlocking: boolean; audit: OverrideAudit } {
  const blockingConflicts = input.conflicts.filter(
    (conflict) => conflict.severity === "blocking",
  );
  const overridableBlockingConflictCodes = blockingConflicts
    .filter((conflict) =>
      OVERRIDABLE_BLOCKING_CONFLICT_CODES.has(conflict.code),
    )
    .map((conflict) => conflict.code);

  const overrideRequested =
    input.overridePolicy?.allow_blocking_conflicts === true;
  const overrideEffectiveCodes = overrideRequested
    ? overridableBlockingConflictCodes
    : [];

  const unresolvedBlockingConflictCodes = blockingConflicts
    .map((conflict) => conflict.code)
    .filter((code) => !overrideEffectiveCodes.includes(code));

  const rationaleCodes: string[] = [];
  if (blockingConflicts.length === 0) {
    rationaleCodes.push("no_blocking_conflicts");
  }
  if (!overrideRequested && blockingConflicts.length > 0) {
    rationaleCodes.push("override_not_requested");
  }
  if (overrideRequested) {
    rationaleCodes.push("override_scope_objective_risk_budget");
    if (overrideEffectiveCodes.length > 0) {
      rationaleCodes.push(
        "override_applied_to_objective_risk_budget_conflicts",
      );
    } else {
      rationaleCodes.push(
        "override_requested_without_overridable_blocking_conflicts",
      );
    }
  }
  if (unresolvedBlockingConflictCodes.length > 0) {
    rationaleCodes.push("non_overridable_invariant_blocking_conflicts_remain");
  }

  return {
    isBlocking: unresolvedBlockingConflictCodes.length > 0,
    audit: {
      request: {
        requested: overrideRequested,
        allow_blocking_conflicts: overrideRequested,
        scope: input.overridePolicy?.scope ?? null,
        reason: input.overridePolicy?.reason ?? null,
      },
      effective: {
        enabled: overrideEffectiveCodes.length > 0,
        overridden_conflict_codes: overrideEffectiveCodes,
        unresolved_blocking_conflict_codes: unresolvedBlockingConflictCodes,
        rationale_codes: rationaleCodes,
      },
    },
  };
}

type EvaluateCreationConfigResult = {
  finalConfig: TrainingPlanCreationConfig;
  contextSummary: CreationContextSummary;
  loadBootstrapState: LoadBootstrapState;
  suggestionPayload: unknown;
  conflictResolution: {
    conflicts: CreationConflictItem[];
  };
  feasibilitySummary: CreationFeasibilitySafetySummary;
};

export async function previewCreationConfigUseCase<
  TEvaluateCreationConfig extends (input: {
    supabase: SupabaseClient;
    profileId: string;
    creationInput: PreviewCreationConfigInput["creation_input"];
    asOfIso?: string;
  }) => Promise<EvaluateCreationConfigResult>,
  TProjectionChart extends {
    constraint_summary: ProjectionConstraintSummary;
    inferred_current_state?: InferredStateSnapshot;
    points: Array<{
      readiness_score?: number;
      predicted_load_tss: number;
      predicted_fatigue_atl: number;
    }>;
    readiness_score?: number;
    no_history?: unknown;
  },
  TBuildCreationProjectionArtifacts extends (input: {
    minimalPlan: PreviewCreationConfigInput["minimal_plan"];
    loadBootstrapState: LoadBootstrapState;
    priorInferredSnapshot?: InferredStateSnapshot;
    startingCtlOverride?: number;
    startingAtlOverride?: number;
    finalConfig: Awaited<ReturnType<TEvaluateCreationConfig>>["finalConfig"];
    contextSummary: Awaited<
      ReturnType<TEvaluateCreationConfig>
    >["contextSummary"];
  }) => {
    expandedPlan: {
      name: string;
      start_date: string;
      end_date: string;
      goals: unknown[];
      blocks: unknown[];
    };
    projectionChart: TProjectionChart;
    projectionFeasibility: {
      state: "feasible" | "aggressive" | "unsafe";
      reasons: string[];
    };
  },
  TBuildCreationPreviewSnapshotToken extends (input: {
    minimalPlan: PreviewCreationConfigInput["minimal_plan"];
    finalConfig: Awaited<ReturnType<TEvaluateCreationConfig>>["finalConfig"];
    loadBootstrapState: LoadBootstrapState;
    projectionConstraintSummary: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"]["constraint_summary"];
    projectionFeasibility: ReturnType<TBuildCreationProjectionArtifacts>["projectionFeasibility"];
    noHistoryMetadata?: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"]["no_history"];
  }) => string,
  TDeriveProjectionDrivenConflicts extends (input: {
    expandedPlan: ReturnType<TBuildCreationProjectionArtifacts>["expandedPlan"];
    projectionChart: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"];
    postGoalRecoveryDays: number;
  }) => CreationConflictItem[],
>(input: {
  supabase: SupabaseClient;
  profileId: string;
  params: PreviewCreationConfigInput;
  repository?: TrainingPlanRepository;
  deps: {
    enforceCreationConfigFeatureEnabled: () => void;
    enforceNoAutonomousPostCreateMutation: (
      input: PreviewCreationConfigInput["post_create_behavior"],
    ) => void;
    evaluateCreationConfig: TEvaluateCreationConfig;
    buildCreationProjectionArtifacts: TBuildCreationProjectionArtifacts;
    buildCreationPreviewSnapshotToken: TBuildCreationPreviewSnapshotToken;
    deriveProjectionDrivenConflicts: TDeriveProjectionDrivenConflicts;
    previewSnapshotVersion: string;
  };
}) {
  input.deps.enforceCreationConfigFeatureEnabled();
  input.deps.enforceNoAutonomousPostCreateMutation(
    input.params.post_create_behavior,
  );

  const evaluation = await input.deps.evaluateCreationConfig({
    supabase: input.supabase,
    profileId: input.profileId,
    creationInput: input.params.creation_input,
  });

  const repositoryPriorSnapshot = input.repository
    ? await input.repository.getPriorInferredStateSnapshot(input.profileId)
    : null;
  const priorInferredSnapshot = inferredStateSnapshotSchema
    .nullable()
    .parse(input.params.prior_inferred_snapshot ?? repositoryPriorSnapshot);

  const { expandedPlan, projectionChart, projectionFeasibility } =
    input.deps.buildCreationProjectionArtifacts({
      minimalPlan: input.params.minimal_plan,
      loadBootstrapState: evaluation.loadBootstrapState,
      priorInferredSnapshot: priorInferredSnapshot ?? undefined,
      startingCtlOverride: input.params.starting_ctl_override,
      startingAtlOverride: input.params.starting_atl_override,
      finalConfig: evaluation.finalConfig,
      contextSummary: evaluation.contextSummary,
    });

  if (projectionChart.inferred_current_state && input.repository) {
    await input.repository.persistInferredStateSnapshot({
      profileId: input.profileId,
      inferredStateSnapshot: projectionChart.inferred_current_state,
    });
  }

  const previewSnapshotToken = input.deps.buildCreationPreviewSnapshotToken({
    minimalPlan: input.params.minimal_plan,
    finalConfig: evaluation.finalConfig,
    loadBootstrapState: evaluation.loadBootstrapState,
    projectionConstraintSummary: projectionChart.constraint_summary,
    projectionFeasibility,
    noHistoryMetadata: projectionChart.no_history,
  });

  const projectionConflicts = input.deps.deriveProjectionDrivenConflicts({
    expandedPlan,
    projectionChart,
    postGoalRecoveryDays: evaluation.finalConfig.post_goal_recovery_days,
  });

  const currentPreviewSnapshot = buildPreviewReadinessSnapshot({
    projectionChart,
    projectionFeasibilityState: projectionFeasibility.state,
  });

  let readinessDeltaDiagnostics: ReadinessDeltaDiagnostics | undefined;
  const previousBaseline = input.params.preview_baseline as
    | PreviewReadinessSnapshot
    | undefined;

  if (previousBaseline && currentPreviewSnapshot) {
    readinessDeltaDiagnostics = buildReadinessDeltaDiagnostics({
      previous: previousBaseline,
      current: currentPreviewSnapshot,
    });
  }

  const allConflicts = [
    ...evaluation.conflictResolution.conflicts,
    ...projectionConflicts,
  ];

  const overrideEvaluation = evaluateOverrideAudit({
    conflicts: allConflicts,
    overridePolicy: input.params.override_policy,
  });

  return {
    normalized_creation_config: evaluation.finalConfig,
    creation_context_summary: evaluation.contextSummary,
    derived_suggestions: evaluation.suggestionPayload,
    feasibility_safety: evaluation.feasibilitySummary,
    projection_feasibility: projectionFeasibility,
    conflicts: {
      is_blocking: overrideEvaluation.isBlocking,
      items: allConflicts,
    },
    override_audit: overrideEvaluation.audit,
    plan_preview: {
      name: expandedPlan.name,
      start_date: expandedPlan.start_date,
      end_date: expandedPlan.end_date,
      goal_count: expandedPlan.goals.length,
      block_count: expandedPlan.blocks.length,
    },
    projection_chart: projectionChart,
    readiness_delta_diagnostics: readinessDeltaDiagnostics,
    preview_snapshot_baseline: currentPreviewSnapshot,
    preview_snapshot: {
      version: input.deps.previewSnapshotVersion,
      token: previewSnapshotToken,
    },
  };
}
