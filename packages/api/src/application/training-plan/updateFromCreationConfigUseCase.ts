import {
  type CreationContextSummary,
  type CreationFeasibilitySafetySummary,
  type createFromCreationConfigInputSchema,
  type InferredStateSnapshot,
  inferredStateSnapshotSchema,
  type LoadBootstrapState,
  type OverridePolicy,
  type ProjectionConstraintSummary,
  type TrainingPlanCreationConfig,
  trainingPlanCalibrationConfigSchema,
} from "@repo/core";
import type { TrainingPlanInsert } from "@repo/db";
import type { z } from "zod";
import {
  buildConflictCommitError,
  buildNotFoundCommitError,
  buildStalePreviewCommitError,
  buildStaleStructureCommitError,
} from "../../lib/errors/trainingPlanCommitErrors";
import type { TrainingPlanRepository } from "../../repositories";

type UpdateFromCreationConfigInput = z.infer<typeof createFromCreationConfigInputSchema> & {
  plan_id: string;
  expectedStructureHash: string;
  prior_inferred_snapshot?: InferredStateSnapshot;
};

type CreationConflictItem = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  field_paths: string[];
  suggestions: string[];
};

type ProjectionFeasibilityDiagnostics = {
  tss_ramp_near_cap_weeks: number;
  ctl_ramp_near_cap_weeks: number;
  tss_ramp_clamp_weeks: number;
  ctl_ramp_clamp_weeks: number;
  recovery_weeks: number;
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

type EvaluateCreationConfigResult = {
  finalConfig: TrainingPlanCreationConfig;
  contextSummary: CreationContextSummary;
  loadBootstrapState: LoadBootstrapState;
  conflictResolution: {
    conflicts: CreationConflictItem[];
    precedence: unknown;
  };
  feasibilitySummary: CreationFeasibilitySafetySummary;
  globalCtlOverride?: number;
  globalAtlOverride?: number;
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

export async function updateFromCreationConfigUseCase<
  TCreationContextReader,
  TEvaluateCreationConfig extends (input: {
    creationContextReader: TCreationContextReader;
    profileId: string;
    creationInput: UpdateFromCreationConfigInput["creation_input"];
    asOfIso?: string;
  }) => Promise<EvaluateCreationConfigResult>,
  TExpandedPlan extends {
    name: string;
    description?: string;
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
    daily_load_points?: unknown[];
  },
  TProjectionFeasibility extends {
    state: "feasible" | "aggressive" | "unsafe";
    reasons: string[];
    diagnostics: ProjectionFeasibilityDiagnostics;
  } & Record<string, unknown>,
  TBuildCreationProjectionArtifacts extends (input: {
    minimalPlan: UpdateFromCreationConfigInput["minimal_plan"];
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
    minimalPlan: UpdateFromCreationConfigInput["minimal_plan"];
    finalConfig: Awaited<ReturnType<TEvaluateCreationConfig>>["finalConfig"];
    loadBootstrapState: LoadBootstrapState;
    projectionConstraintSummary: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"]["constraint_summary"];
    projectionFeasibility: TProjectionFeasibility;
    noHistoryMetadata?: ReturnType<TBuildCreationProjectionArtifacts>["projectionChart"]["no_history"];
    canonicalResolutionFingerprint: string;
  }) => string,
  TDeriveProjectionDrivenConflicts extends (input: {
    expandedPlan: TExpandedPlan;
    projectionChart: TProjectionChart;
    postGoalRecoveryDays: number;
  }) => CreationConflictItem[],
>(input: {
  creationContextReader: TCreationContextReader;
  profileId: string;
  params: UpdateFromCreationConfigInput;
  repository: TrainingPlanRepository;
  deps: {
    enforceCreationConfigFeatureEnabled: () => void;
    enforceNoAutonomousPostCreateMutation: (
      input: UpdateFromCreationConfigInput["post_create_behavior"],
    ) => void;
    evaluateCreationConfig: TEvaluateCreationConfig;
    buildCreationProjectionArtifacts: TBuildCreationProjectionArtifacts;
    buildCreationPreviewSnapshotToken: TBuildCreationPreviewSnapshotToken;
    deriveProjectionDrivenConflicts: TDeriveProjectionDrivenConflicts;
    resolveCanonicalTrainingPlan: (input: {
      planId: string;
      projection: TExpandedPlan;
      dailyLoadPoints: NonNullable<TProjectionChart["daily_load_points"]>;
    }) => Promise<{
      fingerprint: string;
      policy_version: number;
      resolution_manifest: unknown[];
      structure: Record<string, unknown>;
    }>;
    persistCanonicalTrainingPlanUpdate: (input: {
      activityPlanIds: string[];
      values: Parameters<NonNullable<TrainingPlanRepository["updateTrainingPlan"]>>[0];
    }) => ReturnType<NonNullable<TrainingPlanRepository["updateTrainingPlan"]>>;
  };
}) {
  const repository = input.repository as TrainingPlanRepository & {
    getOwnedTrainingPlan: NonNullable<TrainingPlanRepository["getOwnedTrainingPlan"]>;
    updateTrainingPlan: NonNullable<TrainingPlanRepository["updateTrainingPlan"]>;
  };

  input.deps.enforceCreationConfigFeatureEnabled();
  input.deps.enforceNoAutonomousPostCreateMutation(input.params.post_create_behavior);

  const existingPlan = await repository.getOwnedTrainingPlan({
    id: input.params.plan_id,
    profileId: input.profileId,
  });

  if (!existingPlan) {
    throw buildNotFoundCommitError({
      operation: "updateFromCreationConfig",
    });
  }
  const currentStructureHash = existingPlan.structure_hash ?? input.params.expectedStructureHash;
  if (currentStructureHash !== input.params.expectedStructureHash) {
    throw buildStaleStructureCommitError({
      operation: "updateFromCreationConfig",
      expectedStructureHash: input.params.expectedStructureHash,
      currentStructureHash,
    });
  }

  const evaluation = await input.deps.evaluateCreationConfig({
    creationContextReader: input.creationContextReader,
    profileId: input.profileId,
    creationInput: input.params.creation_input,
  });

  const priorInferredSnapshot = inferredStateSnapshotSchema
    .nullable()
    .parse(input.params.prior_inferred_snapshot ?? null);

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

  const canonicalResolution = await input.deps.resolveCanonicalTrainingPlan({
    planId: existingPlan.id,
    projection: expandedPlan,
    dailyLoadPoints: projectionChart.daily_load_points ?? [],
  });
  const expectedPreviewSnapshotToken = input.deps.buildCreationPreviewSnapshotToken({
    minimalPlan: input.params.minimal_plan,
    finalConfig: evaluation.finalConfig,
    loadBootstrapState: evaluation.loadBootstrapState,
    projectionConstraintSummary: projectionChart.constraint_summary,
    projectionFeasibility,
    noHistoryMetadata: projectionChart.no_history,
    canonicalResolutionFingerprint: canonicalResolution.fingerprint,
  });

  if (
    input.params.preview_snapshot_token &&
    input.params.preview_snapshot_token !== expectedPreviewSnapshotToken
  ) {
    throw buildStalePreviewCommitError({
      operation: "updateFromCreationConfig",
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
      operation: "updateFromCreationConfig",
      blockingConflictCodes: overrideEvaluation.audit.effective.unresolved_blocking_conflict_codes,
    });
  }

  const calibrationSnapshot = trainingPlanCalibrationConfigSchema.parse(
    evaluation.finalConfig.calibration ?? {},
  );
  // Invariant: edit-save only updates training_plans; it never writes activities.
  const updatedPlan = await input.deps.persistCanonicalTrainingPlanUpdate({
    activityPlanIds: canonicalResolution.resolution_manifest.map(
      (entry) => (entry as { selected_activity_plan_id: string }).selected_activity_plan_id,
    ),
    values: {
      id: existingPlan.id,
      expectedStructureHash: input.params.expectedStructureHash,
      profileId: input.profileId,
      name: expandedPlan.name,
      description: expandedPlan.description ?? null,
      structure: canonicalResolution.structure as TrainingPlanInsert["structure"] as Record<
        string,
        unknown
      >,
    },
  });

  return {
    ...updatedPlan,
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
      canonical_projection: {
        fingerprint: canonicalResolution.fingerprint,
        policy_version: canonicalResolution.policy_version,
        resolution_manifest: canonicalResolution.resolution_manifest,
      },
    },
  };
}
