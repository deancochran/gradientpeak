import { TRPCError } from "@trpc/server";
import {
  createFromCreationConfigInputSchema,
  type CreationFeasibilitySafetySummary,
  type CreationContextSummary,
  type ProjectionConstraintSummary,
  type TrainingPlanCreationConfig,
} from "@repo/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { TrainingPlanRepository } from "../../repositories";

type CreateFromCreationConfigInput = z.infer<
  typeof createFromCreationConfigInputSchema
>;

type CreationConflictItem = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  field_paths: string[];
  suggestions: string[];
};

type EvaluateCreationConfigResult = {
  finalConfig: TrainingPlanCreationConfig;
  contextSummary: CreationContextSummary;
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
    no_history?: unknown;
  },
  TBuildCreationProjectionArtifacts extends (input: {
    minimalPlan: CreateFromCreationConfigInput["minimal_plan"];
    estimatedCurrentCtl: number;
    startingCtlOverride?: number;
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
    estimatedCurrentCtl: number;
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
    estimateCurrentCtl: (
      supabase: SupabaseClient,
      profileId: string,
    ) => Promise<number>;
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
  const estimatedCurrentCtl = await input.deps.estimateCurrentCtl(
    input.supabase,
    input.profileId,
  );

  const { expandedPlan, projectionChart, projectionFeasibility } =
    input.deps.buildCreationProjectionArtifacts({
      minimalPlan: input.params.minimal_plan,
      estimatedCurrentCtl,
      startingCtlOverride: input.params.starting_ctl_override,
      finalConfig: evaluation.finalConfig,
      contextSummary: evaluation.contextSummary,
    });

  const expectedPreviewSnapshotToken =
    input.deps.buildCreationPreviewSnapshotToken({
      minimalPlan: input.params.minimal_plan,
      finalConfig: evaluation.finalConfig,
      estimatedCurrentCtl,
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

  const blockingConflicts = allConflicts.filter(
    (conflict) => conflict.severity === "blocking",
  );

  if (blockingConflicts.length > 0) {
    input.deps.throwPathValidationError(
      "Creation config has blocking conflicts",
      blockingConflicts.flatMap((conflict) =>
        conflict.field_paths.map((fieldPath) => ({
          path: fieldPath.split("."),
          message: `${conflict.message}. ${conflict.suggestions.join(" | ")}`,
        })),
      ),
    );
  }

  const planId = input.deps.randomUUID?.() ?? crypto.randomUUID();
  const normalizedAt =
    evaluation.finalConfig.feasibility_safety_summary?.computed_at ??
    new Date().toISOString();

  const structureWithId = {
    ...expandedPlan,
    id: planId,
    metadata: {
      ...(expandedPlan.metadata ?? {}),
      creation_config_mvp: {
        source_of_truth: "normalized_creation_config",
        policy_version: "creation_config_mvp_v1",
        precedence_order: [
          "locked_user_values",
          "user_values",
          "confirmed_suggestions",
          "defaults",
        ],
        post_create_mutation_policy: "manual_confirmation_required",
        normalized_at: normalizedAt,
        normalized_config: evaluation.finalConfig,
        conflict_resolution: {
          is_blocking: blockingConflicts.length > 0,
          conflicts: allConflicts,
          precedence: evaluation.conflictResolution.precedence,
        },
        projection_feasibility: projectionFeasibility,
        projection_chart: projectionChart,
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

  return {
    ...data,
    creation_summary: {
      normalized_creation_config: evaluation.finalConfig,
      conflicts: {
        is_blocking: blockingConflicts.length > 0,
        items: allConflicts,
      },
      projection_feasibility: projectionFeasibility,
      projection_chart: projectionChart,
      feasibility_safety: evaluation.feasibilitySummary,
      context_summary: evaluation.contextSummary,
    },
  };
}
