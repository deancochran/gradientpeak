import {
  addDaysDateOnlyUtc,
  buildProjectionEngineInput,
  buildDeterministicProjectionPayload,
  buildPreviewReadinessSnapshot,
  buildReadinessDeltaDiagnostics,
  canonicalizeMinimalTrainingPlanCreate,
  classifyCreationFeasibility,
  derivePlanTimeline,
  countAvailableTrainingDays,
  deterministicUuidFromSeed,
  diffDateOnlyUtcDays,
  formatDateOnlyUtc,
  normalizeCreationConfig,
  resolveConstraintConflicts,
  type CreationContextSummary,
  type CreationFeasibilitySafetySummary,
  type CreationNormalizationInput,
  type AthleteTrainingSettings,
  type InferredStateSnapshot,
  type ProfileGoal,
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
  profileSettings?: AthleteTrainingSettings;
  profileGoals?: ProfileGoal[];
  contextSummary?: CreationContextSummary;
  startingCtlOverride?: number;
  startingAtlOverride?: number;
  priorInferredSnapshot?: InferredStateSnapshot;
  previewBaseline?: PreviewReadinessSnapshot;
};

type ExpandedProjectionGoal = MinimalTrainingPlanCreate["goals"][number] & {
  id: string;
};

type ExpandedProjectionPlan = {
  plan_type: "periodized";
  name: string;
  start_date: string;
  end_date: string;
  fitness_progression: {
    starting_ctl: number;
    target_ctl_at_peak?: number;
  };
  activity_distribution: Record<
    string,
    {
      target_percentage: number;
    }
  >;
  blocks: Array<{
    id: string;
    name: string;
    phase: "base" | "build" | "peak" | "taper";
    start_date: string;
    end_date: string;
    goal_ids: string[];
    target_weekly_tss_range: { min: number; max: number };
    target_sessions_per_week_range: { min: number; max: number };
  }>;
  goals: ExpandedProjectionGoal[];
};

const phaseBlueprintByWeeks = {
  short: [
    { name: "Base", phase: "base", ratio: 0.5 },
    { name: "Build", phase: "build", ratio: 0.35 },
    { name: "Taper", phase: "taper", ratio: 0.15 },
  ],
  medium: [
    { name: "Base", phase: "base", ratio: 0.4 },
    { name: "Build", phase: "build", ratio: 0.4 },
    { name: "Peak", phase: "peak", ratio: 0.1 },
    { name: "Taper", phase: "taper", ratio: 0.1 },
  ],
  long: [
    { name: "Base", phase: "base", ratio: 0.35 },
    { name: "Build", phase: "build", ratio: 0.4 },
    { name: "Peak", phase: "peak", ratio: 0.15 },
    { name: "Taper", phase: "taper", ratio: 0.1 },
  ],
} as const;

