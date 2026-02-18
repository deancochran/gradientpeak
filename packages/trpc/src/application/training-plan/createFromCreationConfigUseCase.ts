import { TRPCError } from "@trpc/server";
import {
  createFromCreationConfigInputSchema,
  inferredStateSnapshotSchema,
  trainingPlanCalibrationConfigSchema,
  type OverridePolicy,
  type CreationFeasibilitySafetySummary,
  type CreationContextSummary,
  type InferredStateSnapshot,
  type LoadBootstrapState,
  type ProjectionConstraintSummary,
  type TrainingPlanCreationConfig,
} from "@repo/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { TrainingPlanRepository } from "../../repositories";

type CreateFromCreationConfigInput = z.infer<
  typeof createFromCreationConfigInputSchema
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
  conflictResolution: {
    conflicts: CreationConflictItem[];
    precedence: unknown;
  };
  feasibilitySummary: CreationFeasibilitySafetySummary;
};

export async function createFromCreationConfigUseCase<
  TEvaluateCreationConfig extends (input: {
    supabase: SupabaseClient;
    profileId: string;
    creationInput: CreateFromCreationConfigInput["creation_input"];
    asOfIso?: string;
  }) => Promise<EvaluateCreationConfigResult>,
  TProjectionChart extends {
    constraint_summary: ProjectionConstraintSummary;
    inferred_current_state?: InferredStateSnapshot;
    no_history?: unknown;
  },
  TBuildCreationProjectionArtifacts extends (input: {
    minimalPlan: CreateFromCreationConfigInput["minimal_plan"];
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
      description?: string;
      metadata?: Record<string, unknown>;
      goals: unknown[];
      blocks: unknown[];
    } & Record<string, unknown>;
    projectionChart: TProjectionChart;
    projectionFeasibility: {
      state: "feasible" | "aggressive" | "unsafe";
      reasons: string[];
    };
  },
  TBuildCreationPreviewSnapshotToken extends (input: {
    minimalPlan: CreateFromCreationConfigInput["minimal_plan"];
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
  params: CreateFromCreationConfigInput;
  repository?: TrainingPlanRepository;
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

  const expectedPreviewSnapshotToken =
    input.deps.buildCreationPreviewSnapshotToken({
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Creation preview is stale or invalid. Refresh previewCreationConfig and retry createFromCreationConfig.",
    });
  }

  const projectionConflicts = input.deps.deriveProjectionDrivenConflicts({
    expandedPlan,
    projectionChart,
    postGoalRecoveryDays: evaluation.finalConfig.post_goal_recovery_days,
  });
  const allConflicts = [
    ...evaluation.conflictResolution.conflicts,
    ...projectionConflicts,
  ];

  const overrideEvaluation = evaluateOverrideAudit({
    conflicts: allConflicts,
    overridePolicy: input.params.override_policy,
  });

  if (overrideEvaluation.isBlocking) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Creation blocked by unresolved conflicts. Resolve blocking conflicts or submit an explicit override_policy for objective/risk-budget conflicts.",
      cause: {
        blocking_conflict_codes:
          overrideEvaluation.audit.effective.unresolved_blocking_conflict_codes,
      },
    });
  }

  const planId = input.deps.randomUUID?.() ?? crypto.randomUUID();
  const calibrationSnapshot = trainingPlanCalibrationConfigSchema.parse(
    evaluation.finalConfig.calibration ?? {},
  );

  const structureWithId = {
    ...expandedPlan,
    id: planId,
    metadata: {
      ...(typeof expandedPlan.metadata === "object" && expandedPlan.metadata
        ? expandedPlan.metadata
        : {}),
      creation_calibration: {
        version: calibrationSnapshot.version,
        snapshot: calibrationSnapshot,
      },
    },
  };

  try {
    input.deps.parseTrainingPlanStructure(structureWithId);
  } catch (validationError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Generated training plan structure is invalid",
      cause: validationError,
    });
  }

  if (input.params.is_active) {
    if (input.repository) {
      await input.repository.deactivateActivePlans(input.profileId);
    } else {
      await input.supabase
        .from("training_plans")
        .update({ is_active: false })
        .eq("profile_id", input.profileId)
        .eq("is_active", true);
    }
  }

  const data = input.repository
    ? await input.repository.createTrainingPlan({
        name: expandedPlan.name,
        description: expandedPlan.description ?? null,
        structure: structureWithId,
        isActive: input.params.is_active ?? true,
        profileId: input.profileId,
      })
    : await (async () => {
        const { data, error } = await input.supabase
          .from("training_plans")
          .insert({
            name: expandedPlan.name,
            description: expandedPlan.description ?? null,
            structure: structureWithId,
            is_active: input.params.is_active ?? true,
            profile_id: input.profileId,
          })
          .select("*")
          .single();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return data;
      })();

  if (projectionChart.inferred_current_state && input.repository) {
    const createdPlanId =
      typeof (data as { id?: unknown }).id === "string"
        ? (data as { id: string }).id
        : undefined;
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
