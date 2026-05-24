import {
  type AthleteTrainingSettings,
  addDaysDateOnlyUtc,
  buildDeterministicProjectionPayload,
  buildGoalAnchoredProjectionPlan,
  buildPreviewReadinessSnapshot,
  buildProjectionChartPayloadFromDeterministicProjection,
  buildProjectionEngineInput,
  buildReadinessDeltaDiagnostics,
  type CreationContextSummary,
  type CreationFeasibilitySafetySummary,
  type CreationNormalizationInput,
  classifyCreationFeasibility,
  classifyProjectionFeasibility,
  countAvailableTrainingDays,
  diffDateOnlyUtcDays,
  type GoalAnchoredProjectionPlan,
  type InferredStateSnapshot,
  type MinimalTrainingPlanCreate,
  mapAthletePreferencesToCreationDefaults,
  normalizeCreationConfig,
  type PreviewReadinessSnapshot,
  type ProfileGoal,
  type ProjectionChartPayload,
  type ReadinessDeltaDiagnostics,
  resolveConstraintConflicts,
} from "@repo/core";

type LocalCreationConflict = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  suggestions: string[];
};

type LocalPreviewResult = {
  projectionChart: ProjectionChartPayload;
  conflicts: LocalCreationConflict[];
  feasibilitySummary?: CreationFeasibilitySafetySummary;
  readinessDeltaDiagnostics?: ReadinessDeltaDiagnostics;
  previewSnapshotBaseline: PreviewReadinessSnapshot | null;
};

type LocalPreviewInput = {
  minimalPlan: MinimalTrainingPlanCreate;
  creationInput: CreationNormalizationInput;
  profileSettings?: AthleteTrainingSettings;
  profileGoals?: ProfileGoal[];
  contextSummary?: CreationContextSummary;
  startingCtlOverride?: number;
  startingAtlOverride?: number;
  priorInferredSnapshot?: InferredStateSnapshot;
  previewBaseline?: PreviewReadinessSnapshot;
};

type ExpandedProjectionPlan = GoalAnchoredProjectionPlan;

export function buildExpandedPlanFromMinimalGoal(
  minimalPlan: MinimalTrainingPlanCreate,
  input?: { startingCtl?: number; preferenceProfile?: AthleteTrainingSettings },
): ExpandedProjectionPlan {
  return buildGoalAnchoredProjectionPlan({
    minimalPlan,
    startingCtl: input?.startingCtl,
    preferenceProfile: input?.preferenceProfile,
  });
}

export function computeLocalCreationPreview(input: LocalPreviewInput): LocalPreviewResult {
  const finalConfig = normalizeCreationConfig({
    ...(input.profileSettings
      ? mapAthletePreferencesToCreationDefaults(input.profileSettings)
      : {}),
    ...input.creationInput,
  } as CreationNormalizationInput);
  const availableTrainingDays = countAvailableTrainingDays({
    availabilityDays: finalConfig.availability_config.days,
    hardRestDays: finalConfig.constraints.hard_rest_days,
    requirePositiveMaxSessions: true,
  });

  const constraintResolution = resolveConstraintConflicts({
    availability_training_days: availableTrainingDays,
    user_constraints: finalConfig.constraints,
    locks: finalConfig.locks,
  });

  const effectiveStartingCtl = input.startingCtlOverride;
  const expandedPlan = buildExpandedPlanFromMinimalGoal(input.minimalPlan, {
    startingCtl: effectiveStartingCtl,
    preferenceProfile: input.profileSettings,
  });

  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: finalConfig,
      starting_ctl: effectiveStartingCtl,
      starting_atl: input.startingAtlOverride,
      prior_inferred_snapshot: input.priorInferredSnapshot,
      preference_profile: input.profileSettings,
    }),
  );

  const projectionChart: ProjectionChartPayload =
    buildProjectionChartPayloadFromDeterministicProjection({
      expandedPlan,
      deterministicProjection,
    });

  const projectionConflicts = deriveProjectionDrivenConflicts({
    expandedPlan,
    projectionChart,
    postGoalRecoveryDays: finalConfig.post_goal_recovery_days,
  });
  const allConflicts: LocalCreationConflict[] = [
    ...constraintResolution.conflicts,
    ...projectionConflicts,
  ];

  const projectionFeasibility = classifyProjectionFeasibility(projectionChart);
  const previewSnapshotBaseline = buildPreviewReadinessSnapshot({
    projectionChart,
    projectionFeasibilityState: projectionFeasibility.state,
  });

  const readinessDeltaDiagnostics =
    input.previewBaseline && previewSnapshotBaseline
      ? buildReadinessDeltaDiagnostics({
          previous: input.previewBaseline,
          current: previewSnapshotBaseline,
        })
      : undefined;

  const feasibilitySummary = input.contextSummary
    ? classifyCreationFeasibility({
        config: finalConfig,
        context: input.contextSummary,
        conflicts: constraintResolution.conflicts,
      })
    : undefined;

  return {
    projectionChart,
    conflicts: allConflicts,
    feasibilitySummary,
    readinessDeltaDiagnostics,
    previewSnapshotBaseline,
  };
}

function deriveProjectionDrivenConflicts(input: {
  expandedPlan: ExpandedProjectionPlan;
  projectionChart: ProjectionChartPayload;
  postGoalRecoveryDays: number;
}): LocalCreationConflict[] {
  const conflicts: LocalCreationConflict[] = [];

  if ((input.projectionChart.constraint_summary?.tss_ramp_clamp_weeks ?? 0) > 0) {
    conflicts.push({
      code: "required_tss_ramp_exceeds_cap",
      severity: "blocking",
      message: "Required week-to-week TSS progression exceeds current safety guardrails",
      suggestions: [
        "Lower aggressiveness or spike frequency",
        "Move one or more goals farther out",
        "Pick a less conservative optimization profile",
      ],
    });
  }

  if ((input.projectionChart.constraint_summary?.ctl_ramp_clamp_weeks ?? 0) > 0) {
    conflicts.push({
      code: "required_ctl_ramp_exceeds_cap",
      severity: "blocking",
      message: "Required CTL progression exceeds current safety guardrails",
      suggestions: [
        "Lower aggressiveness or increase recovery priority",
        "Extend timeline before high-priority goals",
        "Lower expected peak load requirements",
      ],
    });
  }

  const sortedGoals = [...input.expandedPlan.goals].sort((a, b) =>
    a.target_date.localeCompare(b.target_date),
  );

  for (let i = 0; i < sortedGoals.length - 1; i += 1) {
    const currentGoal = sortedGoals[i];
    const nextGoal = sortedGoals[i + 1];
    if (!currentGoal || !nextGoal) {
      continue;
    }

    const recoveryEnd = addDaysDateOnlyUtc(currentGoal.target_date, input.postGoalRecoveryDays);
    const prepDays = diffDateOnlyUtcDays(recoveryEnd, nextGoal.target_date);

    if (prepDays < 21) {
      conflicts.push({
        code:
          prepDays < 0
            ? "post_goal_recovery_overlaps_next_goal"
            : "post_goal_recovery_compresses_next_goal_prep",
        severity: "blocking",
        message:
          prepDays < 0
            ? `Post-goal recovery after ${currentGoal.name} overlaps ${nextGoal.name}`
            : `Post-goal recovery after ${currentGoal.name} leaves only ${prepDays} prep days before ${nextGoal.name}`,
        suggestions: [
          "Reduce post_goal_recovery_days",
          "Move the next goal farther out",
          "Use a more aggressive profile only when recovery can safely shorten",
        ],
      });
    }
  }

  return conflicts;
}