function allocateBlockWeeks(totalWeeks: number, blockCount: number): number[] {
  const safeWeeks = Math.max(totalWeeks, blockCount);
  const base = Math.floor(safeWeeks / blockCount);
  const remainder = safeWeeks % blockCount;
  return Array.from(
    { length: blockCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function resolveActivityDistribution(
  goals: MinimalTrainingPlanCreate["goals"],
): ExpandedProjectionPlan["activity_distribution"] {
  const categoryCounts = new Map<string, number>();

  for (const goal of goals) {
    for (const target of goal.targets) {
      const category =
        "activity_category" in target && target.activity_category
          ? target.activity_category
          : "other";
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  if (categoryCounts.size === 0) {
    return { other: { target_percentage: 1 } };
  }

  const total = Array.from(categoryCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  const entries = Array.from(categoryCounts.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  let runningTotal = 0;
  const distribution: ExpandedProjectionPlan["activity_distribution"] = {};
  for (let index = 0; index < entries.length; index += 1) {
    const [category, count] = entries[index]!;
    const value =
      index === entries.length - 1
        ? Math.max(0, Math.round((1 - runningTotal) * 1000) / 1000)
        : Math.round((count / total) * 1000) / 1000;
    distribution[category] = { target_percentage: value };
    runningTotal += value;
  }

  return distribution;
}

export function buildExpandedPlanFromMinimalGoal(
  minimalPlan: MinimalTrainingPlanCreate,
  input?: { startingCtl?: number },
): ExpandedProjectionPlan {
  const canonicalMinimalPlan =
    canonicalizeMinimalTrainingPlanCreate(minimalPlan);
  const timeline = derivePlanTimeline({
    goals: canonicalMinimalPlan.goals,
    plan_start_date:
      canonicalMinimalPlan.plan_start_date ?? formatDateOnlyUtc(new Date()),
  });

  const goals = canonicalMinimalPlan.goals
    .map((goal, index) => ({
      ...goal,
      id: deterministicUuidFromSeed(
        `local-preview-goal|${timeline.start_date}|${goal.target_date}|${goal.name}|${index}`,
      ),
    }))
    .sort((a, b) => a.target_date.localeCompare(b.target_date));

  const planDurationDays =
    diffDateOnlyUtcDays(timeline.start_date, timeline.end_date) + 1;
  const totalWeeks = Math.max(1, Math.ceil(planDurationDays / 7));
  const phaseBlueprint =
    totalWeeks < 8
      ? phaseBlueprintByWeeks.short
      : totalWeeks < 16
        ? phaseBlueprintByWeeks.medium
        : phaseBlueprintByWeeks.long;

  const blockWeeks = allocateBlockWeeks(totalWeeks, phaseBlueprint.length);
  const startingCtl = input?.startingCtl ?? 45;
  const baselineWeeklyTss = Math.max(140, Math.round(startingCtl * 7));
  const tssMultiplierByPhase: Record<
    ExpandedProjectionPlan["blocks"][number]["phase"],
    number
  > = {
    base: 1,
    build: 1.12,
    peak: 1.05,
    taper: 0.72,
  };

  const blocks: ExpandedProjectionPlan["blocks"] = [];
  let blockStart = timeline.start_date;

  for (let index = 0; index < phaseBlueprint.length; index += 1) {
    const phase = phaseBlueprint[index]!;
    const weeks = blockWeeks[index]!;
    const isLast = index === phaseBlueprint.length - 1;
    const computedEnd = addDaysDateOnlyUtc(blockStart, weeks * 7 - 1);
    const blockEnd = isLast
      ? timeline.end_date
      : computedEnd < timeline.end_date
        ? computedEnd
        : timeline.end_date;

    const goalIds = goals
      .filter(
        (goal) =>
          goal.target_date >= blockStart && goal.target_date <= blockEnd,
      )
      .map((goal) => goal.id);

    if (isLast && goalIds.length === 0 && goals.length > 0) {
      goalIds.push(goals[goals.length - 1]!.id);
    }

    const targetWeeklyTss = Math.round(
      baselineWeeklyTss * tssMultiplierByPhase[phase.phase],
    );

    blocks.push({
      id: deterministicUuidFromSeed(
        `local-preview-block|${timeline.start_date}|${timeline.end_date}|${index}|${phase.name}`,
      ),
      name: phase.name,
      phase: phase.phase,
      start_date: blockStart,
      end_date: blockEnd,
      goal_ids: goalIds,
      target_weekly_tss_range: {
        min: Math.max(60, Math.round(targetWeeklyTss * 0.85)),
        max: Math.max(90, Math.round(targetWeeklyTss * 1.15)),
      },
      target_sessions_per_week_range:
        phase.phase === "taper" ? { min: 2, max: 4 } : { min: 3, max: 6 },
    });

    if (!isLast) {
      blockStart = addDaysDateOnlyUtc(blockEnd, 1);
    }
  }

  const peakTargetCtl =
    blocks.length > 0
      ? Math.round(
          Math.max(
            ...blocks.map(
              (block) =>
                (block.target_weekly_tss_range.min +
                  block.target_weekly_tss_range.max) /
                14,
            ),
          ),
        )
      : undefined;

  return {
    plan_type: "periodized",
    name:
      goals.length === 1
        ? `${goals[0]!.name} Plan`
        : "Multi-goal Training Plan",
    start_date: timeline.start_date,
    end_date: timeline.end_date,
    fitness_progression: {
      starting_ctl: startingCtl,
      ...(typeof peakTargetCtl === "number"
        ? { target_ctl_at_peak: peakTargetCtl }
        : {}),
    },
    activity_distribution: resolveActivityDistribution(goals),
    blocks,
    goals,
  };
}

export function computeLocalCreationPreview(
  input: LocalPreviewInput,
): LocalPreviewResult {
  const finalConfig = normalizeCreationConfig({
    ...(input.profileSettings ?? {}),
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
    risk_score: deterministicProjection.risk_score,
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
  expandedPlan: ExpandedProjectionPlan;
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
