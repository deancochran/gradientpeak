import {
  buildPreviewReadinessSnapshot,
  buildReadinessDeltaDiagnostics,
  previewCreationConfigInputSchema,
  type CreationFeasibilitySafetySummary,
  type CreationContextSummary,
  type LoadBootstrapState,
  type ProjectionConstraintSummary,
  type ReadinessDeltaDiagnostics,
  type PreviewReadinessSnapshot,
  type TrainingPlanCreationConfig,
} from "@repo/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type PreviewCreationConfigInput = z.infer<
  typeof previewCreationConfigInputSchema
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

  const { expandedPlan, projectionChart, projectionFeasibility } =
    input.deps.buildCreationProjectionArtifacts({
      minimalPlan: input.params.minimal_plan,
      loadBootstrapState: evaluation.loadBootstrapState,
      startingCtlOverride: input.params.starting_ctl_override,
      startingAtlOverride: input.params.starting_atl_override,
      finalConfig: evaluation.finalConfig,
      contextSummary: evaluation.contextSummary,
    });

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
  ].map((conflict) =>
    conflict.severity === "blocking"
      ? { ...conflict, severity: "warning" as const }
      : conflict,
  );

  return {
    normalized_creation_config: evaluation.finalConfig,
    creation_context_summary: evaluation.contextSummary,
    derived_suggestions: evaluation.suggestionPayload,
    feasibility_safety: evaluation.feasibilitySummary,
    projection_feasibility: projectionFeasibility,
    conflicts: {
      is_blocking: false,
      items: allConflicts,
    },
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
