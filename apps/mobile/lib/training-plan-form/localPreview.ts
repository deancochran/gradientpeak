import {
  addDaysDateOnlyUtc,
  buildProjectionEngineInput,
  buildDeterministicProjectionPayload,
  buildPreviewReadinessSnapshot,
  buildReadinessDeltaDiagnostics,
  classifyCreationFeasibility,
  countAvailableTrainingDays,
  deterministicUuidFromSeed,
  diffDateOnlyUtcDays,
  expandMinimalGoalToPlan,
  normalizeCreationConfig,
  resolveConstraintConflicts,
  type CreationContextSummary,
  type CreationFeasibilitySafetySummary,
  type CreationNormalizationInput,
  type InferredStateSnapshot,
  type PreviewReadinessSnapshot,
  type ProjectionChartPayload,
  type ReadinessDeltaDiagnostics,
  type MinimalTrainingPlanCreate,
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
  contextSummary?: CreationContextSummary;
  startingCtlOverride?: number;
  startingAtlOverride?: number;
  priorInferredSnapshot?: InferredStateSnapshot;
  previewBaseline?: PreviewReadinessSnapshot;
};

export function computeLocalCreationPreview(
  input: LocalPreviewInput,
): LocalPreviewResult {
  const finalConfig = normalizeCreationConfig(input.creationInput);
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
  const expandedPlan = expandMinimalGoalToPlan(input.minimalPlan, {
    startingCtl: effectiveStartingCtl,
  });

  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: finalConfig,
      starting_ctl: effectiveStartingCtl,
      starting_atl: input.startingAtlOverride,
      prior_inferred_snapshot: input.priorInferredSnapshot,
    }),
  );

  const projectionChart: ProjectionChartPayload = {
    start_date: expandedPlan.start_date,
    end_date: expandedPlan.end_date,
    points: deterministicProjection.points,
    display_points: deterministicProjection.display_points,
    goal_markers: deterministicProjection.goal_markers,
    periodization_phases: expandedPlan.blocks.map((block, index) => ({
      id: deterministicUuidFromSeed(
        `projection-phase|${expandedPlan.start_date}|${expandedPlan.end_date}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
      ),
      name: block.name,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_tss_min:
        Math.round((block.target_weekly_tss_range?.min ?? 0) * 10) / 10,
      target_weekly_tss_max:
        Math.round((block.target_weekly_tss_range?.max ?? 0) * 10) / 10,
    })),
    microcycles: deterministicProjection.microcycles.map((microcycle) => ({
      id: deterministicUuidFromSeed(
        `projection-microcycle|${expandedPlan.start_date}|${microcycle.week_start_date}|${microcycle.week_end_date}`,
      ),
      ...microcycle,
    })),
    recovery_segments: deterministicProjection.recovery_segments,
    constraint_summary: deterministicProjection.constraint_summary,
    inferred_current_state: deterministicProjection.inferred_current_state,
    no_history: toNoHistoryMetadataOrUndefined(
      deterministicProjection.no_history,
    ),
    readiness_score: deterministicProjection.readiness_score,
    readiness_confidence: deterministicProjection.readiness_confidence,
    readiness_rationale_codes:
      deterministicProjection.readiness_rationale_codes,
    capacity_envelope: deterministicProjection.capacity_envelope,
    feasibility_band: deterministicProjection.feasibility_band,
    risk_level: deterministicProjection.risk_level,
    risk_flags: deterministicProjection.risk_flags,
    caps_applied: deterministicProjection.caps_applied,
    projection_diagnostics: deterministicProjection.projection_diagnostics,
    optimization_tradeoff_summary:
      deterministicProjection.optimization_tradeoff_summary,
    goal_assessments: deterministicProjection.goal_assessments,
  };

  const projectionConflicts = deriveProjectionDrivenConflicts({
    expandedPlan,
    projectionChart,
    postGoalRecoveryDays: finalConfig.post_goal_recovery_days,
  });
  const allConflicts: LocalCreationConflict[] = [
    ...constraintResolution.conflicts,
    ...projectionConflicts,
  ];

  const projectionFeasibilityState =
    getProjectionFeasibilityState(projectionChart);
  const previewSnapshotBaseline = buildPreviewReadinessSnapshot({
    projectionChart,
    projectionFeasibilityState,
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

function getProjectionFeasibilityState(
  projectionChart: ProjectionChartPayload,
): "feasible" | "aggressive" | "unsafe" {
  const nearCapThreshold = 0.9;
  let tssNearCapWeeks = 0;
  let ctlNearCapWeeks = 0;

  for (const microcycle of projectionChart.microcycles) {
    const tssRamp = microcycle.metadata?.tss_ramp;
    const ctlRamp = microcycle.metadata?.ctl_ramp;
    if (!tssRamp || !ctlRamp) {
      continue;
    }

    if (
      !tssRamp.clamped &&
      tssRamp.previous_week_tss > 0 &&
      tssRamp.max_weekly_tss_ramp_pct > 0
    ) {
      const requestedRampPct =
        ((tssRamp.requested_weekly_tss - tssRamp.previous_week_tss) /
          tssRamp.previous_week_tss) *
        100;
      if (
        requestedRampPct >=
        tssRamp.max_weekly_tss_ramp_pct * nearCapThreshold
      ) {
        tssNearCapWeeks += 1;
      }
    }

    if (!ctlRamp.clamped && ctlRamp.max_ctl_ramp_per_week > 0) {
      if (
        ctlRamp.requested_ctl_ramp >=
        ctlRamp.max_ctl_ramp_per_week * nearCapThreshold
      ) {
        ctlNearCapWeeks += 1;
      }
    }
  }

  if (projectionChart.constraint_summary?.tss_ramp_clamp_weeks) {
    return "unsafe";
  }

  if (projectionChart.constraint_summary?.ctl_ramp_clamp_weeks) {
    return "unsafe";
  }

  if (tssNearCapWeeks > 0 || ctlNearCapWeeks > 0) {
    return "aggressive";
  }

  return "feasible";
}

function deriveProjectionDrivenConflicts(input: {
  expandedPlan: ReturnType<typeof expandMinimalGoalToPlan>;
  projectionChart: ProjectionChartPayload;
  postGoalRecoveryDays: number;
}): LocalCreationConflict[] {
  const conflicts: LocalCreationConflict[] = [];

  if (
    (input.projectionChart.constraint_summary?.tss_ramp_clamp_weeks ?? 0) > 0
  ) {
    conflicts.push({
      code: "required_tss_ramp_exceeds_cap",
      severity: "blocking",
      message:
        "Required week-to-week TSS progression exceeds current safety guardrails",
      suggestions: [
        "Lower aggressiveness or spike frequency",
        "Move one or more goals farther out",
        "Pick a less conservative optimization profile",
      ],
    });
  }

  if (
    (input.projectionChart.constraint_summary?.ctl_ramp_clamp_weeks ?? 0) > 0
  ) {
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

    const recoveryEnd = addDaysDateOnlyUtc(
      currentGoal.target_date,
      input.postGoalRecoveryDays,
    );
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

function toNoHistoryMetadataOrUndefined(
  metadata: NonNullable<ProjectionChartPayload["no_history"]>,
): ProjectionChartPayload["no_history"] | undefined {
  if (
    !metadata.projection_floor_applied &&
    !metadata.evidence_confidence &&
    !metadata.projection_feasibility
  ) {
    return undefined;
  }

  return metadata;
}
