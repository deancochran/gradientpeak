import {
  type CreationContextSummary,
  type CreationFeasibilitySafetySummary,
  createFromCreationConfigInputSchema,
  type InferredStateSnapshot,
  inferredStateSnapshotSchema,
  type LoadBootstrapState,
  type OverridePolicy,
  type ProjectionConstraintSummary,
  type TrainingPlanCreationConfig,
  trainingPlanCalibrationConfigSchema,
} from "@repo/core";
import { z } from "zod";
import {
  buildConflictCommitError,
  buildInvalidPayloadCommitError,
  buildStalePreviewCommitError,
} from "../../lib/errors/trainingPlanCommitErrors";
import type { TrainingPlanRepository } from "../../repositories";

type CreateFromCreationConfigInput = z.infer<typeof createFromCreationConfigInputSchema> & {
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

type ProjectionFeasibilityDiagnostics = {
  tss_ramp_near_cap_weeks: number;
  ctl_ramp_near_cap_weeks: number;
  tss_ramp_clamp_weeks: number;
  ctl_ramp_clamp_weeks: number;
  recovery_weeks: number;
};

const OVERRIDABLE_BLOCKING_CONFLICT_CODES = new Set([
  "post_goal_recovery_overlaps_next_goal",
  "post_goal_recovery_compresses_next_goal_prep",
]);

function evaluateOverrideAudit(input: {
  conflicts: CreationConflictItem[];
  overridePolicy?: OverridePolicy;
}): { isBlocking: boolean; audit: OverrideAudit } {
  const blockingConflicts = input.conflicts.filter((conflict) => conflict.severity === "blocking");
  const overridableBlockingConflictCodes = blockingConflicts
    .filter((conflict) => OVERRIDABLE_BLOCKING_CONFLICT_CODES.has(conflict.code))
    .map((conflict) => conflict.code);

  const overrideRequested = input.overridePolicy?.allow_blocking_conflicts === true;
  const overrideEffectiveCodes = overrideRequested ? overridableBlockingConflictCodes : [];

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
      rationaleCodes.push("override_applied_to_objective_risk_budget_conflicts");
    } else {
      rationaleCodes.push("override_requested_without_overridable_blocking_conflicts");
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
  globalCtlOverride?: number;
  globalAtlOverride?: number;
};

export async function createFromCreationConfigUseCase<
  TCreationContextReader,
  TEvaluateCreationConfig extends (input: {
    creationContextReader: TCreationContextReader;
    profileId: string;
    creationInput: CreateFromCreationConfigInput["creation_input"];
    asOfIso?: string;
  }) => Promise<EvaluateCreationConfigResult>,
  TExpandedPlan extends {
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
    goals: unknown[];
    blocks: unknown[];
  } & Record<string, unknown>,
  TProjectionChart extends {
    constraint_summary: ProjectionConstraintSummary;
    inferred_current_state?: InferredStateSnapshot;
    points: unknown[];
    readiness_score: number;
    readiness_confidence?: unknown;
    display_points?: unknown;
    capacity_envelope?: unknown;
    risk_flags?: unknown;
    caps_applied?: unknown;
    optimization_tradeoff_summary?: unknown;
    projection_diagnostics?: {
      effective_optimizer_config?: unknown;
      clamp_counts?: unknown;
      objective_contributions?: unknown;
    };
    no_history?: unknown;
  },
  TProjectionFeasibility extends {
    state: "feasible" | "aggressive" | "unsafe";
    reasons: string[];
    diagnostics: ProjectionFeasibilityDiagnostics;
  } & Record<string, unknown>,
  TBuildCreationProjectionArtifacts extends (input: {
    minimalPlan: CreateFromCreationConfigInput["minimal_plan"];
    loadBootstrapState: LoadBootstrapState;
    priorInferredSnapshot?: InferredStateSnapshot;
    startingCtlOverride?: number;
    startingAtlOverride?: number;
    finalConfig: Awaited<ReturnType<TEvaluateCreationConfig>>["finalConfig"];
    contextSummary: Awaited<ReturnType<TEvaluateCreationConfig>>["contextSummary"];
  }) => {
    expandedPlan: TExpandedPlan;
    projectionChart: TProjectionChart;
    projectionFeasibility: TProjectionFeasibility;
  },
  TBuildCreationPreviewSnapshotToken extends (input: {
    minimalPlan: CreateFromCreationConfigInput["minimal_plan"];
    finalConfig: Awaited<ReturnType<TEvaluateCreationConfig>>["finalConfig"];
    loadBootstrapState: LoadBootstrapState;
    projectionConstraintSummary: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"]["constraint_summary"];
    projectionFeasibility: TProjectionFeasibility;
    noHistoryMetadata?: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"]["no_history"];
  }) => string,
  TDeriveProjectionDrivenConflicts extends (input: {
    expandedPlan: TExpandedPlan;
    projectionChart: TProjectionChart;
    postGoalRecoveryDays: number;
  }) => CreationConflictItem[],
>(input: {
  creationContextReader: TCreationContextReader;
  profileId: string;
  params: CreateFromCreationConfigInput;
  repository: TrainingPlanRepository;
  deps: {
    enforceCreationConfigFeatureEnabled: () => void;
    enforceNoAutonomousPostCreateMutation: (
      input: CreateFromCreationConfigInput["post_create_behavior"],
    ) => void;
    evaluateCreationConfig: TEvaluateCreationConfig;
    buildCreationProjectionArtifacts: TBuildCreationProjectionArtifacts;
    buildCreationPreviewSnapshotToken: TBuildCreationPreviewSnapshotToken;
    deriveProjectionDrivenConflicts: TDeriveProjectionDrivenConflicts;
    throwPathValidationError: (
      message: string,
      issues: Array<{ path: Array<string | number>; message: string }>,
    ) => never;
    parseTrainingPlanStructure: (value: unknown) => void;
    randomUUID?: () => string;
  };
}) {
  input.deps.enforceCreationConfigFeatureEnabled();
  input.deps.enforceNoAutonomousPostCreateMutation(input.params.post_create_behavior);

  const evaluation = await input.deps.evaluateCreationConfig({
    creationContextReader: input.creationContextReader,
    profileId: input.profileId,
    creationInput: input.params.creation_input,
  });

  const repositoryPriorSnapshot = await input.repository.getPriorInferredStateSnapshot(
    input.profileId,
  );
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

  const expectedPreviewSnapshotToken = input.deps.buildCreationPreviewSnapshotToken({
    minimalPlan: input.params.minimal_plan,
    finalConfig: evaluation.finalConfig,
    loadBootstrapState: evaluation.loadBootstrapState,
    projectionConstraintSummary: projectionChart.constraint_summary,
    projectionFeasibility,
    noHistoryMetadata: projectionChart.no_history,
  });

  if (
    input.params.preview_snapshot_token &&
    input.params.preview_snapshot_token !== expectedPreviewSnapshotToken
  ) {
    throw buildStalePreviewCommitError({
      operation: "createFromCreationConfig",
      providedToken: input.params.preview_snapshot_token,
    });
  }

  const projectionConflicts = input.deps.deriveProjectionDrivenConflicts({
    expandedPlan,
    projectionChart,
    postGoalRecoveryDays: evaluation.finalConfig.post_goal_recovery_days,
  });
  const allConflicts = [...evaluation.conflictResolution.conflicts, ...projectionConflicts];

  const overrideEvaluation = evaluateOverrideAudit({
    conflicts: allConflicts,
    overridePolicy: input.params.override_policy,
  });

  if (overrideEvaluation.isBlocking) {
    throw buildConflictCommitError({
      operation: "createFromCreationConfig",
      blockingConflictCodes: overrideEvaluation.audit.effective.unresolved_blocking_conflict_codes,
    });
  }

  const planId = input.deps.randomUUID?.() ?? crypto.randomUUID();
  const calibrationSnapshot = trainingPlanCalibrationConfigSchema.parse(
    evaluation.finalConfig.calibration ?? {},
  );
  const creationConfigSnapshot = evaluation.finalConfig;
  const creationFormSnapshot = input.params.minimal_plan;

  const structureWithId = {
    ...expandedPlan,
    id: planId,
    metadata: {
      ...(typeof expandedPlan.metadata === "object" && expandedPlan.metadata
        ? expandedPlan.metadata
        : {}),
      creation_config_snapshot: creationConfigSnapshot,
      creation_form_snapshot: creationFormSnapshot,
      creation_calibration: {
        version: calibrationSnapshot.version,
        snapshot: calibrationSnapshot,
      },
    },
  };

  try {
    input.deps.parseTrainingPlanStructure(structureWithId);
  } catch (validationError) {
    throw buildInvalidPayloadCommitError({
      operation: "createFromCreationConfig",
      reason: "generated_plan_failed_schema_validation",
      details: {
        validation_error:
          validationError instanceof Error ? validationError.message : "unknown_validation_error",
      },
    });
  }

  const data = await input.repository.createTrainingPlan({
    name: expandedPlan.name,
    description: expandedPlan.description ?? null,
    structure: structureWithId,
    profileId: input.profileId,
  });

  if (projectionChart.inferred_current_state) {
    const createdPlanId =
      typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : undefined;
    await input.repository.persistInferredStateSnapshot({
      profileId: input.profileId,
      trainingPlanId: createdPlanId,
      inferredStateSnapshot: projectionChart.inferred_current_state,
    });
  }

  return {
    ...data,
    creation_summary: {
      normalized_creation_config: evaluation.finalConfig,
      conflicts: {
        is_blocking: overrideEvaluation.isBlocking,
        items: allConflicts,
      },
      override_audit: overrideEvaluation.audit,
      projection_feasibility: projectionFeasibility,
      projection_chart: projectionChart,
      feasibility_safety: evaluation.feasibilitySummary,
      context_summary: evaluation.contextSummary,
      calibration: {
        version: calibrationSnapshot.version,
        snapshot: calibrationSnapshot,
      },
    },
  };
}
