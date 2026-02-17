import { TRPCError } from "@trpc/server";
import {
  createFromCreationConfigInputSchema,
  trainingPlanCalibrationConfigSchema,
  type CreationFeasibilitySafetySummary,
  type CreationContextSummary,
  type LoadBootstrapState,
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
    no_history?: unknown;
  },
  TBuildCreationProjectionArtifacts extends (input: {
    minimalPlan: CreateFromCreationConfigInput["minimal_plan"];
    loadBootstrapState: LoadBootstrapState;
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

  const { expandedPlan, projectionChart, projectionFeasibility } =
    input.deps.buildCreationProjectionArtifacts({
      minimalPlan: input.params.minimal_plan,
      loadBootstrapState: evaluation.loadBootstrapState,
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
  ].map((conflict) =>
    conflict.severity === "blocking"
      ? { ...conflict, severity: "warning" as const }
      : conflict,
  );

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

  return {
    ...data,
    creation_summary: {
      normalized_creation_config: evaluation.finalConfig,
      conflicts: {
        is_blocking: false,
        items: allConflicts,
      },
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
